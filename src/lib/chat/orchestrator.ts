import type {
  ChatMessage, LLMProvider, ToolDefinition, LLMResponse, ToolCall,
} from '@/lib/llm/types';
import type { LogRepository, MessageRepository, ProfileRepository } from '@/lib/repositories/types';
import { toolDefinitions } from '@/lib/tools/definitions';
import { executeTool } from '@/lib/tools/execute';
import { loadContext, shouldCompress, compressOldMessages } from './context';
import { buildSystemPrompt } from './prompt';
import { applySafety } from '@/lib/safety/filter';

// Spec §4: on transient LLM failure, retry exactly once before surfacing the error.
async function chatWithRetry(
  llm: LLMProvider, messages: ChatMessage[], tools: ToolDefinition[],
): Promise<LLMResponse> {
  try {
    return await llm.chat(messages, tools);
  } catch (e) {
    // Only retry transient failures (network / 429 / 5xx). A 4xx (bad request,
    // invalid schema, context too long) won't succeed on retry — fail fast.
    const status = (e as { status?: number })?.status;
    const transient = status === undefined || status === 429 || (status >= 500 && status <= 599);
    if (!transient) throw e;
    return await llm.chat(messages, tools);
  }
}

export interface RunChatArgs {
  userId: string;
  userMessage: string;
  llm: LLMProvider;
  logs: LogRepository;
  msgs: MessageRepository;
  prof: ProfileRepository;
  now: string;          // ISO timestamp for this turn
  maxToolRounds: number;
  contextLimit: number;
  tools?: ToolDefinition[];   // defaults to the full set (back-compat with tests)
}

export interface RunChatResult {
  reply: string;
  usage: { promptTokens: number; completionTokens: number };
}

export async function runChat(args: RunChatArgs): Promise<RunChatResult> {
  const { userId, userMessage, llm, logs, msgs, prof, now, maxToolRounds, contextLimit,
    tools = toolDefinitions } = args;

  await msgs.insertMessage(userId, { role: 'user', content: userMessage, tool_calls: null });

  const ctx = await loadContext(msgs, prof, userId, contextLimit);
  // Only replay clean user/assistant-text turns. Stored tool rows and
  // assistant-with-tool_calls rows would create dangling tool messages
  // (missing tool_call_id linkage) and break the OpenAI API on later turns.
  const replay = ctx.messages
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.tool_calls));
  // The current user message was just persisted above, so it's the LAST user
  // turn in `replay`. Everything before it is history. Mark historical user
  // turns as already-recorded context — otherwise the model re-calls log_* for
  // every past workout/sleep it still sees in the transcript, multiplying logs
  // on every turn (confirmed in QA: one "런지" message re-logged squat & pullup).
  const lastUserIdx = replay.map((m) => m.role).lastIndexOf('user');
  const convo: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx.summary, now) },
    ...replay.map((m, i) => ({
      role: m.role as ChatMessage['role'],
      content:
        m.role === 'user' && i !== lastUserIdx
          ? `[지난 대화 · 이미 기록됨, 다시 기록하지 말 것] ${m.content}`
          : m.content,
    })),
  ];

  let promptTokens = 0;
  let completionTokens = 0;
  let finalText = '';
  let toolRounds = 0;

  // gpt-4o-mini sometimes emits the SAME tool call more than once — twice in a
  // single assistant turn, or again on a later round — with identical
  // name+arguments. Executing each copy inserts a duplicate row (confirmed in QA:
  // "어제 밤 11시에 자서 오늘 아침 7시에 일어났어" produced 2 identical sleep logs).
  // Track which calls already ran this user-turn and drop exact repeats so the
  // model's stutter can never multiply the user's data.
  const executedToolKeys = new Set<string>();
  const toolKey = (c: ToolCall): string => {
    const args = c.arguments ?? {};
    const stable = Object.keys(args).sort().reduce(
      (o, k) => { o[k] = args[k]; return o; },
      {} as Record<string, unknown>,
    );
    return `${c.name}:${JSON.stringify(stable)}`;
  };

  // Execute one assistant turn's tool calls: drop exact-duplicate calls, persist
  // the assistant(tool_calls) row, run each tool (user-scoped), then persist +
  // replay each tool result. Deduping before persisting keeps the assistant
  // message, its tool results, and the DB consistent (one call -> one result ->
  // one row) and avoids dangling tool_call_ids on the next round.
  async function runToolCalls(res: LLMResponse): Promise<void> {
    const calls = res.toolCalls.filter((c) => {
      const key = toolKey(c);
      if (executedToolKeys.has(key)) return false;
      executedToolKeys.add(key);
      return true;
    });
    // Whole turn was a stutter (every call already ran this turn) — persist
    // nothing so we don't leave an assistant message with no tool results.
    if (calls.length === 0) return;
    await msgs.insertMessage(userId, {
      role: 'assistant', content: res.content, tool_calls: calls,
    });
    convo.push({ role: 'assistant', content: res.content, toolCalls: calls });
    for (const call of calls) {
      let toolOut: string;
      try {
        toolOut = await executeTool(call, logs, userId, now);
      } catch (e) {
        toolOut = `도구 실행 실패: ${(e as Error).message}. 원문은 보존했어요.`;
      }
      await msgs.insertMessage(userId, { role: 'tool', content: toolOut, tool_calls: null });
      convo.push({ role: 'tool', content: toolOut, toolCallId: call.id, name: call.name });
    }
  }

  while (true) {
    const res = await chatWithRetry(llm, convo, tools);
    promptTokens += res.usage.promptTokens;
    completionTokens += res.usage.completionTokens;

    if (res.toolCalls.length === 0) {
      finalText = res.content ?? '';
      break;
    }

    // Always execute the requested tools so a log is never silently dropped —
    // even on the final allowed round.
    await runToolCalls(res);
    toolRounds++;

    if (toolRounds >= maxToolRounds) {
      // Hit the tool-round cap. Tools above already ran (data saved); stop with
      // an honest message instead of claiming everything is done.
      finalText = '기록했어요. 더 처리할 게 남았으면 한 가지씩 다시 말씀해 주세요.';
      break;
    }
  }

  const safeReply = applySafety(userMessage, finalText);
  await msgs.insertMessage(userId, { role: 'assistant', content: safeReply, tool_calls: null });

  const count = await msgs.countMessages(userId);
  if (shouldCompress(count, contextLimit)) {
    await compressOldMessages(msgs, prof, userId, count - contextLimit,
      (text) => `(요약) ${text.slice(0, 300)}`);
  }

  return { reply: safeReply, usage: { promptTokens, completionTokens } };
}
