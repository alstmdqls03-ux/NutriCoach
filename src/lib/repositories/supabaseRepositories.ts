import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LogRepository, MessageRepository, ProfileRepository,
  InsertLogInput, QueryLogInput, LogRow, StoredMessage,
  MachineAliasRepository, AliasRow,
} from './types';

export function supabaseLogRepository(sb: SupabaseClient): LogRepository {
  return {
    async insertLog(input: InsertLogInput) {
      const { error } = await sb.from('logs').insert({
        user_id: input.userId, type: input.type,
        data: input.data, logged_at: input.loggedAt,
      });
      if (error) throw new Error(`insertLog failed: ${error.message}`);
    },
    async queryLogs(input: QueryLogInput): Promise<LogRow[]> {
      let q = sb.from('logs').select('id,type,data,logged_at')
        .eq('user_id', input.userId);
      if (input.type) q = q.eq('type', input.type);
      if (input.from) q = q.gte('logged_at', input.from);
      if (input.to) q = q.lte('logged_at', input.to);
      const { data, error } = await q.order('logged_at', { ascending: false }).limit(100);
      if (error) throw new Error(`queryLogs failed: ${error.message}`);
      return (data ?? []) as LogRow[];
    },
    async deleteLastLog(userId: string): Promise<boolean> {
      // Most recently *created* row (created_at), per the design's "마지막" rule.
      const { data, error } = await sb.from('logs')
        .select('id').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`deleteLastLog read failed: ${error.message}`);
      if (!data) return false;
      const del = await sb.from('logs').delete().eq('user_id', userId).eq('id', data.id);
      if (del.error) throw new Error(`deleteLastLog failed: ${del.error.message}`);
      return true;
    },
  };
}

export function supabaseMessageRepository(sb: SupabaseClient): MessageRepository {
  return {
    async recentMessages(userId, limit): Promise<StoredMessage[]> {
      const { data, error } = await sb.from('messages')
        .select('id,role,content,tool_calls,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error(`recentMessages failed: ${error.message}`);
      return ((data ?? []) as StoredMessage[]).reverse();
    },
    async countMessages(userId): Promise<number> {
      const { count, error } = await sb.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw new Error(`countMessages failed: ${error.message}`);
      return count ?? 0;
    },
    async insertMessage(userId, msg) {
      const { error } = await sb.from('messages').insert({
        user_id: userId, role: msg.role,
        content: msg.content, tool_calls: msg.tool_calls,
      });
      if (error) throw new Error(`insertMessage failed: ${error.message}`);
    },
    async oldestMessages(userId, count): Promise<StoredMessage[]> {
      const { data, error } = await sb.from('messages')
        .select('id,role,content,tool_calls,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }).limit(count);
      if (error) throw new Error(`oldestMessages failed: ${error.message}`);
      return (data ?? []) as StoredMessage[];
    },
    async deleteMessageIds(userId, ids) {
      if (ids.length === 0) return;
      const { error } = await sb.from('messages').delete()
        .eq('user_id', userId).in('id', ids);
      if (error) throw new Error(`deleteMessageIds failed: ${error.message}`);
    },
  };
}

export function supabaseProfileRepository(sb: SupabaseClient): ProfileRepository {
  return {
    async getRollingSummary(userId): Promise<string | null> {
      const { data, error } = await sb.from('profiles')
        .select('rolling_summary').eq('id', userId).maybeSingle();
      if (error) throw new Error(`getRollingSummary failed: ${error.message}`);
      return data?.rolling_summary ?? null;
    },
    async setRollingSummary(userId, summary) {
      const { error } = await sb.from('profiles')
        .update({ rolling_summary: summary }).eq('id', userId);
      if (error) throw new Error(`setRollingSummary failed: ${error.message}`);
    },
    async getGymMachines(userId): Promise<string[]> {
      const { data, error } = await sb.from('profiles')
        .select('gym_machines').eq('id', userId).maybeSingle();
      if (error) throw new Error(`getGymMachines failed: ${error.message}`);
      return (data?.gym_machines as string[] | null) ?? [];
    },
    async setGymMachines(userId, machines) {
      const { error } = await sb.from('profiles')
        .update({ gym_machines: machines }).eq('id', userId);
      if (error) throw new Error(`setGymMachines failed: ${error.message}`);
    },
    async setOnboarding(userId, data) {
      const { error } = await sb.from('profiles').update(data).eq('id', userId);
      if (error) throw new Error(`setOnboarding failed: ${error.message}`);
    },
  };
}

export function supabaseMachineAliasRepository(sb: SupabaseClient): MachineAliasRepository {
  return {
    async listAliases(userId): Promise<AliasRow[]> {
      const { data, error } = await sb.from('machine_aliases')
        .select('id,alias,exercise_id').eq('user_id', userId);
      if (error) throw new Error(`listAliases failed: ${error.message}`);
      return (data ?? []) as AliasRow[];
    },
    async addAlias(userId, alias, exerciseId) {
      const { error } = await sb.from('machine_aliases')
        .upsert({ user_id: userId, alias, exercise_id: exerciseId },
                { onConflict: 'user_id,alias' });
      if (error) throw new Error(`addAlias failed: ${error.message}`);
    },
    async removeAlias(userId, id) {
      const { error } = await sb.from('machine_aliases')
        .delete().eq('user_id', userId).eq('id', id);
      if (error) throw new Error(`removeAlias failed: ${error.message}`);
    },
  };
}
