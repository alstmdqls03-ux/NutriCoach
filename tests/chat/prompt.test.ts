import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/lib/chat/prompt';

const NOW = '2026-06-08T05:00:00.000Z'; // Mon 2026-06-08 14:00 KST

describe('buildSystemPrompt', () => {
  it('injects pre-computed relative-date anchors so the model never computes weekdays', () => {
    const p = buildSystemPrompt(null, NOW, 'Asia/Seoul');
    expect(p).toContain('오늘=2026-06-08(월)');
    expect(p).toContain('이번 주(월~일)=2026-06-08~2026-06-14');
    expect(p).toContain('지난 주(월~일)=2026-06-01~2026-06-07');
    expect(p).toContain('최근 7일=2026-06-02~2026-06-08');
    expect(p).toContain('어제=2026-06-07');
  });

  it('labels the rolling summary as already-recorded, do-not-relog memory', () => {
    const p = buildSystemPrompt('지난주 풀업 10회 3세트', NOW, 'Asia/Seoul');
    expect(p).toContain('이미 기록된 과거');
    expect(p).toContain('다시 기록하지 마라');
    // the summary text itself is still present for answering questions
    expect(p).toContain('풀업 10회 3세트');
  });

  it('tells the model to log only the latest message and to query (not guess) for reads', () => {
    const p = buildSystemPrompt(null, NOW);
    expect(p).toContain('가장 최근 메시지');
    expect(p).toContain('수면만 말하면 수면만'); // no phantom cross-logging
    expect(p).toContain('기억·추측으로 답하지 말고 반드시 조회');
  });

  it('permits duration-only sleep without asking back', () => {
    const p = buildSystemPrompt(null, NOW);
    expect(p).toContain('duration_min');
    expect(p).toContain('되묻지 마라');
  });

  it('omits the computed date anchors when no timestamp is given', () => {
    const p = buildSystemPrompt(null);
    expect(p).not.toContain('현재 시각:');
    expect(p).not.toContain('이번 주(월~일)=');
  });
});
