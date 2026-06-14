-- ============================================================
-- NutriCoach · dogfood 시드 스크립트
-- ------------------------------------------------------------
-- 목적: 빈 계정에 "최근 7일치" 운동/수면 샘플 데이터를 한 번에 넣어
--       조회("이번 주 운동 어땠어?") / 화면 / (추후) streak를 바로 테스트.
--
-- 실행법: Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run.
--        (또는 Claude에게 "이 시드 넣어줘" 라고 하면 대신 실행)
--
-- ⚠️ 맨 아래 두 곳의 이메일을 '본인 계정 이메일'로 바꾸세요.
--    날짜는 실행하는 "오늘" 기준 상대(now())로 들어갑니다.
-- ============================================================

with me as (
  -- 👇 본인 이메일로 변경
  select id as uid from auth.users where email = 'ratt1000@naver.com'
)
insert into public.logs (user_id, type, data, logged_at)

-- ── 운동 5건 (점진적 증가 + 하루 쉬는 날 포함) ───────────────
select me.uid, v.type, v.data, now() - (v.days_ago || ' days')::interval
from me, (values
  ('workout','{"exercise":"벤치프레스","weight_kg":60,"reps":8,"sets":3}'::jsonb, 6),
  ('workout','{"exercise":"스쿼트","weight_kg":90,"reps":5,"sets":5}'::jsonb, 5),
  -- (4일 전은 휴식 → 일부러 비움: "하루 까먹음" 상황 재현)
  ('workout','{"exercise":"데드리프트","weight_kg":120,"reps":3,"sets":5}'::jsonb, 3),
  ('workout','{"exercise":"벤치프레스","weight_kg":62.5,"reps":8,"sets":3}'::jsonb, 2),
  ('workout','{"exercise":"풀업","weight_kg":0,"reps":10,"sets":3}'::jsonb, 1)
) as v(type, data, days_ago)

union all

-- ── 수면 6일치 (매일 밤 23:00 → 다음날 07:00, 한국시간) ────────
select me.uid, 'sleep',
  jsonb_build_object(
    'bed_time',  to_char(current_date - g.n,     'YYYY-MM-DD') || 'T23:00:00+09:00',
    'wake_time', to_char(current_date - g.n + 1, 'YYYY-MM-DD') || 'T07:00:00+09:00'
  ),
  now() - (g.n || ' days')::interval
from me, generate_series(1, 6) as g(n);


-- ============================================================
-- 확인용 (선택): 방금 넣은 데이터 날짜별로 보기
-- ============================================================
-- select (logged_at at time zone 'Asia/Seoul')::date as 날짜,
--        type, data->>'exercise' as 운동, data
-- from public.logs
-- where user_id = (select id from auth.users where email = 'ratt1000@naver.com')  -- 👈 본인 이메일
-- order by logged_at;


-- ============================================================
-- 되돌리기 (시드 데이터 전부 삭제): 필요할 때만 실행
-- ============================================================
-- delete from public.logs
-- where user_id = (select id from auth.users where email = 'ratt1000@naver.com');  -- 👈 본인 이메일
