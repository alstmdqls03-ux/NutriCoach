import type {
  ChatMessage, LLMProvider, ToolDefinition, LLMResponse,
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
  } catch {
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
}

export interface RunChatResult {
  reply: string;
  usage: { promptTokens: number; completionTokens: number };
}

export async function runChat(args: RunChatArgs): Promise<RunChatResult> {
  const { userId, userMessage, llm, logs, msgs, prof, now, maxToolRounds, contextLimit } = args;

  await msgs.insertMessage(userId, { role: 'user', content: userMessage, tool_calls: null });

  const ctx = await loadContext(msgs, prof, userId, contextLimit);
  const convo: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx.summary) },
    ...ctx.messages.map((m) => ({
      role: m.role as ChatMessage['role'],
      content: m.content,
    })),
  ];

  let promptTokens = 0;
  let completionTokens = 0;
  let finalText = '';

  for (let round = 0; round <= maxToolRounds; round++) {
    const res = await chatWithRetry(llm, convo, toolDefinitions);
    promptTokens += res.usage.promptTokens;
    completionTokens += res.usage.completionTokens;

    if (res.toolCalls.length === 0) {
      finalText = res.content ?? '';
      break;
    }

    // persist the assistant turn that requested tools
    await msgs.insertMessage(userId, {
      role: 'assistant', content: res.content, tool_calls: res.toolCalls,
    });
    convo.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });

    for (const call of res.toolCalls) {
      let toolOut: string;
      try {
        toolOut = await executeTool(call, logs, userId, now);
      } catch (e) {
        toolOut = `도구 실행 실패: ${(e as Error).message}. 원문은 보존했어요.`;
      }
      await msgs.insertMessage(userId, { role: 'tool', content: toolOut, tool_calls: null });
      convo.push({ role: 'tool', content: toolOut, toolCallId: call.id, name: call.name });
    }
    // loop continues: model now sees tool results and produces the final reply
    if (round === maxToolRounds) {
      finalText = '요청을 처리했어요.';
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
