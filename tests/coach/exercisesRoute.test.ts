import { describe, it, expect } from 'vitest';
import { handleExercises } from '@/lib/coach/handlers';

describe('handleExercises', () => {
  it('400s when muscle is missing', () => {
    expect(handleExercises(null).status).toBe(400);
  });
  it('returns choices for a known muscle', () => {
    const r = handleExercises('가슴');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body) && r.body.length).toBeGreaterThan(0);
    if (Array.isArray(r.body)) expect(r.body[0]).toHaveProperty('id');
  });
  it('returns an empty list for an unknown muscle', () => {
    const r = handleExercises('우주');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
});
