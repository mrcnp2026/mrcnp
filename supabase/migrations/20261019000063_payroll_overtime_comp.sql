-- 20261019000063_payroll_overtime_comp.sql — 묶음 29 (2026-10-19 의뢰인: 보상휴가 ↔ 연장근로 연결, 「아직 안 만든 기능」 #33)
-- 연장근로 시간을 돈 대신 휴가로 주는 기록(근로기준법 57조 보상휴가제). 한 줄 = 한 직원 · 한 달의 연장 n분을 보상휴가 m분(배율)으로.
--   · 휴가는 연차 원장의 지급 건(leave_grant_lots, 종류 compensatory)으로 들어가고 lot_id로 잇는다.
--   · 급여 계산은 그 달 인정 연장에서 이 분을 빼고 연장수당을 계산한다 — 돈과 휴가를 두 번 주지 않는다.
--   · 고치지 못한다. 취소는 cancelled_* 칸만 적는다(줄은 남는다). 지우지 못한다.
-- 되돌리기: drop table public.payroll_overtime_comp; drop function public.guard_overtime_comp();

create table public.payroll_overtime_comp (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  pay_month date not null check (extract(day from pay_month) = 1),
  kind text not null default 'OVERTIME' check (kind in ('OVERTIME')),
  minutes int not null check (minutes > 0 and minutes <= 24000),
  rate numeric(4,2) not null check (rate >= 1 and rate <= 3),
  leave_minutes int not null check (leave_minutes > 0),
  lot_id uuid references public.leave_grant_lots(id),
  is_test boolean not null,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200),
  check ((cancelled_at is null) = (cancelled_by is null)),
  check (cancelled_at is null or cancel_reason is not null)
);
create index on public.payroll_overtime_comp (employee_id, pay_month);
create index on public.payroll_overtime_comp (pay_month, is_test);

alter table public.payroll_overtime_comp enable row level security;
revoke all on public.payroll_overtime_comp from anon, authenticated;

create or replace function public.guard_overtime_comp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception using errcode = '42501', message = 'payroll_overtime_comp: delete not allowed'; end if;
  if (to_jsonb(new) - array['lot_id', 'cancelled_at', 'cancelled_by', 'cancel_reason']) is distinct from (to_jsonb(old) - array['lot_id', 'cancelled_at', 'cancelled_by', 'cancel_reason']) then
    raise exception using errcode = '42501', message = 'payroll_overtime_comp: content is immutable';
  end if;
  if old.lot_id is not null and new.lot_id is distinct from old.lot_id then raise exception using errcode = '42501', message = 'payroll_overtime_comp: lot is fixed'; end if;
  if old.cancelled_at is not null then raise exception using errcode = 'P0001', message = 'already'; end if;
  return new;
end $$;
create trigger payroll_overtime_comp_guard before update or delete on public.payroll_overtime_comp
  for each row execute function public.guard_overtime_comp();
