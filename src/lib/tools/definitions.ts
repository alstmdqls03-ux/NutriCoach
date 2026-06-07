import type { ToolDefinition } from '@/lib/llm/types';

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'log_workout',
    description:
      '운동 1세트 기록. 단위나 수치가 불명확하면 호출하지 말고 사용자에게 되물어라.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['exercise', 'weight_kg', 'reps', 'sets'],
      properties: {
        exercise: { type: 'string', description: '운동 이름 (예: 벤치프레스)' },
        weight_kg: { type: 'number', description: '무게(kg). lbs면 kg로 환산해 채워라.' },
        reps: { type: 'integer', description: '반복 수' },
        sets: { type: 'integer', description: '세트 수' },
        rpe: { type: 'number', description: '주관적 강도 1-10 (선택)' },
        pain: { type: 'string', description: '통증 부위/정도 (선택)' },
      },
    },
  },
  {
    name: 'log_sleep',
    description: '수면 기록. 취침/기상 시각이 불명확하면 되물어라.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['bed_time', 'wake_time'],
      properties: {
        bed_time: { type: 'string', description: '취침 시각 ISO 8601' },
        wake_time: { type: 'string', description: '기상 시각 ISO 8601' },
        duration_min: { type: 'integer', description: '총 수면 분 (선택)' },
        satisfaction: { type: 'integer', description: '수면 만족도 1-5 (선택)' },
      },
    },
  },
  {
    name: 'query_logs',
    description: '사용자 본인 기록 조회. 예: "이번 주 운동 어땠어?"',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {
        type: { type: 'string', enum: ['workout', 'sleep'] },
        date_from: { type: 'string', description: '조회 시작 ISO 8601 (선택)' },
        date_to: { type: 'string', description: '조회 끝 ISO 8601 (선택)' },
      },
    },
  },
];
