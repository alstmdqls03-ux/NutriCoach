import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '@/lib/tools/definitions';

describe('toolDefinitions', () => {
  it('exposes exactly the three MVP tools', () => {
    expect(toolDefinitions.map((t) => t.name).sort())
      .toEqual(['log_sleep', 'log_workout', 'query_logs']);
  });

  it('log_workout requires exercise, weight_kg, reps, sets', () => {
    const def = toolDefinitions.find((t) => t.name === 'log_workout')!;
    const params = def.parameters as { required: string[]; properties: Record<string, unknown> };
    expect(params.required).toEqual(['exercise', 'weight_kg', 'reps', 'sets']);
    expect(Object.keys(params.properties)).toContain('rpe');
    expect(Object.keys(params.properties)).toContain('pain');
  });
});
