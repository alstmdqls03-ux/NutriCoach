# NutriCoach MVP — 대화형 로깅 루프 구현 설계

Date: 2026-06-08
Status: APPROVED (brainstorming)
Strategic source: `~/.gstack/projects/NutriCoach/seungbinmin-main-design-20260607-201021.md` (office-hours, APPROVED)

## 목적 (이 스펙의 범위)

office-hours 전략 설계의 **Approach A**(대화형 로깅 루프 MVP)를 구현 가능한 수준으로
구체화한 문서. 목표는 "대화형 로깅이 유용한가"를 며칠 만에 깨끗하게 검증하는 것 +
Agentic RAG 학습의 토대. 본인 7일 dogfooding이 1차 검증.

핵심 wedge: **"말하면 기록되고, 물으면 답하는" 단일 대화 루프.**

## 확정된 결정 (brainstorming)

| 항목 | 결정 |
|---|---|
| 빌드 의도 | MVP(A) 지금 빌드 → 본인 7일 dogfooding (학습 + 검증 동시) |
| 로그 종류 | **운동 + 수면 2종** (식단·컨디션은 이후) |
| LLM | 값싼 유료 모델(gpt-4o-mini / Claude Haiku) 먼저 + 추상화 레이어 |
| 아키텍처 | Next.js 풀스택 + Supabase (API Route에서 LLM 루프) |

## 1. 기술 스택

- **Next.js (App Router, TypeScript)** — 웹 우선, 추후 WebView 래핑.
- **Supabase** — Auth(이메일/비밀번호) + Postgres. RLS로 유저별 데이터 격리.
- **LLM 추상화 레이어** — `LLMProvider` 인터페이스 1개. 구현체는 값싼 유료 모델로 시작.
  나중에 무료 모델 구현체를 추가해 스왑·품질 비교(가격 가설 검증).
- **배포** — Vercel.

## 2. 데이터 모델 (최소 3테이블 + 주석)

```sql
-- 사용자 프로필 (최소). 목표설정 온보딩은 MVP 제외, 단위/타임존/요약만.
create table profiles (
  id              uuid primary key references auth.users(id),
  unit_weight     text not null default 'kg',      -- 'kg'|'lbs', 파싱 모호성 기본값
  timezone        text not null default 'Asia/Seoul',
  rolling_summary text,                            -- 오래된 대화 압축 요약(컨텍스트 예산)
  created_at      timestamptz not null default now()
);

-- 운동/수면 통합 로그. type + jsonb 로 테이블 최소화.
create table logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  type        text not null,                       -- 'workout' | 'sleep' (MVP 2종)
  data        jsonb not null,                      -- per-type 계약(아래)
  logged_at   timestamptz not null,               -- 사용자 기준 발생 시각
  created_at  timestamptz not null default now()
);
-- data(workout): {exercise, weight_kg, reps, sets, rpe?, pain?}
-- data(sleep):   {bed_time, wake_time, duration_min?, satisfaction?}

-- 대화 히스토리 (LLM 컨텍스트용).
create table messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  role        text not null,                       -- 'user'|'assistant'|'tool'
  content     text,
  tool_calls  jsonb,                               -- LLM tool call/result
  created_at  timestamptz not null default now()
);
```

- **RLS:** 세 테이블 모두 `user_id = auth.uid()` (profiles는 `id = auth.uid()`) 정책으로
  본인 행만 select/insert/update.
- **인덱스:** `logs(user_id, type, logged_at)`, `messages(user_id, created_at)`.
- **트레이드오프:** 단일 `logs` 테이블 + jsonb는 테이블 최소화 요구에 맞춤. 강타입 검증이
  약하고 type 필터가 필요하지만 MVP 규모에선 수용. 규모 확대 시 분리 검토.

## 3. 대화 루프 (데이터 흐름)

