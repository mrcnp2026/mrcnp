-- 20261013000037_payroll_runs.sql
-- 급여 계산 바탕 (PRD v1.3 5 · 7 · 8 · 18 · 19 · 21장, 통합 개발 계획 M7) — 직원별 계약 · 세무 · 개인 항목, 급여대장 · 계산 세대 · 명세서 · 조정 · 공개.
-- ★ 운영 적용은 의뢰인이 변경 목록을 보고 승인한 뒤에만 한다 (`DB 변경 목록 — 묶음 4 (급여 계산).md`).
-- ★ 새 표 11개만 만든다. 기존 표는 고치지 않는다. 옛 급여 바탕 표(pay_contract_types · employee_pay · pay_rule_sets, 0030)도 그대로 둔다 — 검사용 자료만 들어 있고 새 계산은 읽지 않는다.
-- ★ 금액은 원 단위 정수(numeric(18,0)), 계산 중간값은 numeric(24,8), 비율은 numeric(18,10). 소수 계산 오차가 쌓이는 형식(float)을 쓰지 않는다.
-- ★ 새 표는 전부 브라우저에서 직접 읽지 못한다(정책 없음 = 전부 거부). 직원 본인의 공개된 명세서도 서버가 본인인지 확인하고 준다.
-- ★ 개인별 금액은 공용 변경 기록(audit_logs)에 넣지 않는다 — 급여 전용 기록(payroll_audit_events)에 "누가 · 무엇을 · 언제"만 남긴다. 값의 이력은 판(version)과 계산 세대가 그대로 갖고 있다.
-- ★ 주민번호 · 계좌번호는 이 묶음에 없다(암호화 저장 영역은 따로 설계해 다음 묶음에서).
-- ★ 이 파일에 요율 · 세액 · 가산율 숫자를 넣지 않는다.
--
-- 되돌리는 방법 (값을 넣기 전에만): 아래 표를 만든 반대 순서로 drop table, 함수 3개 drop.
--   ⚠️ 계약 · 대장이 들어간 뒤에는 되돌리지 말 것.

-- 1. 직원별 계약 판 — 월급/시급/연봉, 계약 금액, 시간 지급 기준, 월 환산 시간, 계약에 포함된 연장 · 휴일. 고치면 새 판
create table public.payroll_contract_versions (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.profiles(id),
  employment_id     uuid references public.staff_employment_periods(id),      -- 어느 재직 기간의 계약인가 (입사일이 없으면 비어 있다)
  pay_type          text not null check (pay_type in ('MONTHLY', 'HOURLY', 'ANNUAL')),
  amount            numeric(18,0) not null check (amount > 0),                -- 계약 금액 (월급 · 시급 · 연봉). 월 예상 실지급과 다른 값이다
  time_basis        text not null check (time_basis in ('ACTUAL', 'ROUNDED', 'SCHEDULE')),   -- 실제 시간 / 끊은 급여용 시간 / 일정 시간
  monthly_hours     numeric(7,2) check (monthly_hours is null or monthly_hours > 0),          -- 월 환산 시간 (예: 209). 필요할 때만
  annual_divisor    numeric(5,2) check (annual_divisor is null or annual_divisor > 0),        -- 연봉을 월로 나누는 수 — 비어 있으면 자동으로 12로 나누지 않는다(차단)
  included          jsonb not null default '{}'::jsonb,                       -- 계약에 포함된 연장/휴일 시간 · 고정 수당 명세 (서버가 형식 검사)
  ordinary_policy   jsonb not null default '{}'::jsonb,                       -- 통상임금에 넣는 항목
  valid_from        date not null,
  valid_to          date check (valid_to is null or valid_to > valid_from),   -- 이 날 전날까지 [시작, 끝)
  version           int not null check (version >= 1),
  status            text not null default 'active' check (status in ('active', 'superseded', 'withdrawn')),
  reason            text check (reason is null or char_length(reason) <= 500),
  supersedes_id     uuid references public.payroll_contract_versions(id),
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  unique (employee_id, version),
  exclude using gist (employee_id with =, daterange(valid_from, valid_to, '[)') with &&) where (status = 'active')
);

