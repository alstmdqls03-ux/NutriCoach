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
  deleteLastLog(userId: string): Promise<boolean>;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: unknown | null;
  created_at: string;
}

export interface MessageRepository {
  recentMessages(userId: string, limit: number): Promise<StoredMessage[]>;
  countMessages(userId: string): Promise<number>;
  insertMessage(userId: string, msg: Omit<StoredMessage, 'created_at' | 'id'>): Promise<void>;
  oldestMessages(userId: string, count: number): Promise<StoredMessage[]>;
  deleteMessageIds(userId: string, ids: string[]): Promise<void>;
}

export interface OnboardingData {
  display_name?: string;
  goals?: string[];
  units?: string;
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  activity_level?: string;
}

export interface ProfileRepository {
  getRollingSummary(userId: string): Promise<string | null>;
  setRollingSummary(userId: string, summary: string): Promise<void>;
  getGymMachines(userId: string): Promise<string[]>;
  setGymMachines(userId: string, machines: string[]): Promise<void>;
  setOnboarding(userId: string, data: OnboardingData): Promise<void>;
}

export interface AliasRow {
  id: string;
  alias: string;
  exercise_id: string;
}

export interface MachineAliasRepository {
  listAliases(userId: string): Promise<AliasRow[]>;
  addAlias(userId: string, alias: string, exerciseId: string): Promise<void>;
  removeAlias(userId: string, id: string): Promise<void>;
}
