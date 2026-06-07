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
        exercise: string; weight_kg: number; reps: number; sets: number; rpe?: number; pain?: string;
      };
      await logs.insertLog({ userId, type: 'workout', data: a, loggedAt: nowIso });
      return `운동을 기록했어요: ${a.exercise} ${a.weight_kg}kg ${a.reps}회 ${a.sets}세트`;
    }
    case 'log_sleep': {
      const a = call.arguments as {
        bed_time: string; wake_time: string; duration_min?: number; satisfaction?: number;
      };
      await logs.insertLog({ userId, type: 'sleep', data: a, loggedAt: a.bed_time });
      return `수면을 기록했어요: ${a.bed_time} ~ ${a.wake_time}`;
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
