import type { SupabaseClient } from '@supabase/supabase-js';
import type { RetrievedChunk } from './types';
import { reciprocalRankFusion, mmr } from './fuse';

export async function retrieveChunks(
  sb: SupabaseClient, embedding: number[], k: number,
): Promise<RetrievedChunk[]> {
  const { data, error } = await sb.rpc('match_chunks', { query_embedding: embedding, match_count: k });
  if (error) throw new Error(`match_chunks failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}

export async function retrieveChunksFts(
  sb: SupabaseClient, query: string, k: number,
): Promise<RetrievedChunk[]> {
  const { data, error } = await sb.rpc('match_chunks_fts', { query, match_count: k });
  if (error) throw new Error(`match_chunks_fts failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}

export async function fetchEmbeddings(
  sb: SupabaseClient, ids: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (ids.length === 0) return out;
  const { data, error } = await sb.from('rag_chunks').select('chunk_id,embedding').in('chunk_id', ids);
  if (error) throw new Error(`fetchEmbeddings failed: ${error.message}`);
  for (const r of data ?? []) {
    const raw = (r as { embedding: unknown }).embedding;
    const vec = typeof raw === 'string' ? (JSON.parse(raw) as number[]) : (raw as number[]);
    out.set((r as { chunk_id: string }).chunk_id, vec);
  }
  return out;
}

export interface HybridOpts { n?: number; m?: number; k?: number; kRrf?: number; lambda?: number; }

/** vector + FTS -> RRF -> MMR. */
export async function hybridRetrieve(
  sb: SupabaseClient, queryEmbedding: number[], queryText: string, opts: HybridOpts = {},
): Promise<RetrievedChunk[]> {
  const { n = 15, m = 12, k = 6, kRrf = 60, lambda = 0.7 } = opts;
  const [vec, fts] = await Promise.all([
    retrieveChunks(sb, queryEmbedding, n),
    retrieveChunksFts(sb, queryText, n),
  ]);
  const fused = reciprocalRankFusion([vec, fts], kRrf).slice(0, m);
  const embById = await fetchEmbeddings(sb, fused.map((c) => c.chunk_id));
  return mmr(fused, queryEmbedding, embById, lambda, k);
}
