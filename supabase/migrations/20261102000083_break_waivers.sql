-- 20261102000083_break_waivers.sql
-- 휴게 안 함 표시 (결정 사항 급여-60, 2026-11-02 의뢰인: 10/7은 17:00–17:30 휴게 때 쉬지 않고 일했다 — 그날만 그 휴게를 빼지 않는다).
--   관리자가 한 직원의 하루에 「이 휴게시간대는 쉬지 않았다」를 사유와 함께 표시한다. 계산은 그 휴게시간대만 빼지 않는다.
--   시간 규칙이 아니라 그날의 사실이라 날마다 따로 표시한다. 표시를 거두면(active=false) 줄은 남고 누가 언제 거뒀는지 남는다 (4-1).
--
-- 되돌리는 방법: drop table public.break_waivers;
--   ⚠️ 운영 뒤에는 되돌리지 말 것 (표시가 사라지면 그날 연장이 휴게만큼 줄어 지급액이 바뀐다). 앱 코드를 먼저 예전으로 돌려야 한다.

create table public.break_waivers (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  work_date    date not null,
  break_start  time not null,
  break_end    time not null check (break_end > break_start),
  reason       text not null check (char_length(btrim(reason)) between 1 and 200),
  is_test      boolean not null default true,
  active       boolean not null default true,      -- false = 표시를 거뒀다
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  released_by  uuid references public.profiles(id),
  released_at  timestamptz
);
create unique index break_waivers_one_active on public.break_waivers (employee_id, work_date, break_start, is_test) where active;
create index on public.break_waivers (work_date);

alter table public.break_waivers enable row level security;
create policy break_waivers_select on public.break_waivers for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.break_waivers from anon, authenticated;
revoke all on public.break_waivers from anon;
-- 표시한 사실(누가 · 언제 · 어느 휴게 · 사유)은 고정, 거두는 칸만 바뀐다. 삭제 금지 (4-1)
create trigger break_waivers_guard before update or delete on public.break_waivers
  for each row execute function public.guard_columns('active', 'released_by', 'released_at');
create trigger break_waivers_no_truncate before truncate on public.break_waivers
  for each statement execute function public.forbid_change();
create trigger break_waivers_audit after insert or update or delete on public.break_waivers
  for each row execute function public.audit_row();
