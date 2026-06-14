-- Bloom onboarding: persist the data collected during signup. Additive; RLS
-- "own profile" already covers new columns.
alter table public.profiles
  add column display_name   text,
  add column goals          text[],
  add column units          text,        -- 'Metric' | 'Imperial'
  add column height_cm      int,
  add column weight_kg      numeric,
  add column age            int,
  add column activity_level text;         -- 'start' | 'light' | 'moderate' | 'very'
