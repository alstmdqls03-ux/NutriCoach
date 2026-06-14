import type { SupabaseClient } from '@supabase/supabase-js';
import type { RetrievedChunk } from './types';

export async function retrieveChunks(
  sb: SupabaseClient, embedding: number[], k: number,
): Promise<RetrievedChunk[]> {
  const { data, error } = await sb.rpc('match_chunks', { query_embedding: embedding, match_count: k });
  if (error) throw new Error(`match_chunks failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}
