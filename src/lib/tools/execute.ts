import type { ToolCall } from '@/lib/llm/types';
import type { LogRepository } from '@/lib/repositories/types';

export async function executeTool(
  call: ToolCall,
  logs: LogRepository,
  userId: string,
  nowIso: string,
): Promise<string> {
  switch (call.name) {
    case 'log_workout': {
      const a = call.arguments as {
        exercise: string; weight_kg: number; reps: number; sets: number;
        rpe?: number; pain?: string; occurred_at?: string;
      };
      // Honor a past date the user stated ("어제/그저께"); else default to now.
      const occ = Date.parse(a.occurred_at ?? '');
      const loggedAt = Number.isNaN(occ) ? nowIso : new Date(occ).toISOString();
      await logs.insertLog({ userId, type: 'workout', data: a, loggedAt });
      return `운동을 기록했어요: ${a.exercise} ${a.weight_kg}kg ${a.reps}회 ${a.sets}세트`;
    }
    case 'log_sleep': {
      const a = call.arguments as {
        bed_time?: string; wake_time?: string; duration_min?: number; satisfaction?: number;
      };
      // logged_at is timestamptz NOT NULL. bed_time may be missing, time-only,
      // or a relative phrase — fall back to now so the sleep is never dropped.
      const parsed = Date.parse(a.bed_time ?? '');
      const loggedAt = Number.isNaN(parsed) ? nowIso : new Date(parsed).toISOString();
      await logs.insertLog({ userId, type: 'sleep', data: a, loggedAt });
      return `수면을 기록했어요: ${a.bed_time ?? '시간 미상'} ~ ${a.wake_time ?? '시간 미상'}`;
    }
    case 'query_logs': {
      const a = call.arguments as { type?: 'workout' | 'sleep'; date_from?: string; date_to?: string };
      const rows = await logs.queryLogs({ userId, type: a.type, from: a.date_from, to: a.date_to });
      return JSON.stringify(rows);
    }
    default:
      throw new Error(`unknown tool: ${call.name}`);
  }
}
