-- profiles: minimal user settings (no goal-onboarding in MVP).
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  unit_weight     text not null default 'kg',      -- 'kg'|'lbs'
  timezone        text not null default 'Asia/Seoul',
  rolling_summary text,
  created_at      timestamptz not null default now()
);

-- logs: workout + sleep unified via type + jsonb.
-- data(workout): {exercise, weight_kg, reps, sets, rpe?, pain?}
-- data(sleep):   {bed_time, wake_time, duration_min?, satisfaction?}
create table public.logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('workout','sleep')),
  data        jsonb not null,
  logged_at   timestamptz not null,
  created_at  timestamptz not null default now()
);
create index logs_user_type_logged_idx on public.logs (user_id, type, logged_at desc);

-- messages: conversation history for LLM context.
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user','assistant','tool')),
  content     text,
  tool_calls  jsonb,
  created_at  timestamptz not null default now()
);
create index messages_user_created_idx on public.messages (user_id, created_at);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.logs     enable row level security;
alter table public.messages enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own logs" on public.logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own messages" on public.messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Auto-create a profile row when a user signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
