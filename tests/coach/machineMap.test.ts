import { describe, it, expect } from 'vitest';
import { normalizeMachineName, resolveMachine } from '@/lib/coach/machineMap';

const aliases = { '펙덱': 'Pec_Deck', '시티드로우': 'Seated_Cable_Row', '랫풀다운': 'Lat_Pulldown' };

describe('machine mapping', () => {
  it('normalizes spacing and case', () => {
    expect(normalizeMachineName('  Pec  Deck ')).toBe('pec deck');
  });
  it('resolves a known Korean alias to an exercise id', () => {
    expect(resolveMachine('펙덱', aliases)).toBe('Pec_Deck');
  });
  it('resolves regardless of surrounding spaces', () => {
    expect(resolveMachine(' 시티드로우 ', aliases)).toBe('Seated_Cable_Row');
  });
  it('returns null for an unmapped machine (never guesses)', () => {
    expect(resolveMachine('처음보는머신', aliases)).toBeNull();
  });
});
