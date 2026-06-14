-- RAG citation layer: pgvector store + cosine retrieval function.
create extension if not exists vector;

create table public.rag_papers (
  paper_id       text primary key,
  title          text not null,
  citation_label text not null,   -- e.g. 'Baz-Valle et al. 2022'
  source_url     text,
  license        text
);

create table public.rag_chunks (
  chunk_id     text primary key,           -- {paper_id}#{ordinal}-{hash8}
  paper_id     text not null references public.rag_papers(paper_id) on delete cascade,
  ordinal      int not null,
  content      text not null,
  content_hash text not null,
  embedding    vector(1536) not null,
  created_at   timestamptz not null default now()
);
create index rag_chunks_embedding_idx on public.rag_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.rag_papers enable row level security;
alter table public.rag_chunks enable row level security;
-- Shared read-only reference data: any authenticated user may read.
create policy "read papers" on public.rag_papers
  for select to authenticated using (true);
create policy "read chunks" on public.rag_chunks
  for select to authenticated using (true);
-- No insert/update/delete policy: ingestion runs with elevated access only.

-- Cosine top-k. SECURITY DEFINER so it runs regardless of per-row policies,
-- but it only ever returns reference data. search_path pinned.
create function public.match_chunks(query_embedding vector(1536), match_count int)
returns table (chunk_id text, paper_id text, ordinal int, content text, similarity float)
language sql stable security definer set search_path = public as $$
  select c.chunk_id, c.paper_id, c.ordinal, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.rag_chunks c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
revoke execute on function public.match_chunks(vector, int) from anon;
grant execute on function public.match_chunks(vector, int) to authenticated;