-- 2. 직원별 세무 · 보험 판 — 공제대상 가족, 소득세 선택 비율, 보험별 가입 여부(예/아니오/모름), 신고 보수, 감면 · 지원 · 학자금
create table public.payroll_employee_tax_versions (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.profiles(id),
  withholding_ratio int not null default 100 check (withholding_ratio in (80, 100, 120)),
  family_count      int not null default 1 check (family_count between 1 and 11),   -- 본인 포함 공제대상 가족 수
  child_count       int not null default 0 check (child_count between 0 and 20),    -- 8세 이상 20세 이하 자녀 수
  insurance         jsonb not null default '{}'::jsonb,   -- 보험마다 { state: YES|NO|UNKNOWN, basis, reportedWage, note } — 모름을 아니오로 치지 않는다
  reductions        jsonb not null default '{}'::jsonb,   -- 감면 · 지원 (대상 · 기간 · 비율 · 한도 · 근거)
  student_loan      jsonb not null default '{}'::jsonb,   -- 학자금 상환 (대상 · 기간 · 금액)
  valid_from        date not null,
  valid_to          date check (valid_to is null or valid_to > valid_from),
  version           int not null check (version >= 1),
  status            text not null default 'active' check (status in ('active', 'superseded', 'withdrawn')),
  reason            text check (reason is null or char_length(reason) <= 500),
  supersedes_id     uuid references public.payroll_employee_tax_versions(id),
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  unique (employee_id, version),
  exclude using gist (employee_id with =, daterange(valid_from, valid_to, '[)') with &&) where (status = 'active')
);

-- 3. 직원별 지급 · 공제 항목 — 그 직원에게 매달 붙는 고정 수당 · 회사 공제. 항목은 코드로 가리킨다(판은 계산할 때 그 달의 판을 쓴다)
create table public.payroll_employee_items (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  item_code   text not null check (char_length(item_code) between 2 and 40),
  amount      numeric(18,0),                                             -- 고정 금액 (비어 있으면 항목의 기본값). 0과 「안 적음」을 구분한다
  quantity    numeric(24,8),                                             -- 수량으로 계산하는 항목일 때
  note        text check (note is null or char_length(note) <= 300),
  valid_from  date not null,
  valid_to    date check (valid_to is null or valid_to > valid_from),
  active      boolean not null default true,
  created_by  uuid not null references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  exclude using gist (employee_id with =, item_code with =, daterange(valid_from, valid_to, '[)') with &&) where (active)
);

-- 4. 급여대장 — 종류(정규/상여/일용) · 귀속 기간 · 지급일 · 차수 · 연습/운영 · 정정 판. 상태: 초안 → 계산됨 → 검토됨 → 확정
create table public.payroll_runs (
  id                    uuid primary key default gen_random_uuid(),
  run_kind              text not null check (run_kind in ('REGULAR', 'BONUS', 'DAILY')),
  title                 text check (title is null or char_length(title) <= 80),
  period_from           date not null,
  period_to             date not null check (period_to > period_from),   -- 이 날 전날까지 [시작, 끝)
  pay_date              date not null,
  sequence              int not null default 1 check (sequence >= 1),     -- 상여 · 일용의 차수
  is_test               boolean not null,                                 -- 서버가 정한다. 연습 대장을 운영으로 복사하지 않는다
  revision              int not null default 1 check (revision >= 1),     -- 정정하면 올라간다. 앞 판은 그대로 남는다
  status                text not null default 'DRAFT' check (status in ('DRAFT', 'CALCULATED', 'REVIEWED', 'FINALIZED')),
  version               int not null default 1 check (version >= 1),      -- 동시에 고칠 때 먼저 저장한 쪽만 성공하게
  current_generation_id uuid,                                             -- 지금 보고 있는 계산 세대 (아래 6번 표)
  totals                jsonb not null default '{}'::jsonb,               -- 대상 수 · 지급/공제/실지급/사업주 부담 합계 (금액은 문자열)
  supersedes_id         uuid references public.payroll_runs(id),          -- 정정본이면 원본
  correction_reason     text check (correction_reason is null or char_length(correction_reason) between 2 and 500),
  created_by            uuid not null references public.profiles(id),
  created_at            timestamptz not null default now(),
  reviewed_by           uuid references public.profiles(id),
  reviewed_at           timestamptz,
  finalized_by          uuid references public.profiles(id),
  finalized_at          timestamptz,
  unique (run_kind, period_from, period_to, sequence, is_test, revision),
  check (revision = 1 or (supersedes_id is not null and correction_reason is not null)),
  check (status not in ('REVIEWED', 'FINALIZED') or (reviewed_by is not null and reviewed_at is not null and current_generation_id is not null)),
  check (status <> 'FINALIZED' or (finalized_by is not null and finalized_at is not null))
);
create index on public.payroll_runs (period_from, is_test, status);

