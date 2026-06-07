# NutriCoach MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a conversational logging loop where a user says "벤치 60kg 8회 3세트" and the LLM logs it via tool calling, and asks "이번 주 운동 어땠어?" to get answers from their own data — workout + sleep only.

**Architecture:** Next.js (App Router, TypeScript) full-stack. A single `/api/chat` route runs an LLM orchestration loop: load conversation context → call the LLM with three tools (`log_workout`, `log_sleep`, `query_logs`) → execute tool calls against Supabase (user-scoped via RLS) → return the assistant reply. The LLM is accessed behind an `LLMProvider` interface (first impl: OpenAI gpt-4o-mini) so a free model can be swapped in later. Data access is behind `LogRepository` / `MessageRepository` / `ProfileRepository` interfaces so all logic is unit-testable with fakes. A deterministic safety filter injects a professional-consultation disclaimer when pain/injury keywords appear.

**Tech Stack:** Next.js 14, TypeScript, Vitest, Supabase (Auth + Postgres, `@supabase/supabase-js` + `@supabase/ssr`), OpenAI SDK (`openai`).

---

## Concrete decisions locked for this plan

- **LLM reference impl:** OpenAI `gpt-4o-mini` (cheapest reliable tool-calling). Behind `LLMProvider`; swap is one file.
- **Test runner:** Vitest, `environment: 'node'` (logic is server-side).
- **Server auth:** user-scoped Supabase client built from request cookies (`@supabase/ssr`). No service-role key in the request path — RLS enforces per-user isolation.
- **Context budget:** last 20 messages + `profiles.rolling_summary`. Compress when stored message count for the user exceeds 20.
- **Tool rounds:** orchestrator allows at most 2 LLM↔tool rounds per user turn (prevents infinite tool loops).

## File structure

```
NutriCoach/
  package.json
  tsconfig.json
  next.config.mjs
  vitest.config.ts
  .env.local.example
  supabase/
    migrations/0001_init.sql            -- profiles, logs, messages + RLS + indexes + profile trigger
  src/
    lib/
      supabase/
        browser.ts                      -- createBrowserClient()
        server.ts                       -- createServerClient() from cookies
      repositories/
        types.ts                        -- LogRow, LogRepository, MessageRepository, ProfileRepository
        supabaseRepositories.ts         -- Supabase-backed impls
      llm/
        types.ts                        -- ChatMessage, ToolCall, ToolDefinition, LLMResponse, LLMProvider
        openai.ts                       -- OpenAIProvider
        index.ts                        -- getLLM() factory
      tools/
        definitions.ts                  -- toolDefinitions: log_workout, log_sleep, query_logs (JSON schema)
        execute.ts                      -- executeTool(call, repo, userId) -> string
      safety/
        filter.ts                       -- detectPainSignal(), SAFETY_DISCLAIMER, applySafety()
      chat/
        prompt.ts                       -- buildSystemPrompt()
        context.ts                      -- loadContext(), shouldCompress(), compressOldMessages()
        orchestrator.ts                 -- runChat()
    app/
      api/chat/route.ts                 -- POST handler
      login/page.tsx                    -- login/signup UI
      page.tsx                          -- chat page (auth-gated)
    components/
      Chat.tsx                          -- chat UI client component
    middleware.ts                       -- refresh Supabase session
  tests/
    llm/openai.test.ts
    tools/definitions.test.ts
    tools/execute.test.ts
    safety/filter.test.ts
    chat/context.test.ts
    chat/orchestrator.test.ts
  evals/
    extraction-utterances.json          -- 20 labeled utterances
    run-extraction-eval.ts              -- eval harness (manual run)
  tests/fakes/
    repositories.ts                     -- InMemoryLogRepository, InMemoryMessageRepository, FakeProfileRepository
    llm.ts                              -- ScriptedLLMProvider
```

---

## Task 0: Scaffold project, deps, and Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.env.local.example`, `.gitignore`

- [ ] **Step 1: Create the Next.js app non-interactively**

Run:
```bash
cd /Users/seungbinmin/Desktop/dev_gStack/NutriCoach
npx create-next-app@14 . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm --yes
```
Expected: scaffolds Next.js into the existing dir (keeps `docs/`). If it refuses because the dir is non-empty, run with `--yes` and accept overwrite prompts for generated files only; do NOT delete `docs/`.

- [ ] **Step 2: Add runtime + test dependencies**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr openai
npm install -D vitest @vitest/coverage-v8 tsx
```
Expected: installs without error.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 4: Add test script to `package.json`**

Add to the `"scripts"` object:
```json
"test": "vitest run",
"test:watch": "vitest",
"eval:extraction": "tsx evals/run-extraction-eval.ts"
```

- [ ] **Step 5: Create `.env.local.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
OPENAI_API_KEY=sk-YOUR_KEY
OPENAI_MODEL=gpt-4o-mini
LLM_MAX_TOOL_ROUNDS=2
CONTEXT_MESSAGE_LIMIT=20
```

- [ ] **Step 6: Verify the toolchain runs**

Run: `npx vitest run`
Expected: exits 0 with "No test files found" (no tests yet). If it errors on config, fix `vitest.config.ts` before continuing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Supabase + Vitest toolchain"
```

---

## Task 1: Supabase schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply the migration to your Supabase project**

Option A (Supabase MCP — preferred, project already connected): apply `0001_init.sql` via `apply_migration` with name `init`.
Option B (local): `supabase start && supabase db reset` (requires `supabase` CLI + Docker).

Expected: tables `profiles`, `logs`, `messages` exist. Verify by listing tables — all three present with RLS enabled.

- [ ] **Step 3: Verify RLS is on**

Run a check (via MCP `execute_sql` or psql):
```sql
select relname, relrowsecurity from pg_class
where relname in ('profiles','logs','messages');
```
Expected: all three rows show `relrowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: add Supabase schema (profiles, logs, messages) with RLS"
```

---

## Task 2: Repository interfaces + Supabase clients + impls

