import { describe, it, expect } from 'vitest';
import { coachToolDefinitions } from '@/lib/tools/definitions';

describe('coach tool set', () => {
  it('exposes query_logs only — no LLM write path on the coach surface', () => {
    const names = coachToolDefinitions.map((t) => t.name);
    expect(names).toEqual(['query_logs']);
  });
});