-- 5. 대장의 대상자 — 계산할 때의 대상을 고정한다. 뺀 사람은 사유를 남긴다(기록이 없다는 이유만으로 빼지 않는다)
create table public.payroll_run_members (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.payroll_runs(id),
  employee_id      uuid not null references public.profiles(id),
  employment_id    uuid references public.staff_employment_periods(id),
  inclusion_state  text not null default 'INCLUDED' check (inclusion_state in ('INCLUDED', 'EXCLUDED')),
  exclusion_reason text check (exclusion_reason is null or char_length(exclusion_reason) between 2 and 300),
  updated_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  unique (run_id, employee_id),
  check (inclusion_state <> 'EXCLUDED' or exclusion_reason is not null)
);

-- 6. 계산 세대 — 계산을 한 번 돌릴 때마다 한 줄. 실패한 세대가 앞의 성공본을 덮지 않는다
create table public.payroll_calculation_generations (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.payroll_runs(id),
  seq            int not null check (seq >= 1),
  input_hash     text not null,                                   -- 계산에 쓴 입력(근태 마감 · 계약 · 항목 · 기준 자료) 전체의 해시
  engine_version text not null check (char_length(engine_version) between 1 and 40),
  state          text not null default 'RUNNING' check (state in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  result_hash    text,
  summary        jsonb not null default '{}'::jsonb,              -- 계산됨 · 차단 수, 합계
  error_code     text,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  ended_at       timestamptz,
  unique (run_id, seq),
  check (state <> 'SUCCEEDED' or result_hash is not null)
);
alter table public.payroll_runs add constraint payroll_runs_generation_fk foreign key (current_generation_id) references public.payroll_calculation_generations(id);

-- 7. 명세서 — 계산 세대 × 직원. 계산에 쓴 입력과 기준 자료 묶음을 그대로 담는다. 한 번 넣으면 고치지 않는다
create table public.payroll_statements (
  id               uuid primary key default gen_random_uuid(),
  generation_id    uuid not null references public.payroll_calculation_generations(id),
  run_id           uuid not null references public.payroll_runs(id),
  employee_id      uuid not null references public.profiles(id),
  employment_id    uuid references public.staff_employment_periods(id),
  close_id         uuid references public.attendance_closes(id),          -- 어느 근태 마감을 썼는가
  contract_id      uuid references public.payroll_contract_versions(id),
  tax_id           uuid references public.payroll_employee_tax_versions(id),
  state            text not null check (state in ('OK', 'BLOCKED')),      -- BLOCKED = 자료가 없어 계산하지 못함. 0원 명세로 확정하지 못한다
  blockers         jsonb not null default '[]'::jsonb,                    -- 막은 이유 · 경고 (해결 화면 주소 포함)
  snapshot         jsonb not null,                                        -- 입력: 계약 · 세무 · 근태 시간 · 휴가 (금액은 문자열)
  reference_bundle jsonb not null default '{}'::jsonb,                    -- 쓴 기준 자료(요율 · 세액표 · 정책)의 판 번호들
  pay_total        numeric(18,0),                                         -- BLOCKED면 비어 있다 (0과 다르다)
  deduction_total  numeric(18,0),
  net_total        numeric(18,0),
  employer_total   numeric(18,0),                                         -- 사업주 부담 (직원 실지급에서 빼지 않는다)
  result_hash      text not null,
  created_at       timestamptz not null default now(),
  unique (generation_id, employee_id),
  check (state <> 'OK' or (pay_total is not null and deduction_total is not null and net_total is not null and net_total = pay_total - deduction_total))
);
create index on public.payroll_statements (run_id, employee_id);
create index on public.payroll_statements (employee_id);

-- 8. 명세서의 항목 줄 — 항목 코드 · 그때의 이름 · 수량 · 단가 · 계수 · 끝수 처리 전 값 · 금액 · 계산 근거. 고치지 않는다
create table public.payroll_statement_items (
  id              uuid primary key default gen_random_uuid(),
  statement_id    uuid not null references public.payroll_statements(id),
  line_no         int not null check (line_no >= 1),
  item_code       text not null check (char_length(item_code) between 2 and 40),
  item_version_id uuid references public.payroll_item_versions(id),
  kind            text not null check (kind in ('PAYMENT', 'DEDUCTION', 'EMPLOYER')),   -- 사업주 부담은 따로 (실지급에 들어가지 않는다)
  label_ko        text not null,
  label_en        text,
  quantity        numeric(24,8),
  unit_price      numeric(24,8),
  factor          numeric(18,10),
  raw_value       numeric(24,8),                         -- 끝수 처리 전
  amount          numeric(18,0) not null,                -- 부호 있음: 환급 · 반환은 음수
  source          text not null check (source in ('AUTO', 'MANUAL', 'OVERRIDE')),
  calc_trace      jsonb not null default '{}'::jsonb,    -- 쓴 시간 · 기준액 · 상하한 · 자료 판 · 끝수 규칙
  override_id     uuid,
  created_at      timestamptz not null default now(),
  unique (statement_id, item_code, line_no)
);

-- 9. 금액 조정 — 자동 계산 금액을 직접 고치지 않고, 원래 금액 · 바꿀 금액 · 사유 · 담당자를 따로 남긴다. 다음 계산부터 반영된다
create table public.payroll_statement_overrides (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.payroll_runs(id),
  employee_id     uuid not null references public.profiles(id),
  item_code       text not null check (char_length(item_code) between 2 and 40),
  kind            text not null check (kind in ('PAYMENT', 'DEDUCTION')),
  original_amount numeric(18,0),                          -- 자동 계산 금액 (수동으로 새로 넣는 항목이면 비어 있다)
  proposed_amount numeric(18,0) not null,
  reason          text not null check (char_length(btrim(reason)) between 2 and 500),
  active          boolean not null default true,          -- 거두면 끈다(지우지 않는다)
  created_by      uuid not null references public.profiles(id),
  updated_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create unique index payroll_statement_overrides_one on public.payroll_statement_overrides (run_id, employee_id, item_code) where active;
alter table public.payroll_statement_items add constraint payroll_statement_items_override_fk foreign key (override_id) references public.payroll_statement_overrides(id);

-- 10. 공개 기록 — 확정한 명세서를 직원에게 공개 · 회수 · 정정본으로 바꾼 일. 넣기만 한다. 공개가 은행 지급을 뜻하지 않는다
create table public.payroll_publication_events (
  id                       bigserial primary key,
  statement_id             uuid not null references public.payroll_statements(id),
  run_id                   uuid not null references public.payroll_runs(id),
  employee_id              uuid not null references public.profiles(id),
  kind                     text not null check (kind in ('PUBLISHED', 'UNPUBLISHED', 'SUPERSEDED')),
  superseding_statement_id uuid references public.payroll_statements(id),
  reason                   text check (reason is null or char_length(reason) <= 300),
  actor_id                 uuid not null references public.profiles(id),
  created_at               timestamptz not null default now(),
  check (kind <> 'UNPUBLISHED' or reason is not null)
);
create index on public.payroll_publication_events (employee_id, statement_id);

-- 11. 급여 전용 기록 — 누가 · 무엇을 · 언제. 금액은 적지 않는다
create table public.payroll_audit_events (
  id            bigserial primary key,
  actor_id      uuid references public.profiles(id),
  action        text not null check (char_length(action) between 2 and 60),   -- contract.save · run.calculate · run.finalize · statement.view …
  subject_table text not null,
  subject_id    text,
  run_id        uuid references public.payroll_runs(id),
  employee_id   uuid references public.profiles(id),
  request_id    text,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index on public.payroll_audit_events (created_at);
create index on public.payroll_audit_events (employee_id, created_at);

alter table public.payroll_contract_versions       enable row level security;
alter table public.payroll_employee_tax_versions   enable row level security;
alter table public.payroll_employee_items          enable row level security;
alter table public.payroll_runs                    enable row level security;
alter table public.payroll_run_members             enable row level security;
alter table public.payroll_calculation_generations enable row level security;
alter table public.payroll_statements              enable row level security;
alter table public.payroll_statement_items         enable row level security;
alter table public.payroll_statement_overrides     enable row level security;
alter table public.payroll_publication_events      enable row level security;
alter table public.payroll_audit_events            enable row level security;
revoke all on public.payroll_contract_versions, public.payroll_employee_tax_versions, public.payroll_employee_items, public.payroll_runs, public.payroll_run_members,
  public.payroll_calculation_generations, public.payroll_statements, public.payroll_statement_items, public.payroll_statement_overrides,
  public.payroll_publication_events, public.payroll_audit_events from anon, authenticated;
revoke all on sequence public.payroll_publication_events_id_seq, public.payroll_audit_events_id_seq from anon, authenticated;

-- 지우지 않는다. 판의 내용 · 명세서 · 항목 줄 · 공개 기록 · 급여 기록은 고정이다
create trigger payroll_contract_versions_guard before update or delete on public.payroll_contract_versions
  for each row execute function public.guard_columns('status', 'valid_to');
create trigger payroll_employee_tax_versions_guard before update or delete on public.payroll_employee_tax_versions
  for each row execute function public.guard_columns('status', 'valid_to');
create trigger payroll_employee_items_guard before update or delete on public.payroll_employee_items
  for each row execute function public.guard_columns('valid_to', 'active', 'updated_by');
create trigger payroll_runs_guard before update or delete on public.payroll_runs
  for each row execute function public.guard_columns('title', 'pay_date', 'status', 'version', 'current_generation_id', 'totals', 'reviewed_by', 'reviewed_at', 'finalized_by', 'finalized_at');
create trigger payroll_run_members_guard before update or delete on public.payroll_run_members
  for each row execute function public.guard_columns('inclusion_state', 'exclusion_reason', 'updated_by');
create trigger payroll_calculation_generations_guard before update or delete on public.payroll_calculation_generations
  for each row execute function public.guard_columns('state', 'result_hash', 'summary', 'error_code', 'ended_at');
create trigger payroll_statements_guard before update or delete on public.payroll_statements
  for each row execute function public.guard_columns();
create trigger payroll_statement_items_guard before update or delete on public.payroll_statement_items
  for each row execute function public.guard_columns();
create trigger payroll_statement_overrides_guard before update or delete on public.payroll_statement_overrides
  for each row execute function public.guard_columns('active', 'updated_by');
create trigger payroll_publication_events_guard before update or delete on public.payroll_publication_events
  for each row execute function public.guard_columns();
create trigger payroll_audit_events_guard before update or delete on public.payroll_audit_events
  for each row execute function public.guard_columns();

-- 대장의 상태는 정해진 길로만 간다. 확정한 대장은 아무것도 바뀌지 않는다(잘못됐으면 정정본을 새로 만든다)
create or replace function public.payroll_run_state_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'FINALIZED' then
    raise exception 'payroll_runs: a finalized run cannot change — create a correction revision' using errcode = 'PR001';
  end if;
  if new.status <> old.status and not (
       (old.status = 'DRAFT'      and new.status = 'CALCULATED')
    or (old.status = 'CALCULATED' and new.status in ('CALCULATED', 'REVIEWED', 'DRAFT'))
    or (old.status = 'REVIEWED'   and new.status in ('FINALIZED', 'CALCULATED', 'DRAFT'))
  ) then
    raise exception 'payroll_runs: status cannot go from % to %', old.status, new.status using errcode = 'PR002';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'payroll_runs: version must increase by one (someone else saved first)' using errcode = 'PR003';
  end if;
  return new;
end;
$$;
create trigger payroll_runs_state before update on public.payroll_runs
  for each row execute function public.payroll_run_state_guard();

-- 확정한 대장에는 대상 · 계산 세대 · 명세서 · 항목 줄 · 조정을 더 넣거나 바꾸지 못한다
create or replace function public.payroll_run_frozen_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rid uuid;
  st  text;
begin
  if tg_table_name = 'payroll_statement_items' then
    select s.run_id into rid from public.payroll_statements s where s.id = new.statement_id;
  else
    rid := new.run_id;
  end if;
  select r.status into st from public.payroll_runs r where r.id = rid for share;
  if st = 'FINALIZED' then
    raise exception '%: the run is finalized', tg_table_name using errcode = 'PR001';
  end if;
  return new;
end;
$$;
create trigger payroll_run_members_frozen before insert or update on public.payroll_run_members
  for each row execute function public.payroll_run_frozen_guard();
create trigger payroll_calculation_generations_frozen before insert or update on public.payroll_calculation_generations
  for each row execute function public.payroll_run_frozen_guard();
create trigger payroll_statements_frozen before insert on public.payroll_statements
  for each row execute function public.payroll_run_frozen_guard();
create trigger payroll_statement_items_frozen before insert on public.payroll_statement_items
  for each row execute function public.payroll_run_frozen_guard();
create trigger payroll_statement_overrides_frozen before insert or update on public.payroll_statement_overrides
  for each row execute function public.payroll_run_frozen_guard();

-- 공개는 확정한 대장의, 그 대장이 지금 가리키는 계산 세대의 명세서만
create or replace function public.payroll_publication_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  select (r.status = 'FINALIZED' and r.current_generation_id = s.generation_id and s.state = 'OK' and s.run_id = new.run_id and s.employee_id = new.employee_id)
    into ok
    from public.payroll_statements s join public.payroll_runs r on r.id = s.run_id
   where s.id = new.statement_id;
  if not coalesce(ok, false) then
    raise exception 'payroll_publication_events: only a statement of a finalized run can be published' using errcode = 'PR004';
  end if;
  return new;
end;
$$;
create trigger payroll_publication_events_check before insert on public.payroll_publication_events
  for each row execute function public.payroll_publication_guard();

revoke all on function public.payroll_run_state_guard(), public.payroll_run_frozen_guard(), public.payroll_publication_guard() from public, anon, authenticated;
