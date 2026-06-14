-- Hybrid retrieval: full-text search over chunk content (English, post-translation).
alter table public.rag_chunks
  add column content_tsv tsvector generated always as (to_tsvector('english', content)) stored;
create index rag_chunks_tsv_idx on public.rag_chunks using gin (content_tsv);

create function public.match_chunks_fts(query text, match_count int)
returns table (chunk_id text, paper_id text, ordinal int, content text, similarity float)
language sql stable security invoker set search_path = public as $$
  select c.chunk_id, c.paper_id, c.ordinal, c.content,
         ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', query)) as similarity
  from public.rag_chunks c
  where c.content_tsv @@ websearch_to_tsquery('english', query)
  order by similarity desc
  limit match_count;
$$;
revoke execute on function public.match_chunks_fts(text, int) from public, anon;
grant execute on function public.match_chunks_fts(text, int) to authenticated;