```
채팅 UI → POST /api/chat {message}
  → 서버: 최근 메시지(기본 20개, 설정값) + profiles.rolling_summary 로드
  → LLMProvider 호출 (tools: log_workout, log_sleep, query_logs)
  → 분기:
     · 모호하면(단위/수치 불명) → tool 호출 안 하고 confirm-back 질문
       ("벤치 60kg 8회 3세트로 기록할까요?")
     · 명확하면 → tool 실행 (Supabase insert/select, user 스코프)
  → tool 결과를 LLM에 반환 → 최종 응답 생성
  → user/assistant/tool 메시지 저장
  → 메시지 수가 임계(기본 20개) 초과 시 오래된 메시지를 rolling_summary로 압축
```

### Tools (3개)

| Tool | 시그니처 | 동작 |
|---|---|---|
| `log_workout` | `(exercise, weight_kg, reps, sets, rpe?, pain?)` | `logs` insert (type=workout) |
| `log_sleep` | `(bed_time, wake_time, duration_min?, satisfaction?)` | `logs` insert (type=sleep) |
| `query_logs` | `(type?, date_from?, date_to?, metric?)` | `logs` select → 예: "이번 주 운동 어땠어?" |

## 4. 파싱 & 에러 처리

- **모호성 → 추정 금지, confirm-back.** 단위(kg/lbs)·수치 불명확 시 tool을 호출하지 않고
  확인 질문. (MVP는 draft 상태 머신 없이 확인 질문만 — YAGNI)
- **tool 실패(DB 오류) → 명시적 사과 + 원문 보존(유실 금지).**
- **LLM API 실패 → 1회 재시도 후 친절한 오류 메시지.**
- **의도 불명 → LLM이 되묻기.**

## 5. 안전 레이어 (결정론적)

- 통증/부상 키워드 pre-filter(regex): `아프|통증|부상|삐|결림` + 부위(`허리|무릎|어깨|목|손목|발목`).
- 매칭 시 응답에 **"전문가 상담 권고 + 의료행위 아님"** 고지를 결정론적으로 삽입
  (LLM 단독 판단에 의존하지 않음). 운동 로그의 `pain` 필드에도 기록.

## 6. 테스트

- **유닛:** tool 함수(올바른 행 insert), 안전 pre-filter 매칭.
- **추출 정확도 eval:** 라벨링된 20개 발화 테스트셋 → 핵심 필드(type/수치/단위) 일치율 ≥90%.
  "일치"는 핵심 필드 전부 정확할 때.
- **통합:** `/api/chat` E2E (LLM 목 + 테스트 Supabase 프로젝트).
- **안전:** 통증 키워드 입력 → 고지 100% 삽입 검증.

## 7. 계측 & 검증 (가설 테스트)

- 요청당 **토큰 사용량 로깅** → "무료 모델로 충분" 가격 가설 검증 데이터.
- **dogfood 지표:** 7일 중 로깅 일수(office-hours success criteria와 동일).
  - 5일+ → 통증 진짜, B(코퍼스 RAG) 진입.
  - 3~4일 → 마찰 인터뷰 후 입력 UX 개선, 재측정.
  - 3일 미만 → 로깅 습관 자체 문제, 트리거 재설계.

## 8. MVP 제외 (YAGNI)

대시보드 · 배지 · 스트릭 · 주간리포트 · 식단/컨디션 로그 · 사진 분석 · RAG · Agentic
orchestration · WebView 래핑 · 한국 음식 영양 DB · 목표설정 온보딩(프로필 최소만) ·
어필리에이트 · 멀티프로바이더(인터페이스만, 구현체 1개).

## 9. 성공 기준 (이 MVP가 "완료"인 조건)

- 운동·수면을 자연어로 말하면 confirm-back을 거쳐 `logs`에 정확히 기록된다.
- "이번 주 운동 어땠어?"류 질문에 내 기록 기반으로 답한다.
- 통증/부상 언급 시 100% 안전 고지가 붙는다.
- 추출 정확도 eval ≥90% 통과.
- 본인이 7일 dogfooding 가능한 상태로 배포된다.

## 10. 다음 단계

1. using-git-worktrees로 작업공간 분리.
2. writing-plans로 이 스펙을 구현 계획으로 분해.
