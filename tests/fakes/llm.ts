import type { ChatMessage, LLMProvider, LLMResponse, ToolDefinition } from '@/lib/llm/types';

// Returns queued responses in order; records calls for assertions.
export class ScriptedLLMProvider implements LLMProvider {
  calls: { messages: ChatMessage[]; tools: ToolDefinition[] }[] = [];
  constructor(private queue: LLMResponse[]) {}
  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    this.calls.push({ messages, tools });
    const next = this.queue.shift();
    if (!next) throw new Error('ScriptedLLMProvider: no more responses queued');
    return next;
  }
}
