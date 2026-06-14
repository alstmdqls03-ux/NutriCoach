-- Security hardening (advisor lints 0028/0029), mirroring 0002's treatment of
-- handle_new_user. match_chunks was SECURITY DEFINER and still EXECUTE-able by
-- anon via the default PUBLIC grant. authenticated already has a read policy on
-- rag_chunks, so the function does not need definer rights — switch to
-- SECURITY INVOKER (RLS applies) and remove the public/anon execute grants.
create or replace function public.match_chunks(query_embedding vector(1536), match_count int)
returns table (chunk_id text, paper_id text, ordinal int, content text, similarity float)
language sql stable security invoker set search_path = public as $$
  select c.chunk_id, c.paper_id, c.ordinal, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.rag_chunks c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
revoke execute on function public.match_chunks(vector, int) from public, anon;
grant execute on function public.match_chunks(vector, int) to authenticated;
