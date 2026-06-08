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
        occurred_at: {
          type: 'string',
          description:
            '운동한 시각(ISO 8601). 사용자가 "어제/그저께/특정일"을 말하면 현재 시각 기준으로 계산해 채워라. 오늘이면 비워둠.',
        },
      },
    },
  },
  {
    name: 'log_sleep',
    description:
      '수면 기록. 총 수면시간만 알아도(예: "7시간 잤어") 기록하라. 시각을 모른다고 되묻지 마라.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      // Nothing is strictly required: "7시간 잤어" (duration only) must save
      // without asking back. Provide whatever the user actually stated.
      required: [],
      properties: {
        bed_time: {
          type: 'string',
          description:
            '취침 시각 ISO 8601. 시각을 모르면 비우되, 사용자가 날짜(어제·6월 4일 등)를 말했으면 ' +
            '그 날짜 기준으로 채워 logged_at이 올바른 날에 들어가게 하라.',
        },
        wake_time: { type: 'string', description: '기상 시각 ISO 8601 (선택)' },
        duration_min: { type: 'integer', description: '총 수면 분. 총 시간만 말하면 여기에 채워라.' },
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
