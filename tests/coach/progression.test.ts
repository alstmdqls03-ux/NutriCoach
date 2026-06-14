import { describe, it, expect } from 'vitest';
import { nextPrescription, coldStartPrescription, lastSessionFor } from '@/lib/coach/progression';
import type { LogRow } from '@/lib/repositories/types';

describe('double progression', () => {
  it('bumps weight (+2.5 upper) and resets reps when all sets hit the top', () => {
    const p = nextPrescription('Pec_Deck', { weight_kg: 40, reps: 12, sets: 3 }, [8, 12], 'upper');
    expect(p.weight_kg).toBe(42.5);
    expect(p.repTarget).toBe(8);
    expect(p.sets).toBe(3);
    expect(p.basis).toBe('progressed');
  });

  it('bumps +5 for lower body', () => {
    const p = nextPrescription('Leg_Press', { weight_kg: 100, reps: 12, sets: 3 }, [8, 12], 'lower');
    expect(p.weight_kg).toBe(105);
    expect(p.basis).toBe('progressed');
  });

  it('holds weight and aims for the top when mid-range', () => {
    const p = nextPrescription('Pec_Deck', { weight_kg: 40, reps: 10, sets: 3 }, [8, 12], 'upper');
    expect(p.weight_kg).toBe(40);
    expect(p.repTarget).toBe(12);
    expect(p.basis).toBe('hold');
  });

  it('deloads when every set is below the bottom', () => {
    const p = nextPrescription('Pec_Deck', { weight_kg: 50, reps: 6, sets: 3 }, [8, 12], 'upper');
    expect(p.weight_kg).toBe(47.5);
    expect(p.repTarget).toBe(8);
    expect(p.basis).toBe('deload');
  });

  it('never produces a negative weight on deload', () => {
    const p = nextPrescription('X', { weight_kg: 2, reps: 4, sets: 3 }, [8, 12], 'upper');
    expect(p.weight_kg).toBe(0);
  });

  it('cold start has null weight and the log-first copy', () => {
    const p = coldStartPrescription('Pec_Deck', [8, 12]);
    expect(p.weight_kg).toBeNull();
    expect(p.repTarget).toBe(8);
    expect(p.basis).toBe('cold-start');
    expect(p.note).toMatch(/기록/);
  });
});

describe('lastSessionFor', () => {
  const aliases = { '체스트프레스': 'Machine_Bench_Press' };
  const row = (logged_at: string, data: Record<string, unknown>): LogRow => ({ id: 'x', type: 'workout', data, logged_at });

  it('returns the most recent session whose exercise maps to the id', () => {
    const logs: LogRow[] = [
      row('2026-06-13T10:00:00Z', { exercise: '체스트프레스', weight_kg: 42.5, reps: 9, sets: 3 }),
      row('2026-06-10T10:00:00Z', { exercise: '체스트프레스', weight_kg: 40, reps: 12, sets: 3 }),
    ];
    const s = lastSessionFor('Machine_Bench_Press', logs, aliases);
    expect(s).toEqual({ weight_kg: 42.5, reps: 9, sets: 3 });
  });

  it('returns null when no logged exercise maps to the id', () => {
    const logs: LogRow[] = [row('2026-06-13T10:00:00Z', { exercise: '스쿼트', weight_kg: 60, reps: 10, sets: 3 })];
    expect(lastSessionFor('Machine_Bench_Press', logs, aliases)).toBeNull();
  });
});
