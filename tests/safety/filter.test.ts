import { describe, it, expect } from 'vitest';
import { detectPainSignal, applySafety, SAFETY_DISCLAIMER } from '@/lib/safety/filter';

describe('safety filter', () => {
  it('detects pain/injury keywords', () => {
    expect(detectPainSignal('어깨가 아파서 벤치 멈췄어')).toBe(true);
    expect(detectPainSignal('허리 통증 있어')).toBe(true);
    expect(detectPainSignal('무릎 삐끗했어')).toBe(true);
  });

  it('does not flag normal logging', () => {
    expect(detectPainSignal('벤치 60kg 8회 3세트 했어')).toBe(false);
  });

  it('appends disclaimer exactly once when pain present', () => {
    const out = applySafety('어깨 아파', '가볍게 쉬는 걸 추천해요.');
    expect(out).toContain(SAFETY_DISCLAIMER);
    expect(out.split(SAFETY_DISCLAIMER)).toHaveLength(2); // appears once
  });

  it('leaves response untouched when no pain', () => {
    const out = applySafety('벤치 60 했어', '잘했어요!');
    expect(out).toBe('잘했어요!');
  });
});
