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
}

export class InMemoryMessageRepository implements MessageRepository {
  rows: (StoredMessage & { userId: string })[] = [];
  async recentMessages(userId: string, limit: number) {
    return this.rows.filter((r) => r.userId === userId).slice(-limit).map(strip);
  }
  async countMessages(userId: string) {
    return this.rows.filter((r) => r.userId === userId).length;
  }
  async insertMessage(userId: string, msg: Omit<StoredMessage, 'created_at'>) {
    this.rows.push({ ...msg, userId, created_at: new Date(2026, 0, 1, 0, 0, this.rows.length).toISOString() });
  }
  async oldestMessages(userId: string, count: number) {
    return this.rows.filter((r) => r.userId === userId).slice(0, count).map(strip);
  }
  async deleteMessages(userId: string, beforeIsoExclusive: string) {
    this.rows = this.rows.filter((r) => !(r.userId === userId && r.created_at < beforeIsoExclusive));
  }
}

function strip(r: StoredMessage & { userId: string }): StoredMessage {
  const { userId, ...rest } = r; return rest;
}

export class FakeProfileRepository implements ProfileRepository {
  summaries = new Map<string, string>();
  async getRollingSummary(userId: string) { return this.summaries.get(userId) ?? null; }
  async setRollingSummary(userId: string, s: string) { this.summaries.set(userId, s); }
}
