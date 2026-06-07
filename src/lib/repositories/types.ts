export interface LogRow {
  id: string;
  type: 'workout' | 'sleep';
  data: Record<string, unknown>;
  logged_at: string; // ISO
}

export interface InsertLogInput {
  userId: string;
  type: 'workout' | 'sleep';
  data: Record<string, unknown>;
  loggedAt: string; // ISO
}

export interface QueryLogInput {
  userId: string;
  type?: 'workout' | 'sleep';
  from?: string; // ISO
  to?: string;   // ISO
}

export interface LogRepository {
  insertLog(input: InsertLogInput): Promise<void>;
  queryLogs(input: QueryLogInput): Promise<LogRow[]>;
}

export interface StoredMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: unknown | null;
  created_at: string;
}

export interface MessageRepository {
  recentMessages(userId: string, limit: number): Promise<StoredMessage[]>;
  countMessages(userId: string): Promise<number>;
  insertMessage(userId: string, msg: Omit<StoredMessage, 'created_at'>): Promise<void>;
  oldestMessages(userId: string, count: number): Promise<StoredMessage[]>;
  deleteMessages(userId: string, beforeIsoExclusive: string): Promise<void>;
}

export interface ProfileRepository {
  getRollingSummary(userId: string): Promise<string | null>;
  setRollingSummary(userId: string, summary: string): Promise<void>;
}
