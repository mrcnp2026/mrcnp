-- 20261028000081_payroll_daily_workers_rework.sql — 묶음 39 (2026-10-28 의뢰인 결정 급여-58: 일용직을 정규 급여대장 수준으로)
-- 1) 대상자: 일반 / 외국인 일용직 구분 · 국적 · 체류 자격 · 체류 기간 끝 · 매달 공제(지급) 항목
-- 2) 지급 기록(근무 줄 · 명세)이 하나도 없는 대상자는 지울 수 있다(고용 기간도 함께). 기록이 있으면 지금처럼 지우지 못하고 「사용 중지」만
-- 3) 고용 기간의 보험 적용 상태에 「자동」(AUTO)을 더한다 — 앱이 그 달 근무일수 · 시간 · 체류 자격으로 정한다. 새 기간의 기본값은 세금 「일용근로소득」, 보험 「자동」
-- 4) 일용 명세에 항목별 내역(lines) · 4대보험 합계를 남긴다 — 일용 대장을 항목별로 보이기 위해
-- 5) 최고관리자의 금액 조정(대장 · 대상자 · 항목마다 바꾸기 / 더하기) 표
-- 되돌리기: 아래 칸 · 표를 지우고, 두 보호 함수를 guard_columns(0077 · 0039의 목록)로 되돌린다

-- 1) 대상자
alter table public.payroll_payees
  add column worker_kind text not null default 'GENERAL' check (worker_kind in ('GENERAL', 'FOREIGN')),
  add column nationality text check (nationality is null or nationality ~ '^[A-Z]{2}$'),          -- 나라 코드 (예: VN · TH)
  add column visa_type text check (visa_type is null or char_length(visa_type) between 1 and 10), -- 체류 자격 (예: E-9 · H-2 · F-4)
  add column stay_until date,                                                                     -- 체류 기간 끝
  add column monthly_items jsonb not null default '[]'::jsonb check (jsonb_typeof(monthly_items) = 'array'); -- 매달 한 번 넣는 항목 [{ code, label, kind, amount }]

-- 2) 지우기 — 기록이 없을 때만. 그 밖에는 바꿀 수 있는 칸만 바꾼다(guard_columns와 같은 규칙)
create or replace function public.payroll_payees_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := array['name', 'profile_id', 'phone', 'note', 'job_title', 'active', 'updated_by', 'worker_kind', 'nationality', 'visa_type', 'stay_until', 'monthly_items'];
begin
  if tg_op = 'DELETE' then
    if exists(select 1 from public.payroll_daily_work w where w.payee_id = old.id)
       or exists(select 1 from public.payroll_daily_statements s where s.payee_id = old.id) then
      raise exception 'payroll_payees: has records — use active=false' using errcode = 'PX004';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'payroll_payees: only % may change', allowed using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.payroll_payees_guard() from public, anon, authenticated;
drop trigger payroll_payees_guard on public.payroll_payees;
create trigger payroll_payees_guard before update or delete on public.payroll_payees
  for each row execute function public.payroll_payees_guard();

create or replace function public.payroll_payee_engagements_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := array['ends_on', 'day_rate', 'tax_state', 'ei_state', 'np_state', 'hi_state', 'basis_note', 'active', 'updated_by'];
begin
  if tg_op = 'DELETE' then
    if exists(select 1 from public.payroll_daily_work w where w.engagement_id = old.id) then
      raise exception 'payroll_payee_engagements: has work rows — use active=false' using errcode = 'PX004';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'payroll_payee_engagements: only % may change', allowed using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.payroll_payee_engagements_guard() from public, anon, authenticated;
drop trigger payroll_payee_engagements_guard on public.payroll_payee_engagements;
create trigger payroll_payee_engagements_guard before update or delete on public.payroll_payee_engagements
  for each row execute function public.payroll_payee_engagements_guard();

-- 3) 보험 「자동」 · 새 기본값
alter table public.payroll_payee_engagements drop constraint payroll_payee_engagements_ei_state_check;
alter table public.payroll_payee_engagements drop constraint payroll_payee_engagements_np_state_check;
alter table public.payroll_payee_engagements drop constraint payroll_payee_engagements_hi_state_check;
alter table public.payroll_payee_engagements add constraint payroll_payee_engagements_ei_state_check check (ei_state in ('UNKNOWN', 'AUTO', 'YES', 'NO'));
alter table public.payroll_payee_engagements add constraint payroll_payee_engagements_np_state_check check (np_state in ('UNKNOWN', 'AUTO', 'YES', 'NO'));
alter table public.payroll_payee_engagements add constraint payroll_payee_engagements_hi_state_check check (hi_state in ('UNKNOWN', 'AUTO', 'YES', 'NO'));
alter table public.payroll_payee_engagements alter column ei_state set default 'AUTO';
alter table public.payroll_payee_engagements alter column np_state set default 'AUTO';
alter table public.payroll_payee_engagements alter column hi_state set default 'AUTO';
alter table public.payroll_payee_engagements alter column tax_state set default 'DAILY';

-- 4) 일용 명세의 항목별 내역
alter table public.payroll_daily_statements
  add column lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),   -- [{ code, label, kind: PAYMENT|DEDUCTION|EMPLOYER, amount, source: AUTO|MANUAL|OVERRIDE, how }]
  add column insurance_total numeric(18,0);                                                      -- 근로자가 낸 4대보험 합계

-- 5) 최고관리자의 금액 조정
create table public.payroll_daily_adjustments (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.payroll_runs(id),
  payee_id   uuid not null references public.payroll_payees(id),
  code       text not null check (char_length(code) between 1 and 40),        -- 자동 항목(EI · NP · HI · LTC · INCOME_TAX · LOCAL_TAX)이면 그 금액을 바꾸고, 그 밖이면 새 항목을 더한다
  label      text not null check (char_length(label) between 1 and 40),
  kind       text not null check (kind in ('PAYMENT', 'DEDUCTION')),
  amount     numeric(18,0) not null check (amount >= 0 and amount <= 1000000000),
  reason     text not null check (char_length(btrim(reason)) between 2 and 300),
  active     boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index payroll_daily_adjustments_once on public.payroll_daily_adjustments (run_id, payee_id, code) where active;
alter table public.payroll_daily_adjustments enable row level security;
revoke all on public.payroll_daily_adjustments from anon, authenticated;
create trigger payroll_daily_adjustments_guard before update or delete on public.payroll_daily_adjustments
  for each row execute function public.guard_columns('active', 'updated_by');
