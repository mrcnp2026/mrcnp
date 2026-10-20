-- 20261020000066_pension_foreign_more.sql — 묶음 32 (의뢰인 2026-10-20 승인: 퇴직연금 DC · 외국인 칸 더하기) + 묶음 31 고침
-- 1) 퇴직연금 가입(retirement_pension_members) · 매달 부담금(retirement_pension_contributions) — DC형은 연간 임금총액의 1/12 이상(근로자퇴직급여보장법 제20조)
-- 2) staff_details: 영어 이름 · 체류자격외 활동허가 만료일 · 출입국 방문 예약일 · 숙소
-- 3) 묶음 31 고침: 퇴직 정산 초안에서 출국만기보험 금액을 고칠 수 있게 보호 칸 목록에 더한다(0065에서 빠뜨림)
-- 앱 서버만 읽고 쓴다(다른 급여 표와 같다). 지우지 않는다(끝내기 = active false · ended_on).
-- 되돌리기:
--   drop table public.retirement_pension_contributions; drop table public.retirement_pension_members;
--   alter table public.staff_details drop column english_name, drop column activity_permit_until, drop column immigration_visit_on, drop column dormitory;
--   (3은 0039의 보호 칸 목록으로 트리거를 다시 만든다)

create table public.retirement_pension_members (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.profiles(id),
  plan_kind        text not null check (plan_kind in ('DC', 'DB')),
  joined_on        date not null,                                                           -- 제도 가입일
  ended_on         date check (ended_on is null or ended_on >= joined_on),
  institution      text check (institution is null or char_length(institution) <= 60),     -- 금융기관
  opening_balance  numeric(18,0) check (opening_balance is null or opening_balance >= 0),  -- 처음 적립금(회계사무소 · 은행 자료)
  opening_as_of    date,                                                                    -- 처음 적립금의 기준일
  note             text check (note is null or char_length(note) <= 300),
  is_test          boolean not null default false,
  active           boolean not null default true,
  created_by       uuid not null references public.profiles(id),
  updated_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index retirement_pension_members_one_active on public.retirement_pension_members (employee_id, is_test) where active;

create table public.retirement_pension_contributions (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  month        date not null check (extract(day from month) = 1),                       -- 귀속 달 (1일)
  wage_total   numeric(18,0) not null check (wage_total >= 0),                           -- 그 달 임금총액
  amount       numeric(18,0) not null check (amount >= 0),                               -- 부담금 (임금총액 ÷ 12, 원 단위 반올림)
  source       text not null check (source in ('PAYROLL', 'MANUAL')),
  run_id       uuid references public.payroll_runs(id),
  paid_on      date,                                                                      -- 은행에 낸 날
  note         text check (note is null or char_length(note) <= 300),
  is_test      boolean not null default false,
  created_by   uuid not null references public.profiles(id),
  updated_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, month, is_test)
);

alter table public.retirement_pension_members enable row level security;
alter table public.retirement_pension_contributions enable row level security;
revoke all on public.retirement_pension_members, public.retirement_pension_contributions from anon, authenticated;

create trigger retirement_pension_members_guard before update or delete on public.retirement_pension_members
  for each row execute function public.guard_columns('plan_kind', 'joined_on', 'ended_on', 'institution', 'opening_balance', 'opening_as_of', 'note', 'active', 'updated_by', 'updated_at');
-- 은행에 낸 뒤(paid_on)에도 메모 · 낸 날은 고칠 수 있다. 금액은 앱이 낸 달을 다시 계산하지 않게 막는다
create trigger retirement_pension_contributions_guard before update or delete on public.retirement_pension_contributions
  for each row execute function public.guard_columns('wage_total', 'amount', 'source', 'run_id', 'paid_on', 'note', 'updated_by', 'updated_at');
create trigger retirement_pension_members_audit after insert or update on public.retirement_pension_members for each row execute function public.audit_row();
create trigger retirement_pension_contributions_audit after insert or update on public.retirement_pension_contributions for each row execute function public.audit_row();

alter table public.staff_details
  add column english_name text check (english_name is null or char_length(english_name) <= 60),
  add column activity_permit_until date,
  add column immigration_visit_on date,
  add column dormitory text check (dormitory is null or char_length(dormitory) <= 100);
comment on column public.staff_details.english_name is '영어 이름(여권 표기)';
comment on column public.staff_details.activity_permit_until is '체류자격외 활동허가 만료일 — 60 · 30일 전 알림';
comment on column public.staff_details.immigration_visit_on is '출입국 · 외국인청 방문 예약일 — 3일 전 · 당일 알림';
comment on column public.staff_details.dormitory is '숙소(회사 기숙사 등)';

drop trigger payroll_retirement_cases_guard on public.payroll_retirement_cases;
create trigger payroll_retirement_cases_guard before update or delete on public.payroll_retirement_cases
  for each row execute function public.guard_columns('input_snapshot', 'policy_refs', 'missing', 'amount', 'tax_amount', 'tax_basis', 'calc_mode', 'state', 'reason', 'result_hash', 'finalized_by', 'finalized_at', 'departure_insurance_amount');
