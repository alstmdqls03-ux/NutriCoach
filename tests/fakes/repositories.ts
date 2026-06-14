import type {
  LogRepository, MessageRepository, ProfileRepository,
  InsertLogInput, QueryLogInput, LogRow, StoredMessage,
} from '@/lib/repositories/types';

export class InMemoryLogRepository implements LogRepository {
  rows: (LogRow & { userId: string })[] = [];
  private seq = 0;
  async insertLog(i: InsertLogInput) {
    this.rows.push({ id: `log${++this.seq}`, userId: i.userId, type: i.type, data: i.data, logged_at: i.loggedAt });
  }
  async queryLogs(i: QueryLogInput): Promise<LogRow[]> {
    return this.rows
      .filter((r) => r.userId === i.userId)
      .filter((r) => !i.type || r.type === i.type)
      .filter((r) => !i.from || r.logged_at >= i.from)
      .filter((r) => !i.to || r.logged_at <= i.to)
      .map(({ id, type, data, logged_at }) => ({ id, type, data, logged_at }));
  }
  async deleteLastLog(userId: string): Promise<boolean> {
    for (let idx = this.rows.length - 1; idx >= 0; idx--) {
      if (this.rows[idx].userId === userId) { this.rows.splice(idx, 1); return true; }
    }
    return false;
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  rows: (StoredMessage & { userId: string })[] = [];
  private seq = 0;
  async recentMessages(userId: string, limit: number) {
    return this.rows.filter((r) => r.userId === userId).slice(-limit).map(strip);
  }
  async countMessages(userId: string) {
    return this.rows.filter((r) => r.userId === userId).length;
  }
  async insertMessage(userId: string, msg: Omit<StoredMessage, 'created_at' | 'id'>) {
    this.rows.push({ ...msg, id: `m${++this.seq}`, userId, created_at: new Date(2026, 0, 1, 0, 0, this.rows.length).toISOString() });
  }
  async oldestMessages(userId: string, count: number) {
    return this.rows.filter((r) => r.userId === userId).slice(0, count).map(strip);
  }
  async deleteMessageIds(userId: string, ids: string[]) {
    this.rows = this.rows.filter((r) => !(r.userId === userId && ids.includes(r.id)));
  }
}

function strip(r: StoredMessage & { userId: string }): StoredMessage {
  const rest = { ...r } as Partial<StoredMessage & { userId: string }>;
  delete rest.userId;
  return rest as StoredMessage;
}

export class FakeProfileRepository implements ProfileRepository {
  summaries = new Map<string, string>();
  gym = new Map<string, string[]>();
  async getRollingSummary(userId: string) { return this.summaries.get(userId) ?? null; }
  async setRollingSummary(userId: string, s: string) { this.summaries.set(userId, s); }
  async getGymMachines(userId: string) { return this.gym.get(userId) ?? []; }
  async setGymMachines(userId: string, machines: string[]) { this.gym.set(userId, machines); }
}
