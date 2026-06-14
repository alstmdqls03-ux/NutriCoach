-- Make-it-stick: persist a user's gym machine list and their custom machine
-- aliases. Additive and non-destructive (see 2026-06-14-make-it-stick-design.md).

-- 1) Persisted gym machine list on the profile.
alter table public.profiles
  add column gym_machines text[] not null default '{}';

-- 2) User-registered machine aliases (alias -> free-exercise-db exercise id).
create table public.machine_aliases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  alias       text not null,        -- stored normalized (trim+collapse+lower)
  exercise_id text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, alias)
);
create index machine_aliases_user_idx on public.machine_aliases (user_id);

alter table public.machine_aliases enable row level security;
create policy "own aliases" on public.machine_aliases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