**Files:**
- Create: `src/lib/repositories/types.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/repositories/supabaseRepositories.ts`

- [ ] **Step 1: Define repository types**

`src/lib/repositories/types.ts`:
```ts
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
```

- [ ] **Step 2: Browser Supabase client**

`src/lib/supabase/browser.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Server Supabase client (cookie-scoped)**

`src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component; safe to ignore (middleware refreshes)
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Supabase-backed repositories**

`src/lib/repositories/supabaseRepositories.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LogRepository, MessageRepository, ProfileRepository,
  InsertLogInput, QueryLogInput, LogRow, StoredMessage,
} from './types';

export function supabaseLogRepository(sb: SupabaseClient): LogRepository {
  return {
    async insertLog(input: InsertLogInput) {
      const { error } = await sb.from('logs').insert({
        user_id: input.userId, type: input.type,
        data: input.data, logged_at: input.loggedAt,
      });
      if (error) throw new Error(`insertLog failed: ${error.message}`);
    },
    async queryLogs(input: QueryLogInput): Promise<LogRow[]> {
      let q = sb.from('logs').select('id,type,data,logged_at')
        .eq('user_id', input.userId);
      if (input.type) q = q.eq('type', input.type);
      if (input.from) q = q.gte('logged_at', input.from);
      if (input.to) q = q.lte('logged_at', input.to);
      const { data, error } = await q.order('logged_at', { ascending: false }).limit(100);
      if (error) throw new Error(`queryLogs failed: ${error.message}`);
      return (data ?? []) as LogRow[];
    },
  };
}

export function supabaseMessageRepository(sb: SupabaseClient): MessageRepository {
  return {
    async recentMessages(userId, limit): Promise<StoredMessage[]> {
      const { data, error } = await sb.from('messages')
        .select('role,content,tool_calls,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error(`recentMessages failed: ${error.message}`);
      return ((data ?? []) as StoredMessage[]).reverse();
    },
    async countMessages(userId): Promise<number> {
      const { count, error } = await sb.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw new Error(`countMessages failed: ${error.message}`);
      return count ?? 0;
    },
    async insertMessage(userId, msg) {
      const { error } = await sb.from('messages').insert({
        user_id: userId, role: msg.role,
        content: msg.content, tool_calls: msg.tool_calls,
      });
      if (error) throw new Error(`insertMessage failed: ${error.message}`);
    },
    async oldestMessages(userId, count): Promise<StoredMessage[]> {
      const { data, error } = await sb.from('messages')
        .select('role,content,tool_calls,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }).limit(count);
      if (error) throw new Error(`oldestMessages failed: ${error.message}`);
      return (data ?? []) as StoredMessage[];
    },
    async deleteMessages(userId, beforeIsoExclusive) {
      const { error } = await sb.from('messages').delete()
        .eq('user_id', userId).lt('created_at', beforeIsoExclusive);
      if (error) throw new Error(`deleteMessages failed: ${error.message}`);
    },
  };
}

export function supabaseProfileRepository(sb: SupabaseClient): ProfileRepository {
  return {
    async getRollingSummary(userId): Promise<string | null> {
      const { data, error } = await sb.from('profiles')
        .select('rolling_summary').eq('id', userId).single();
      if (error) throw new Error(`getRollingSummary failed: ${error.message}`);
      return data?.rolling_summary ?? null;
    },
    async setRollingSummary(userId, summary) {
      const { error } = await sb.from('profiles')
        .update({ rolling_summary: summary }).eq('id', userId);
      if (error) throw new Error(`setRollingSummary failed: ${error.message}`);
    },
  };
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repositories src/lib/supabase
git commit -m "feat: repository interfaces and Supabase clients/impls"
```

---

## Task 3: LLM types + OpenAI provider

**Files:**
- Create: `src/lib/llm/types.ts`, `src/lib/llm/openai.ts`, `src/lib/llm/index.ts`
- Test: `tests/llm/openai.test.ts`

- [ ] **Step 1: Define LLM types**

`src/lib/llm/types.ts`:
```ts
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: Role;
  content: string | null;
  toolCalls?: ToolCall[];   // assistant
  toolCallId?: string;      // tool result
  name?: string;            // tool name (tool result)
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
}

export interface LLMProvider {
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse>;
}
```

- [ ] **Step 2: Write the failing test for OpenAI mapping**

`tests/llm/openai.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '@/lib/llm/openai';

function fakeClient(response: unknown) {
  return { chat: { completions: { create: vi.fn().mockResolvedValue(response) } } };
}

describe('OpenAIProvider', () => {
  it('maps a tool call response into LLMResponse', async () => {
    const client = fakeClient({
      choices: [{ message: {
        content: null,
        tool_calls: [{ id: 'c1', type: 'function',
          function: { name: 'log_workout', arguments: '{"exercise":"bench","weight_kg":60}' } }],
      } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const provider = new OpenAIProvider('gpt-4o-mini', client as never);
    const res = await provider.chat(
      [{ role: 'user', content: '벤치 60' }],
      [{ name: 'log_workout', description: 'x', parameters: { type: 'object' } }],
    );
    expect(res.toolCalls).toEqual([
      { id: 'c1', name: 'log_workout', arguments: { exercise: 'bench', weight_kg: 60 } },
    ]);
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  it('maps a plain text response', async () => {
    const client = fakeClient({
      choices: [{ message: { content: '안녕하세요', tool_calls: undefined } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });
    const provider = new OpenAIProvider('gpt-4o-mini', client as never);
    const res = await provider.chat([{ role: 'user', content: 'hi' }], []);
    expect(res.content).toBe('안녕하세요');
    expect(res.toolCalls).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/llm/openai.test.ts`
Expected: FAIL — `OpenAIProvider` not found.

- [ ] **Step 4: Implement the provider**

