-- 20261011000027_day_confirms.sql
-- 기록 확정 (의뢰인 2026-10-11 확정: "확정한 기록만 급여 계산에 쓰고, 확정 뒤에는 정정 요청을 막는다").
--   한 직원의 하루 기록을 관리자가 확정한다. 확정된 날은 정정 요청·대리 입력·정정 승인·정정 취소가 막힌다.
--   고치려면 관리자가 확정을 푼다(active=false) — 줄은 지우지 않고, 누가 언제 풀었는지 남는다 (4-1).
--   다시 확정하면 새 줄이 생긴다 (직원·날짜·연습 여부마다 켜진 줄은 하나).
--
-- 되돌리는 방법: drop table public.day_confirms;
--   ⚠️ 운영 뒤에는 되돌리지 말 것 (확정 내역이 사라지면 급여 계산에 쓰는 기록이 전부 빠진다). 앱 코드를 먼저 예전 방식으로 돌려야 한다.

create table public.day_confirms (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  work_date    date not null,
  is_test      boolean not null default true,
  active       boolean not null default true,      -- false = 확정을 풀었다
  confirmed_by uuid not null references public.profiles(id),
  confirmed_at timestamptz not null default now(),
  released_by  uuid references public.profiles(id),
  released_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index day_confirms_one_active on public.day_confirms (employee_id, work_date, is_test) where active;
create index on public.day_confirms (work_date);

alter table public.day_confirms enable row level security;
create policy day_confirms_select on public.day_confirms for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.day_confirms from anon, authenticated;
revoke all on public.day_confirms from anon;
-- 확정한 사실(누가·언제·어느 날)은 고정, 푸는 칸만 바뀐다. 삭제 금지 (4-1)
create trigger day_confirms_guard before update or delete on public.day_confirms
  for each row execute function public.guard_columns('active', 'released_by', 'released_at');
create trigger day_confirms_no_truncate before truncate on public.day_confirms
  for each statement execute function public.forbid_change();
create trigger day_confirms_audit after insert or update or delete on public.day_confirms
  for each row execute function public.audit_row();
