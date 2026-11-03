-- 20261103000088_attendance_check_reviews.sql
-- 근태 점검 (결정 급여-69 · 급여-71, 2026-11-03 의뢰인): 확인 필요 항목을 담당자가 판단한 기록.
--   항목은 근태 기록으로 그때그때 계산한다(저장하지 않는다 — src/lib/attendance-check.ts). 여기에는 「누가 · 언제 · 무엇으로 판단했나」만 남긴다.
--   scope = 'day'  : 직원 하루 1건 (work_date = 그날, kind = 'day')
--           'month': 한 달 1건 (work_date = 그달 1일, kind = 'schedule_check' | 'early_bundle')
--   fingerprint = 판단할 때 보였던 항목(유형 · 분 · 덮인 분)의 요약 — 그 뒤 그날 자료가 바뀌면 달라져 「처리 뒤 바뀜」으로 다시 뜬다.
--   (직원 · 날짜 · 범위 · 종류) 하나에 살아 있는 판단은 하나. 되돌리면 active=false로 남는다(지우지 않는다).
--
-- 되돌리는 방법: drop table public.attendance_check_reviews; (앱 코드를 먼저 예전으로)

create table public.attendance_check_reviews (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  work_date    date not null,
  scope        text not null check (scope in ('day', 'month')),
  kind         text not null check (kind in ('day', 'schedule_check', 'early_bundle')),
  decision     text not null check (decision in ('recognized', 'not_recognized', 'break_taken', 'not_late', 'schedule_ok', 'confirmed')),
  note         text check (note is null or char_length(note) <= 300),
  fingerprint  text not null check (char_length(fingerprint) between 1 and 500),
  is_test      boolean not null default true,
  active       boolean not null default true,
  decided_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  released_by  uuid references public.profiles(id),
  released_at  timestamptz,
  check ((scope = 'day') = (kind = 'day'))
);
create unique index attendance_check_reviews_one on public.attendance_check_reviews (employee_id, work_date, scope, kind, is_test) where active;
create index attendance_check_reviews_date on public.attendance_check_reviews (work_date) where active;
alter table public.attendance_check_reviews enable row level security;
create policy attendance_check_reviews_select on public.attendance_check_reviews for select to authenticated using ((select private.is_admin()));
revoke insert, update, delete on public.attendance_check_reviews from anon, authenticated;
revoke all on public.attendance_check_reviews from anon;
create trigger attendance_check_reviews_guard before update or delete on public.attendance_check_reviews
  for each row execute function public.guard_columns('active', 'released_by', 'released_at');