`src/lib/llm/openai.ts`:
```ts
import OpenAI from 'openai';
import type { ChatMessage, LLMProvider, LLMResponse, ToolDefinition } from './types';

type OpenAILike = Pick<OpenAI, 'chat'>;

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool' as const, content: m.content ?? '', tool_call_id: m.toolCallId! };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant' as const,
        content: m.content,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id, type: 'function' as const,
          function: { name: t.name, arguments: JSON.stringify(t.arguments) },
        })),
      };
    }
    return { role: m.role as 'system' | 'user' | 'assistant', content: m.content ?? '' };
  });
}

export class OpenAIProvider implements LLMProvider {
  constructor(private model: string, private client: OpenAILike) {}

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: toOpenAIMessages(messages) as never,
      tools: tools.length
        ? tools.map((t) => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters },
          }))
        : undefined,
    });
    const msg = res.choices[0].message;
    const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
    }));
    return {
      content: msg.content ?? null,
      toolCalls,
      usage: {
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
      },
    };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/llm/openai.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Implement the factory**

`src/lib/llm/index.ts`:
```ts
import OpenAI from 'openai';
import type { LLMProvider } from './types';
import { OpenAIProvider } from './openai';

export function getLLM(): LLMProvider {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return new OpenAIProvider(process.env.OPENAI_MODEL ?? 'gpt-4o-mini', client);
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/llm tests/llm
git commit -m "feat: LLM abstraction with OpenAI provider"
```

---

## Task 4: Tool definitions

**Files:**
- Create: `src/lib/tools/definitions.ts`
- Test: `tests/tools/definitions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/tools/definitions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '@/lib/tools/definitions';

describe('toolDefinitions', () => {
  it('exposes exactly the three MVP tools', () => {
    expect(toolDefinitions.map((t) => t.name).sort())
      .toEqual(['log_sleep', 'log_workout', 'query_logs']);
  });

  it('log_workout requires exercise, weight_kg, reps, sets', () => {
    const def = toolDefinitions.find((t) => t.name === 'log_workout')!;
    const params = def.parameters as { required: string[]; properties: Record<string, unknown> };
    expect(params.required).toEqual(['exercise', 'weight_kg', 'reps', 'sets']);
    expect(Object.keys(params.properties)).toContain('rpe');
    expect(Object.keys(params.properties)).toContain('pain');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/tools/definitions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the definitions**

`src/lib/tools/definitions.ts`:
```ts
import type { ToolDefinition } from '@/lib/llm/types';

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'log_workout',
    description:
      '운동 1세트 기록. 단위나 수치가 불명확하면 호출하지 말고 사용자에게 되물어라.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['exercise', 'weight_kg', 'reps', 'sets'],
      properties: {
        exercise: { type: 'string', description: '운동 이름 (예: 벤치프레스)' },
        weight_kg: { type: 'number', description: '무게(kg). lbs면 kg로 환산해 채워라.' },
        reps: { type: 'integer', description: '반복 수' },
        sets: { type: 'integer', description: '세트 수' },
        rpe: { type: 'number', description: '주관적 강도 1-10 (선택)' },
        pain: { type: 'string', description: '통증 부위/정도 (선택)' },
      },
    },
  },
  {
    name: 'log_sleep',
    description: '수면 기록. 취침/기상 시각이 불명확하면 되물어라.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['bed_time', 'wake_time'],
      properties: {
        bed_time: { type: 'string', description: '취침 시각 ISO 8601' },
        wake_time: { type: 'string', description: '기상 시각 ISO 8601' },
        duration_min: { type: 'integer', description: '총 수면 분 (선택)' },
        satisfaction: { type: 'integer', description: '수면 만족도 1-5 (선택)' },
      },
    },
  },
  {
    name: 'query_logs',
    description: '사용자 본인 기록 조회. 예: "이번 주 운동 어땠어?"',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {
        type: { type: 'string', enum: ['workout', 'sleep'] },
        date_from: { type: 'string', description: '조회 시작 ISO 8601 (선택)' },
        date_to: { type: 'string', description: '조회 끝 ISO 8601 (선택)' },
      },
    },
  },
];
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/tools/definitions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/definitions.ts tests/tools/definitions.test.ts
git commit -m "feat: tool definitions (log_workout, log_sleep, query_logs)"
```

---

## Task 5: Tool execution

**Files:**
- Create: `src/lib/tools/execute.ts`, `tests/fakes/repositories.ts`
- Test: `tests/tools/execute.test.ts`

- [ ] **Step 1: Create in-memory fake repositories**

`tests/fakes/repositories.ts`:
```ts
import type {
  LogRepository, MessageRepository, ProfileRepository,
  InsertLogInput, QueryLogInput, LogRow, StoredMessage,
} from '@/lib/repositories/types';

export class InMemoryLogRepository implements LogRepository {
  rows: (LogRow & { userId: string })[] = [];
  private seq = 0;
  async insertLog(i: InsertLogInput) {
    this.rows.push({ id: `log${++this.seq}`, userId: i.userId, type: i.type, data: i.data, logged_at: i.loggedAt });
  }
  async queryLogs(i: QueryLogInput): Promise<LogRow[]> {
    return this.rows
      .filter((r) => r.userId === i.userId)
      .filter((r) => !i.type || r.type === i.type)
      .filter((r) => !i.from || r.logged_at >= i.from)
      .filter((r) => !i.to || r.logged_at <= i.to)
      .map(({ id, type, data, logged_at }) => ({ id, type, data, logged_at }));
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  rows: (StoredMessage & { userId: string })[] = [];
  async recentMessages(userId: string, limit: number) {
    return this.rows.filter((r) => r.userId === userId).slice(-limit).map(strip);
  }
  async countMessages(userId: string) {
    return this.rows.filter((r) => r.userId === userId).length;
  }
  async insertMessage(userId: string, msg: Omit<StoredMessage, 'created_at'>) {
    this.rows.push({ ...msg, userId, created_at: new Date(2026, 0, 1, 0, 0, this.rows.length).toISOString() });
  }
  async oldestMessages(userId: string, count: number) {
    return this.rows.filter((r) => r.userId === userId).slice(0, count).map(strip);
  }
  async deleteMessages(userId: string, beforeIsoExclusive: string) {
    this.rows = this.rows.filter((r) => !(r.userId === userId && r.created_at < beforeIsoExclusive));
  }
}
function strip(r: StoredMessage & { userId: string }): StoredMessage {
  const { userId, ...rest } = r; return rest;
}

export class FakeProfileRepository implements ProfileRepository {
  summaries = new Map<string, string>();
  async getRollingSummary(userId: string) { return this.summaries.get(userId) ?? null; }
  async setRollingSummary(userId: string, s: string) { this.summaries.set(userId, s); }
}
```

- [ ] **Step 2: Write the failing test**

`tests/tools/execute.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { executeTool } from '@/lib/tools/execute';
import { InMemoryLogRepository } from '../fakes/repositories';

describe('executeTool', () => {
  it('log_workout inserts a workout row and returns confirmation', async () => {
    const repo = new InMemoryLogRepository();
    const out = await executeTool(
      { id: 'c1', name: 'log_workout',
        arguments: { exercise: '벤치프레스', weight_kg: 60, reps: 8, sets: 3 } },
      repo, 'u1', '2026-06-08T10:00:00.000Z',
    );
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].type).toBe('workout');
    expect(repo.rows[0].data).toMatchObject({ exercise: '벤치프레스', weight_kg: 60, reps: 8, sets: 3 });
    expect(out).toContain('기록');
  });

  it('query_logs returns the user rows as JSON', async () => {
    const repo = new InMemoryLogRepository();
    await repo.insertLog({ userId: 'u1', type: 'workout',
      data: { exercise: 'squat', weight_kg: 100, reps: 5, sets: 5 }, loggedAt: '2026-06-07T10:00:00.000Z' });
    const out = await executeTool(
      { id: 'c2', name: 'query_logs', arguments: { type: 'workout' } },
      repo, 'u1', '2026-06-08T10:00:00.000Z',
    );
    expect(out).toContain('squat');
  });

  it('rejects an unknown tool', async () => {
    const repo = new InMemoryLogRepository();
    await expect(
      executeTool({ id: 'c3', name: 'nope', arguments: {} }, repo, 'u1', '2026-06-08T10:00:00.000Z'),
    ).rejects.toThrow(/unknown tool/i);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/tools/execute.test.ts`
Expected: FAIL — `executeTool` not found.

- [ ] **Step 4: Implement execution**

`src/lib/tools/execute.ts`:
```ts
import type { ToolCall } from '@/lib/llm/types';
import type { LogRepository } from '@/lib/repositories/types';

export async function executeTool(
  call: ToolCall,
  logs: LogRepository,
  userId: string,
  nowIso: string,
): Promise<string> {
  switch (call.name) {
    case 'log_workout': {
      const a = call.arguments as {
        exercise: string; weight_kg: number; reps: number; sets: number; rpe?: number; pain?: string;
      };
      await logs.insertLog({ userId, type: 'workout', data: a, loggedAt: nowIso });
      return `운동을 기록했어요: ${a.exercise} ${a.weight_kg}kg ${a.reps}회 ${a.sets}세트`;
    }
    case 'log_sleep': {
      const a = call.arguments as {
        bed_time: string; wake_time: string; duration_min?: number; satisfaction?: number;
      };
      await logs.insertLog({ userId, type: 'sleep', data: a, loggedAt: a.bed_time });
      return `수면을 기록했어요: ${a.bed_time} ~ ${a.wake_time}`;
    }
    case 'query_logs': {
      const a = call.arguments as { type?: 'workout' | 'sleep'; date_from?: string; date_to?: string };
      const rows = await logs.queryLogs({ userId, type: a.type, from: a.date_from, to: a.date_to });
      return JSON.stringify(rows);
    }
    default:
      throw new Error(`unknown tool: ${call.name}`);
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/tools/execute.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/execute.ts tests/tools/execute.test.ts tests/fakes/repositories.ts
git commit -m "feat: tool execution against LogRepository with in-memory fakes"
```

---

## Task 6: Safety filter

**Files:**
- Create: `src/lib/safety/filter.ts`
- Test: `tests/safety/filter.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/safety/filter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectPainSignal, applySafety, SAFETY_DISCLAIMER } from '@/lib/safety/filter';

describe('safety filter', () => {
  it('detects pain/injury keywords', () => {
    expect(detectPainSignal('어깨가 아파서 벤치 멈췄어')).toBe(true);
    expect(detectPainSignal('허리 통증 있어')).toBe(true);
    expect(detectPainSignal('무릎 삐끗했어')).toBe(true);
  });

  it('does not flag normal logging', () => {
    expect(detectPainSignal('벤치 60kg 8회 3세트 했어')).toBe(false);
  });

  it('appends disclaimer exactly once when pain present', () => {
    const out = applySafety('어깨 아파', '가볍게 쉬는 걸 추천해요.');
    expect(out).toContain(SAFETY_DISCLAIMER);
    expect(out.split(SAFETY_DISCLAIMER)).toHaveLength(2); // appears once
  });

  it('leaves response untouched when no pain', () => {
    const out = applySafety('벤치 60 했어', '잘했어요!');
    expect(out).toBe('잘했어요!');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/safety/filter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the filter**

`src/lib/safety/filter.ts`:
```ts
const PAIN_PATTERN =
  /(아프|아파|통증|부상|삐|결림|쑤시)|((허리|무릎|어깨|목|손목|발목|팔꿈치)\s*(가|이|을|를)?\s*(아|통|삐|결))/;

export const SAFETY_DISCLAIMER =
  '\n\n⚠️ 통증·부상 신호가 보여요. 무리하지 말고 증상이 지속되면 전문가(의사·물리치료사) 상담을 권합니다. 이 메시지는 의료 조언이 아니에요.';

export function detectPainSignal(userText: string): boolean {
  return PAIN_PATTERN.test(userText);
}

export function applySafety(userText: string, assistantText: string): string {
  if (!detectPainSignal(userText)) return assistantText;
  if (assistantText.includes(SAFETY_DISCLAIMER)) return assistantText;
  return assistantText + SAFETY_DISCLAIMER;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/safety/filter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/safety/filter.ts tests/safety/filter.test.ts
git commit -m "feat: deterministic pain/injury safety filter"
```

---

## Task 7: Context management

**Files:**
- Create: `src/lib/chat/context.ts`
- Test: `tests/chat/context.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/chat/context.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadContext, shouldCompress, compressOldMessages } from '@/lib/chat/context';
import { InMemoryMessageRepository, FakeProfileRepository } from '../fakes/repositories';

describe('context', () => {
  it('loadContext returns recent messages + summary', async () => {
    const msgs = new InMemoryMessageRepository();
    const prof = new FakeProfileRepository();
    await prof.setRollingSummary('u1', '지난주 벤치 위주 운동');
    await msgs.insertMessage('u1', { role: 'user', content: 'hi', tool_calls: null });
    const ctx = await loadContext(msgs, prof, 'u1', 20);
    expect(ctx.summary).toBe('지난주 벤치 위주 운동');
    expect(ctx.messages).toHaveLength(1);
  });

  it('shouldCompress is true only above the limit', () => {
    expect(shouldCompress(21, 20)).toBe(true);
    expect(shouldCompress(20, 20)).toBe(false);
  });

  it('compressOldMessages folds oldest into summary and deletes them', async () => {
    const msgs = new InMemoryMessageRepository();
    const prof = new FakeProfileRepository();
    for (let i = 0; i < 5; i++) {
      await msgs.insertMessage('u1', { role: 'user', content: `m${i}`, tool_calls: null });
    }
    await compressOldMessages(msgs, prof, 'u1', 2, (text) => `SUMMARY(${text.length})`);
    expect(await prof.getRollingSummary('u1')).toMatch(/^SUMMARY\(/);
    expect(await msgs.countMessages('u1')).toBe(3); // 5 - 2 deleted
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/chat/context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement context**

`src/lib/chat/context.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/chat/context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/context.ts tests/chat/context.test.ts
git commit -m "feat: conversation context loading and rolling-summary compression"
```

---

## Task 8: System prompt + orchestrator

**Files:**
- Create: `src/lib/chat/prompt.ts`, `src/lib/chat/orchestrator.ts`, `tests/fakes/llm.ts`
- Test: `tests/chat/orchestrator.test.ts`

- [ ] **Step 1: Write the system prompt**

`src/lib/chat/prompt.ts`:
```ts
export function buildSystemPrompt(summary: string | null): string {
  return [
    '너는 NutriCoach, 운동·수면 기록을 돕는 한국어 건강 코치다.',
    '규칙:',
    '1. 사용자가 운동/수면을 말하면 적절한 tool을 호출해 기록한다.',
    '2. 단위(kg/lbs)나 수치가 불명확하면 절대 추정하지 말고 한 번 되물어라.',
    '   예: "벤치 60"이면 "벤치 60kg 8회 3세트로 기록할까요?"처럼 확인.',
    '3. 사용자가 과거 기록을 물으면 query_logs로 조회 후 사실만 답한다.',
    '4. 의료 진단을 하지 마라. 통증/부상은 신중히 다룬다.',
    summary ? `\n[지난 대화 요약]\n${summary}` : '',
  ].join('\n');
}
```

- [ ] **Step 2: Create the scripted fake LLM**

`tests/fakes/llm.ts`:
```ts
import type { ChatMessage, LLMProvider, LLMResponse, ToolDefinition } from '@/lib/llm/types';

// Returns queued responses in order; records calls for assertions.
export class ScriptedLLMProvider implements LLMProvider {
  calls: { messages: ChatMessage[]; tools: ToolDefinition[] }[] = [];
  constructor(private queue: LLMResponse[]) {}
  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    this.calls.push({ messages, tools });
    const next = this.queue.shift();
    if (!next) throw new Error('ScriptedLLMProvider: no more responses queued');
    return next;
  }
}
```

- [ ] **Step 3: Write the failing orchestrator test**

`tests/chat/orchestrator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runChat } from '@/lib/chat/orchestrator';
import { ScriptedLLMProvider } from '../fakes/llm';
import { InMemoryLogRepository, InMemoryMessageRepository, FakeProfileRepository } from '../fakes/repositories';

const NOW = '2026-06-08T10:00:00.000Z';

function deps() {
  return {
    logs: new InMemoryLogRepository(),
    msgs: new InMemoryMessageRepository(),
    prof: new FakeProfileRepository(),
  };
}

describe('runChat', () => {
  it('executes a tool call then returns the final assistant text', async () => {
    const d = deps();
    const llm = new ScriptedLLMProvider([
      { content: null, usage: { promptTokens: 10, completionTokens: 4 },
        toolCalls: [{ id: 't1', name: 'log_workout',
          arguments: { exercise: '벤치프레스', weight_kg: 60, reps: 8, sets: 3 } }] },
      { content: '벤치 60kg 8회 3세트 기록했어요!', toolCalls: [], usage: { promptTokens: 12, completionTokens: 6 } },
    ]);
    const res = await runChat({
      userId: 'u1', userMessage: '벤치 60 8회 3세트 했어', llm,
      logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20,
    });
    expect(d.logs.rows).toHaveLength(1);
    expect(res.reply).toContain('기록');
    expect(res.usage.promptTokens).toBe(22); // summed across rounds
    // persisted: user + assistant(tool_calls) + tool + assistant(final) = 4
    expect(await d.msgs.countMessages('u1')).toBe(4);
  });

  it('passes through a confirm-back question without calling a tool', async () => {
    const d = deps();
    const llm = new ScriptedLLMProvider([
      { content: '벤치 60kg 8회 3세트로 기록할까요?', toolCalls: [], usage: { promptTokens: 8, completionTokens: 5 } },
    ]);
    const res = await runChat({
      userId: 'u1', userMessage: '벤치 60', llm,
      logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20,
    });
    expect(d.logs.rows).toHaveLength(0);
    expect(res.reply).toContain('기록할까요');
  });

  it('injects the safety disclaimer when the user reports pain', async () => {
    const d = deps();
    const llm = new ScriptedLLMProvider([
      { content: '오늘은 가볍게 쉬어요.', toolCalls: [], usage: { promptTokens: 7, completionTokens: 4 } },
    ]);
    const res = await runChat({
      userId: 'u1', userMessage: '어깨가 아파', llm,
      logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20,
    });
    expect(res.reply).toContain('전문가');
  });

  it('retries the LLM once on transient failure (spec §4)', async () => {
    const d = deps();
    let calls = 0;
    const flaky = {
      async chat() {
        calls++;
        if (calls === 1) throw new Error('transient 503');
        return { content: '다시 시도해서 답했어요.', toolCalls: [], usage: { promptTokens: 5, completionTokens: 3 } };
      },
    };
    const res = await runChat({
      userId: 'u1', userMessage: '안녕', llm: flaky as never,
      logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20,
    });
    expect(calls).toBe(2);
    expect(res.reply).toContain('답했어요');
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run tests/chat/orchestrator.test.ts`
Expected: FAIL — `runChat` not found.

- [ ] **Step 5: Implement the orchestrator**

`src/lib/chat/orchestrator.ts`:
```ts
import type {
  ChatMessage, LLMProvider, ToolDefinition, LLMResponse,
} from '@/lib/llm/types';
import type { LogRepository, MessageRepository, ProfileRepository } from '@/lib/repositories/types';
import { toolDefinitions } from '@/lib/tools/definitions';
import { executeTool } from '@/lib/tools/execute';
import { loadContext, shouldCompress, compressOldMessages } from './context';
import { buildSystemPrompt } from './prompt';
import { applySafety } from '@/lib/safety/filter';

// Spec §4: on transient LLM failure, retry exactly once before surfacing the error.
async function chatWithRetry(
  llm: LLMProvider, messages: ChatMessage[], tools: ToolDefinition[],
): Promise<LLMResponse> {
  try {
    return await llm.chat(messages, tools);
  } catch {
    return await llm.chat(messages, tools);
  }
}

export interface RunChatArgs {
  userId: string;
  userMessage: string;
  llm: LLMProvider;
  logs: LogRepository;
  msgs: MessageRepository;
  prof: ProfileRepository;
  now: string;          // ISO timestamp for this turn
  maxToolRounds: number;
  contextLimit: number;
}

export interface RunChatResult {
  reply: string;
  usage: { promptTokens: number; completionTokens: number };
}

export async function runChat(args: RunChatArgs): Promise<RunChatResult> {
  const { userId, userMessage, llm, logs, msgs, prof, now, maxToolRounds, contextLimit } = args;

  await msgs.insertMessage(userId, { role: 'user', content: userMessage, tool_calls: null });

  const ctx = await loadContext(msgs, prof, userId, contextLimit);
  const convo: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx.summary) },
    ...ctx.messages.map((m) => ({
      role: m.role as ChatMessage['role'],
      content: m.content,
    })),
  ];

  let promptTokens = 0;
  let completionTokens = 0;
  let finalText = '';

  for (let round = 0; round <= maxToolRounds; round++) {
    const res = await chatWithRetry(llm, convo, toolDefinitions);
    promptTokens += res.usage.promptTokens;
    completionTokens += res.usage.completionTokens;

    if (res.toolCalls.length === 0) {
      finalText = res.content ?? '';
      break;
    }

    // persist the assistant turn that requested tools
    await msgs.insertMessage(userId, {
      role: 'assistant', content: res.content, tool_calls: res.toolCalls,
    });
    convo.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });

    for (const call of res.toolCalls) {
      let toolOut: string;
      try {
        toolOut = await executeTool(call, logs, userId, now);
      } catch (e) {
        toolOut = `도구 실행 실패: ${(e as Error).message}. 원문은 보존했어요.`;
      }
      await msgs.insertMessage(userId, { role: 'tool', content: toolOut, tool_calls: null });
      convo.push({ role: 'tool', content: toolOut, toolCallId: call.id, name: call.name });
    }
    // loop continues: model now sees tool results and produces the final reply
    if (round === maxToolRounds) {
      finalText = '요청을 처리했어요.';
    }
  }

  const safeReply = applySafety(userMessage, finalText);
  await msgs.insertMessage(userId, { role: 'assistant', content: safeReply, tool_calls: null });

  const count = await msgs.countMessages(userId);
  if (shouldCompress(count, contextLimit)) {
    await compressOldMessages(msgs, prof, userId, count - contextLimit,
      (text) => `(요약) ${text.slice(0, 300)}`);
  }

  return { reply: safeReply, usage: { promptTokens, completionTokens } };
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/chat/orchestrator.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: all tests PASS (llm, definitions, execute, filter, context, orchestrator).

- [ ] **Step 8: Commit**

```bash
git add src/lib/chat tests/chat/orchestrator.test.ts tests/fakes/llm.ts
git commit -m "feat: chat orchestrator with tool loop, confirm-back, safety injection"
```

---

## Task 9: /api/chat route

**Files:**
- Create: `src/app/api/chat/route.ts`

- [ ] **Step 1: Implement the route**

`src/app/api/chat/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import {
  supabaseLogRepository, supabaseMessageRepository, supabaseProfileRepository,
} from '@/lib/repositories/supabaseRepositories';
import { getLLM } from '@/lib/llm';
import { runChat } from '@/lib/chat/orchestrator';

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const message = body?.message;
  if (typeof message !== 'string' || message.trim() === '') {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  try {
    const result = await runChat({
      userId: user.id,
      userMessage: message,
      llm: getLLM(),
      logs: supabaseLogRepository(sb),
      msgs: supabaseMessageRepository(sb),
      prof: supabaseProfileRepository(sb),
      now: new Date().toISOString(),
      maxToolRounds: Number(process.env.LLM_MAX_TOOL_ROUNDS ?? 2),
      contextLimit: Number(process.env.CONTEXT_MESSAGE_LIMIT ?? 20),
    });
    // Token usage logged for the price-hypothesis (see Task 13).
    console.log(JSON.stringify({ evt: 'chat_usage', userId: user.id, ...result.usage }));
    return NextResponse.json({ reply: result.reply });
  } catch (e) {
    console.error('chat error', e);
    return NextResponse.json(
      { reply: '잠시 문제가 생겼어요. 다시 한 번 말씀해 주세요.' }, { status: 200 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification (deferred until auth + UI exist)**

Note: full manual test happens in Task 11 Step 4 (needs a logged-in session cookie). Typecheck is the gate here.

> **Integration-test coverage (spec §6):** the route is intentionally thin — it only
> resolves auth, builds repositories, and delegates to `runChat`. The spec's "LLM 목 +
> 테스트 데이터" integration intent is satisfied by the orchestrator unit tests
> (`tests/chat/orchestrator.test.ts`) which exercise the full loop with a scripted LLM and
> in-memory repositories. The route itself is verified by the manual E2E in Task 11 Step 4.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: /api/chat route wiring orchestrator to Supabase + LLM"
```

---

## Task 10: Auth (login/signup) + session middleware

**Files:**
- Create: `src/middleware.ts`, `src/app/login/page.tsx`

- [ ] **Step 1: Session-refresh middleware**

`src/middleware.ts`:
```ts
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Login/signup page**

`src/app/login/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function handle(kind: 'signin' | 'signup') {
    const sb = supabaseBrowser();
    const fn = kind === 'signin'
      ? sb.auth.signInWithPassword({ email, password })
      : sb.auth.signUp({ email, password });
    const { error } = await fn;
    if (error) { setMsg(error.message); return; }
    router.push('/');
  }

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>NutriCoach</h1>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)}
        style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }} />
      <input placeholder="password" type="password" value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }} />
      <button onClick={() => handle('signin')} style={{ marginRight: 8 }}>로그인</button>
      <button onClick={() => handle('signup')}>회원가입</button>
      {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/login`, sign up with a test email.
Expected: redirects to `/`. In Supabase, a `profiles` row exists for the new user (trigger fired).

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts src/app/login/page.tsx
git commit -m "feat: email/password auth and session middleware"
```

---

## Task 11: Chat UI + page

**Files:**
- Create: `src/components/Chat.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Chat client component**

`src/components/Chat.tsx`:
```tsx
'use client';
import { useState } from 'react';

interface Turn { role: 'user' | 'assistant'; text: string; }

export default function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setTurns((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json();
      setTurns((t) => [...t, { role: 'assistant', text: json.reply ?? '오류가 났어요.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h2>NutriCoach</h2>
      <div style={{ minHeight: 300, border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
        {turns.map((t, i) => (
          <p key={i} style={{ textAlign: t.role === 'user' ? 'right' : 'left' }}>
            <b>{t.role === 'user' ? '나' : '코치'}:</b> {t.text}
          </p>
        ))}
        {busy && <p><i>코치가 입력 중…</i></p>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="예: 벤치 60kg 8회 3세트 했어"
          style={{ flex: 1, padding: 8 }} />
        <button onClick={send} disabled={busy}>보내기</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Auth-gated home page**

`src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import Chat from '@/components/Chat';

export default async function Home() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  return <Chat />;
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual end-to-end verification**

Run: `npm run dev`, log in, then in the chat box:
1. Send "벤치 60kg 8회 3세트 했어" → coach confirms it logged. Check Supabase `logs`: one workout row with `data.weight_kg = 60`.
2. Send "벤치 60" (ambiguous) → coach asks a confirm-back question; NO new log row.
3. Send "이번 주 운동 어땠어?" → coach answers referencing the logged bench.
4. Send "어깨가 아파" → reply includes the professional-consultation disclaimer.

Expected: all four behaviors as described.

- [ ] **Step 5: Commit**

```bash
git add src/components/Chat.tsx src/app/page.tsx
git commit -m "feat: chat UI and auth-gated home page"
```

---

## Task 12: Extraction accuracy eval (≥90% gate)

**Files:**
- Create: `evals/extraction-utterances.json`, `evals/run-extraction-eval.ts`

- [ ] **Step 1: Create the labeled test set (20 utterances)**

`evals/extraction-utterances.json`:
```json
[
  {"text":"벤치프레스 60kg 8회 3세트 했어","expect":{"tool":"log_workout","exercise":"벤치프레스","weight_kg":60,"reps":8,"sets":3}},
  {"text":"스쿼트 100 5x5","expect":{"tool":"log_workout","exercise":"스쿼트","weight_kg":100,"reps":5,"sets":5}},
  {"text":"데드리프트 140킬로 5회 1세트","expect":{"tool":"log_workout","exercise":"데드리프트","weight_kg":140,"reps":5,"sets":1}},
  {"text":"오버헤드프레스 40kg 10회 3세트 RPE 8","expect":{"tool":"log_workout","exercise":"오버헤드프레스","weight_kg":40,"reps":10,"sets":3,"rpe":8}},
  {"text":"바벨로우 70 8 4세트","expect":{"tool":"log_workout","exercise":"바벨로우","weight_kg":70,"reps":8,"sets":4}},
  {"text":"인클라인 덤벨프레스 22.5kg 12회 3세트","expect":{"tool":"log_workout","exercise":"인클라인 덤벨프레스","weight_kg":22.5,"reps":12,"sets":3}},
  {"text":"풀업 맨몸 10회 3세트","expect":{"tool":"log_workout","exercise":"풀업","weight_kg":0,"reps":10,"sets":3}},
  {"text":"레그프레스 200kg 15회 4세트","expect":{"tool":"log_workout","exercise":"레그프레스","weight_kg":200,"reps":15,"sets":4}},
  {"text":"라잉 트라이셉스 익스텐션 30kg 12 3","expect":{"tool":"log_workout","exercise":"라잉 트라이셉스 익스텐션","weight_kg":30,"reps":12,"sets":3}},
  {"text":"벤치 80kg 5회 5세트 했고 어깨 약간 아팠어","expect":{"tool":"log_workout","exercise":"벤치","weight_kg":80,"reps":5,"sets":5,"pain":"어깨"}},
  {"text":"어제 11시에 자서 오늘 7시에 일어났어","expect":{"tool":"log_sleep","bed_time":"23:00","wake_time":"07:00"}},
  {"text":"새벽 1시 취침 아침 8시 기상","expect":{"tool":"log_sleep","bed_time":"01:00","wake_time":"08:00"}},
  {"text":"12시에 자고 6시 반에 깼어","expect":{"tool":"log_sleep","bed_time":"00:00","wake_time":"06:30"}},
  {"text":"10시 반 취침 6시 기상 만족도 4","expect":{"tool":"log_sleep","bed_time":"22:30","wake_time":"06:00","satisfaction":4}},
  {"text":"어젯밤 7시간 잤어","expect":{"tool":"log_sleep","duration_min":420}},
  {"text":"이번 주 운동 어땠어?","expect":{"tool":"query_logs","type":"workout"}},
  {"text":"지난 일주일 수면 어때?","expect":{"tool":"query_logs","type":"sleep"}},
  {"text":"오늘 기록 보여줘","expect":{"tool":"query_logs"}},
  {"text":"내 벤치 기록 추이 알려줘","expect":{"tool":"query_logs","type":"workout"}},
  {"text":"요즘 잘 자고 있나?","expect":{"tool":"query_logs","type":"sleep"}}
]
```

- [ ] **Step 2: Write the eval harness**

`evals/run-extraction-eval.ts`:
```ts
import { readFileSync } from 'node:fs';
import { getLLM } from '../src/lib/llm';
import { toolDefinitions } from '../src/lib/tools/definitions';

interface Case { text: string; expect: Record<string, unknown> & { tool: string } }

function coreFieldsMatch(expected: Record<string, unknown>, got: Record<string, unknown>): boolean {
  // For log_workout: exercise (substring ok), weight_kg, reps, sets must match.
  const keys = Object.keys(expected).filter((k) => k !== 'tool');
  return keys.every((k) => {
    if (k === 'exercise') {
      return String(got.exercise ?? '').includes(String(expected.exercise)) ||
             String(expected.exercise).includes(String(got.exercise ?? ''));
    }
    if (['bed_time', 'wake_time'].includes(k)) {
      return String(got[k] ?? '').includes(String(expected[k])); // time-of-day substring
    }
    return got[k] === expected[k];
  });
}

async function main() {
  const cases: Case[] = JSON.parse(readFileSync(new URL('./extraction-utterances.json', import.meta.url), 'utf8'));
  const llm = getLLM();
  let pass = 0;
  for (const c of cases) {
    const res = await llm.chat(
      [{ role: 'system', content: '운동/수면이면 적절한 tool을 호출하라. 조회 요청이면 query_logs.' },
       { role: 'user', content: c.text }],
      toolDefinitions,
    );
    const call = res.toolCalls[0];
    const ok = !!call && call.name === c.expect.tool && coreFieldsMatch(c.expect, call.arguments);
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${c.text} -> ${call?.name ?? 'none'}`);
  }
  const rate = pass / cases.length;
  console.log(`\nAccuracy: ${pass}/${cases.length} = ${(rate * 100).toFixed(1)}%`);
  if (rate < 0.9) { console.error('BELOW 90% GATE'); process.exit(1); }
}
main();
```

- [ ] **Step 3: Run the eval**

Run: `OPENAI_API_KEY=... OPENAI_MODEL=gpt-4o-mini npm run eval:extraction`
Expected: prints per-case PASS/FAIL and an accuracy ≥90%. If below, tune `buildSystemPrompt`/tool descriptions and re-run. (This eval costs ~20 cheap API calls.)

- [ ] **Step 4: Commit**

```bash
git add evals/extraction-utterances.json evals/run-extraction-eval.ts
git commit -m "test: extraction accuracy eval harness (>=90% gate)"
```

---

## Task 13: Token-usage instrumentation note

The `/api/chat` route already emits `console.log(JSON.stringify({ evt: 'chat_usage', ... }))` per turn (Task 9, Step 1). On Vercel these lines are queryable in the logs dashboard — that is the data for the "free model is enough?" price hypothesis. No extra code needed for MVP.

- [ ] **Step 1: Verify the log line shape**

Trigger one chat turn (Task 11 manual test) and confirm a `chat_usage` JSON line appears in `npm run dev` console with non-zero `promptTokens`.
Expected: `{"evt":"chat_usage","userId":"...","promptTokens":N,"completionTokens":M}`.

- [ ] **Step 2 (no code): record the dogfood metric manually**

Per spec Section 7, track days-logged-out-of-7 during the personal dogfood. This is a manual journaling step, not code.

---

## Definition of Done (maps to spec Section 9)

- [ ] 운동·수면을 자연어로 말하면 confirm-back을 거쳐 `logs`에 정확히 기록 (Task 11 Step 4.1–4.2)
- [ ] "이번 주 운동 어땠어?"에 내 기록 기반 응답 (Task 11 Step 4.3)
- [ ] 통증/부상 언급 시 100% 안전 고지 (Task 6 + Task 11 Step 4.4)
- [ ] 추출 정확도 eval ≥90% (Task 12)
- [ ] 본인 7일 dogfooding 가능한 배포 상태 (Tasks 9–11 + Vercel deploy)
- [ ] `npx vitest run` 전부 green (Tasks 3–8)
