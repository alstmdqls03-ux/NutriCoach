import { describe, it, expect } from 'vitest';
import { detectPainSignal, applySafety, SAFETY_DISCLAIMER } from '@/lib/safety/filter';

describe('safety filter', () => {
  it('detects pain/injury keywords', () => {
    expect(detectPainSignal('어깨가 아파서 벤치 멈췄어')).toBe(true);
    expect(detectPainSignal('허리 통증 있어')).toBe(true);
    expect(detectPainSignal('무릎 삐끗했어')).toBe(true);
  });

  it('detects past-tense and adverb-separated pain (QA p4 gap)', () => {
    // Past tense 아팠 — the live miss that produced no disclaimer.
    expect(detectPainSignal('오늘 스쿼트했는데 무릎이 좀 아팠어')).toBe(true);
    expect(detectPainSignal('어제부터 허리가 아팠다')).toBe(true);
    // Adnominal / noun forms.
    expect(detectPainSignal('아픈 곳이 있어')).toBe(true);
    expect(detectPainSignal('어깨 아픔이 심해')).toBe(true);
    // Adverb between body part and pain word.
    expect(detectPainSignal('무릎이 많이 아팠어')).toBe(true);
  });

  it('does not flag normal logging', () => {
    expect(detectPainSignal('벤치 60kg 8회 3세트 했어')).toBe(false);
    expect(detectPainSignal('오늘 스쿼트 100kg 5회 5세트 했어')).toBe(false);
    expect(detectPainSignal('이번 주 운동 어땠어?')).toBe(false);
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

  it('does not double-append when the model already volunteered a disclaimer', () => {
    const modelReply = '무리하지 마세요. 증상이 지속되면 전문가 상담을 받는 것이 좋습니다.';
    const out = applySafety('어깨 아파', modelReply);
    expect(out).toBe(modelReply); // no second disclaimer appended
    expect((out.match(/전문가/g) || []).length).toBe(1);
  });
});
