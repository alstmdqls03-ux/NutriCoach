import type { MessageRepository, ProfileRepository, StoredMessage } from '@/lib/repositories/types';

export interface LoadedContext {
  summary: string | null;
  messages: StoredMessage[];
}

export async function loadContext(
  msgs: MessageRepository, prof: ProfileRepository, userId: string, limit: number,
): Promise<LoadedContext> {
  const [summary, messages] = await Promise.all([
    prof.getRollingSummary(userId),
    msgs.recentMessages(userId, limit),
  ]);
  return { summary, messages };
}

export function shouldCompress(count: number, limit: number): boolean {
  return count > limit;
}

// Summarize the oldest `batch` messages into the rolling summary, then delete them.
export async function compressOldMessages(
  msgs: MessageRepository,
  prof: ProfileRepository,
  userId: string,
  batch: number,
  summarize: (text: string) => string,
): Promise<void> {
  const oldest = await msgs.oldestMessages(userId, batch);
  if (oldest.length === 0) return;
  const prior = (await prof.getRollingSummary(userId)) ?? '';
  const text = oldest.map((m) => `${m.role}: ${m.content ?? ''}`).join('\n');
  const next = [prior, summarize(text)].filter(Boolean).join('\n');
  await prof.setRollingSummary(userId, next);
  const cutoff = oldest[oldest.length - 1].created_at;
  // delete strictly older-or-equal handled by using the next message boundary:
  await msgs.deleteMessages(userId, addEpsilon(cutoff));
}

function addEpsilon(iso: string): string {
  return new Date(new Date(iso).getTime() + 1).toISOString();
}
