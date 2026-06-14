import { describe, it, expect } from 'vitest';
import { resolveTargetMuscle } from '@/lib/coach/muscles';

describe('resolveTargetMuscle', () => {
  it('maps 가슴 to chest', () => {
    expect(resolveTargetMuscle('가슴')).toContain('chest');
  });
  it('maps 등 to back muscles', () => {
    expect(resolveTargetMuscle('등')).toEqual(expect.arrayContaining(['lats', 'middle back']));
  });
  it('maps 하체 to multiple leg muscles', () => {
    const r = resolveTargetMuscle('하체');
    expect(r).toEqual(expect.arrayContaining(['quadriceps', 'hamstrings', 'glutes']));
  });
  it('trims and tolerates spacing', () => {
    expect(resolveTargetMuscle('  가슴 ')).toContain('chest');
  });
  it('returns [] for an unknown term', () => {
    expect(resolveTargetMuscle('우주')).toEqual([]);
  });
});
