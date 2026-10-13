-- 20261014000039_payroll_extras.sql
-- 사회보험 취득/상실 · 고지(정산) 보험료, 일용직, 퇴직급여, 민감정보(주민번호 · 계좌) 보관 (PRD v1.3 9장 · 10.3 · 18.4~18.6 · 21.2, 통합 개발 계획 M9).
-- ★ 운영 적용은 의뢰인이 변경 목록을 보고 승인한 뒤에만 한다 (`DB 변경 목록 — 묶음 6 (보험 · 일용직 · 퇴직 · 민감정보).md`).
-- ★ 새 표 12개만 만든다. 기존 표는 고치지 않는다. 적용 직후에는 아무것도 달라지지 않는다(빈 표).
-- ★ 새 표는 브라우저에서 직접 읽지 못한다(정책 없음 = 전부 거부). 서버가 「급여를 볼 수 있는 관리자」인지 확인하고 읽고 쓴다.
-- ★ 금액이 들어가는 표는 공용 변경 기록(audit_logs)에 복사하지 않는다 — 급여 전용 기록(payroll_audit_events)에 「누가 · 무엇을 · 언제」만 남긴다.
-- ★ 주민번호 · 계좌는 암호문만 들어간다. 푸는 열쇠는 DB에 없다(서버 비밀 설정). 원문을 본 기록은 따로 남는다.
-- ★ 공단 · 은행 · 홈택스로 보내는 기능은 없다. 「신고 완료」는 담당자가 확인한 날짜와 근거를 적는 칸일 뿐이다.
--
-- 되돌리는 방법 (값을 넣기 전에만): 아래 표를 만든 반대 순서로 drop table.

-- ══ 사회보험 ══

-- 1. 취득 · 상실 확인 — 직원 × 보험 × 취득/상실. 가입 여부(세무 판)와 신고 확인을 구분한다. 프로그램이 신고하지 않는다
create table public.payroll_insurance_enrollments (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  insurer      text not null check (insurer in ('NP', 'HI', 'EI', 'IA')),            -- 국민연금 / 건강보험 / 고용보험 / 산재보험
  event        text not null check (event in ('ACQUIRE', 'LOSE')),                   -- 취득 / 상실
  qualify_on   date not null,                                                        -- 자격 취득일 · 상실일
  state        text not null default 'UNREPORTED' check (state in ('UNREPORTED', 'CHECKING', 'CONFIRMED')),   -- 미신고 / 확인 중 / 확인 완료
  confirmed_on date,                                                                 -- 신고가 처리된 것을 확인한 날
  evidence     text check (evidence is null or char_length(evidence) <= 300),        -- 확인 근거 (접수번호 · 확인서 등 — 주민번호는 적지 않는다)
  note         text check (note is null or char_length(note) <= 300),
  active       boolean not null default true,                                        -- 잘못 넣은 줄은 끈다
  version      int not null default 1 check (version >= 1),
  created_by   uuid not null references public.profiles(id),
  updated_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  check (state <> 'CONFIRMED' or (confirmed_on is not null and evidence is not null))
);
create unique index payroll_insurance_enrollments_one on public.payroll_insurance_enrollments (employee_id, insurer, event, qualify_on) where active;

-- 2. 고지 자료 한 묶음 — 공단에서 받은 파일 한 개 또는 손으로 넣은 한 번. 원본 파일은 보관하지 않고 지문(해시)만 남긴다
create table public.payroll_insurance_notice_files (
  id           uuid primary key default gen_random_uuid(),
  insurer      text not null check (insurer in ('NP', 'HI', 'EI', 'IA')),
  notice_month date not null check (extract(day from notice_month) = 1),             -- 고지월 (그 달 1일로 적는다). 급여 귀속월과 다를 수 있다
  source_kind  text not null check (source_kind in ('FILE', 'MANUAL')),
  file_name    text check (file_name is null or char_length(file_name) <= 200),
  file_hash    text check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$'),       -- 같은 파일을 두 번 올리지 못하게
  parser       text check (parser is null or char_length(parser) <= 60),             -- 어떤 양식으로 읽었는가
  row_count    int not null default 0 check (row_count >= 0),
  state        text not null default 'SAVED' check (state in ('SAVED', 'WITHDRAWN')),
  withdraw_reason text check (withdraw_reason is null or char_length(withdraw_reason) between 2 and 300),
  is_test      boolean not null default false,
  uploaded_by  uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  check (source_kind <> 'FILE' or file_hash is not null),
  check (state <> 'WITHDRAWN' or withdraw_reason is not null)
);
create unique index payroll_insurance_notice_files_once on public.payroll_insurance_notice_files (insurer, notice_month, file_hash, is_test) where state = 'SAVED' and file_hash is not null;

-- 3. 고지 줄 — 파일의 한 사람 한 줄. 받은 숫자를 그대로 둔다. 이름만 같다고 직원에 자동으로 잇지 않는다
create table public.payroll_insurance_notices (
  id            uuid primary key default gen_random_uuid(),
  file_id       uuid not null references public.payroll_insurance_notice_files(id),
  row_key       text not null check (char_length(row_key) between 1 and 80),          -- 파일 안에서 이 줄을 가리키는 값
  raw_name      text check (raw_name is null or char_length(raw_name) <= 80),         -- 파일에 적힌 이름
  ident_hint    text check (ident_hint is null or char_length(ident_hint) <= 20),     -- 가려진 식별 표시 (예: 생년월일 앞 6자리). 주민번호 전체는 넣지 않는다
  employee_id   uuid references public.profiles(id),                                  -- 담당자가 확인해 이은 직원
  mapping_state text not null default 'UNMAPPED' check (mapping_state in ('UNMAPPED', 'MAPPED', 'IGNORED')),
  mapping_basis text check (mapping_basis is null or char_length(mapping_basis) <= 200),   -- 무엇을 보고 이었는가 / 왜 뺐는가
  mapped_by     uuid references public.profiles(id),
  mapped_at     timestamptz,
  components    jsonb not null,                                                       -- { 구성 열쇠: 금액(문자열) } — 근로자/사업주 × 산출 · 정산 · 연말 · 환급. 추가 공제는 양수, 환급은 음수
  created_at    timestamptz not null default now(),
  unique (file_id, row_key),
  check (mapping_state <> 'MAPPED' or (employee_id is not null and mapped_by is not null and mapping_basis is not null)),
  check (mapping_state <> 'IGNORED' or mapping_basis is not null)
);
create index on public.payroll_insurance_notices (employee_id);

-- 4. 고지 금액을 급여대장에 넣은 기록 — 같은 고지 구성을 두 대장에 넣지 못한다
create table public.payroll_insurance_allocations (
  id            uuid primary key default gen_random_uuid(),
  notice_id     uuid not null references public.payroll_insurance_notices(id),
  component_key text not null check (char_length(component_key) between 2 and 60),
  run_id        uuid not null references public.payroll_runs(id),
  employee_id   uuid not null references public.profiles(id),
  amount        numeric(18,0) not null,                                               -- 추가 공제 양수 / 환급 음수
  override_id   uuid references public.payroll_statement_overrides(id),               -- 대장에 넣은 수동 항목
  active        boolean not null default true,                                        -- 대장에서 빼면 끈다
  created_by    uuid not null references public.profiles(id),
  updated_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create unique index payroll_insurance_allocations_once on public.payroll_insurance_allocations (notice_id, component_key) where active;
create index on public.payroll_insurance_allocations (run_id, employee_id);

-- ══ 일용직 ══

-- 5. 지급 대상자 — 로그인 계정이 없어도 등록한다. 이름이 같아도 다른 사람일 수 있다(내부번호로 구분)
create table public.payroll_payees (
  id          uuid primary key default gen_random_uuid(),
  internal_no text not null check (char_length(btrim(internal_no)) between 1 and 30),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  profile_id  uuid references public.profiles(id),                                    -- 로그인 직원과 같은 사람이면 잇는다 (같은 근무가 두 대장에 들어가지 않게)
  phone       text check (phone is null or char_length(phone) <= 30),
  note        text check (note is null or char_length(note) <= 300),
  active      boolean not null default true,
  is_test     boolean not null default false,
  created_by  uuid not null references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (internal_no)
);
create unique index payroll_payees_profile on public.payroll_payees (profile_id) where profile_id is not null and active;

-- 6. 일용 고용 기간 — 기간 · 현장(프로젝트) · 일단가 · 세무/보험 적용 상태. 「모름」과 「아니오」를 구분한다
create table public.payroll_payee_engagements (
  id          uuid primary key default gen_random_uuid(),
  payee_id    uuid not null references public.payroll_payees(id),
  starts_on   date not null,
  ends_on     date check (ends_on is null or ends_on >= starts_on),
  project     text not null default '' check (char_length(project) <= 80),
  day_rate    numeric(18,0) check (day_rate is null or day_rate > 0),
  tax_state   text not null default 'UNKNOWN' check (tax_state in ('UNKNOWN', 'DAILY', 'NONE')),            -- 일용근로소득으로 원천징수 / 대상 아님 / 모름(계산 차단)
  ei_state    text not null default 'UNKNOWN' check (ei_state in ('UNKNOWN', 'YES', 'NO')),                 -- 고용보험
  np_state    text not null default 'UNKNOWN' check (np_state in ('UNKNOWN', 'YES', 'NO')),                 -- 국민연금
  hi_state    text not null default 'UNKNOWN' check (hi_state in ('UNKNOWN', 'YES', 'NO')),                 -- 건강보험
  basis_note  text check (basis_note is null or char_length(basis_note) <= 300),                            -- 적용 상태를 정한 근거
  active      boolean not null default true,
  created_by  uuid not null references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  exclude using gist (payee_id with =, project with =, daterange(starts_on, ends_on, '[]') with &&) where (active)
);

-- 7. 일용 근무 — 하루 한 줄. 같은 사람 · 날짜 · 현장 · 구간은 한 번만
create table public.payroll_daily_work (
  id            uuid primary key default gen_random_uuid(),
  payee_id      uuid not null references public.payroll_payees(id),
  engagement_id uuid not null references public.payroll_payee_engagements(id),
  work_date     date not null,
  project       text not null default '' check (char_length(project) <= 80),
  segment_key   text not null default 'A' check (char_length(segment_key) between 1 and 10),   -- 하루에 나눠 일한 경우의 구간 (담당자가 확인하고 넣는다)
  quantity      numeric(5,2) not null default 1 check (quantity > 0 and quantity <= 3),        -- 공수 (1 = 하루)
  day_rate      numeric(18,0) not null check (day_rate > 0),
  items         jsonb not null default '[]'::jsonb,                                            -- 그 밖의 지급 · 비과세 항목 [{ code, label, taxable, amount }]
  basis_note    text check (basis_note is null or char_length(basis_note) <= 300),
  status        text not null default 'DRAFT' check (status in ('DRAFT', 'CONFIRMED', 'VOID')),
  is_test       boolean not null default false,
  version       int not null default 1 check (version >= 1),
  created_by    uuid not null references public.profiles(id),
  updated_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create unique index payroll_daily_work_once on public.payroll_daily_work (payee_id, work_date, project, segment_key, is_test) where status <> 'VOID';
create index on public.payroll_daily_work (work_date);

-- 8. 일용 지급명세 — 일용 대장(payroll_runs의 DAILY)의 계산 세대 × 대상자 × 근무월. 한 번 넣으면 고치지 않는다
create table public.payroll_daily_statements (
  id            uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.payroll_calculation_generations(id),
  run_id        uuid not null references public.payroll_runs(id),
  payee_id      uuid not null references public.payroll_payees(id),
  work_month    date not null check (extract(day from work_month) = 1),               -- 근무월 (지급월은 대장의 지급일)
  state         text not null check (state in ('OK', 'BLOCKED')),                      -- BLOCKED = 자료가 없어 계산하지 못함. 0원으로 확정하지 못한다
  blockers      jsonb not null default '[]'::jsonb,
  snapshot      jsonb not null,                                                        -- 쓴 근무 줄 · 단가 · 적용 상태 · 기준 자료
  work_days     numeric(6,2),
  gross_total   numeric(18,0),
  taxable_total numeric(18,0),
  nontax_total  numeric(18,0),
  income_tax    numeric(18,0),
  local_tax     numeric(18,0),
  other_deduction numeric(18,0),
  net_total     numeric(18,0),
  result_hash   text not null,
  created_at    timestamptz not null default now(),
  unique (generation_id, payee_id, work_month),
  check (state <> 'OK' or (gross_total is not null and net_total is not null and income_tax is not null and local_tax is not null))
);
create index on public.payroll_daily_statements (run_id, payee_id);

-- ══ 퇴직급여 ══

-- 9. 퇴직급여 건 — 추계 / 퇴직 정산 / 중간정산. 넣은 값과 계산 근거를 그대로 담는다. 확정하면 고치지 않는다(정정은 새 판)
create table public.payroll_retirement_cases (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.profiles(id),
  employment_id      uuid references public.staff_employment_periods(id),
  case_kind          text not null check (case_kind in ('ESTIMATE', 'FINAL', 'INTERIM')),
  period_from        date not null,                                                    -- 정산 기간 [시작, 끝]
  period_to          date not null check (period_to >= period_from),
  base_on            date not null,                                                    -- 기준일
  input_snapshot     jsonb not null,                                                   -- 최근 3개월 임금 · 상여 · 연차수당 · 제외 기간 · 중간정산 이력 등 넣은 값
  policy_refs        jsonb not null default '{}'::jsonb,                               -- 쓴 기준 자료의 판 번호
  missing            jsonb not null default '[]'::jsonb,                               -- 빠진 필수 입력 (있으면 금액을 내지 않는다)
  amount             numeric(18,0),                                                    -- 퇴직급여. 필수 입력이 빠졌으면 비어 있다 (0과 다르다)
  tax_amount         numeric(18,0),                                                    -- 퇴직소득세 — 프로그램이 계산하지 않는다. 확인된 값을 손으로 넣는다
  tax_basis          text check (tax_basis is null or char_length(tax_basis) <= 300),  -- 세액의 근거
  calc_mode          text not null default 'MANUAL_CHECK' check (calc_mode in ('MANUAL_CHECK', 'VERIFIED_RULE')),   -- 수동 검산 / 검증된 규칙
  state              text not null default 'DRAFT' check (state in ('DRAFT', 'FINALIZED', 'WITHDRAWN')),
  revision           int not null default 1 check (revision >= 1),
  supersedes_id      uuid references public.payroll_retirement_cases(id),
  reason             text check (reason is null or char_length(reason) <= 500),
  result_hash        text,
  is_test            boolean not null default false,
  created_by         uuid not null references public.profiles(id),
  finalized_by       uuid references public.profiles(id),
  finalized_at       timestamptz,
  created_at         timestamptz not null default now(),
  check (state <> 'FINALIZED' or (case_kind <> 'ESTIMATE' and amount is not null and finalized_by is not null and finalized_at is not null and result_hash is not null and missing = '[]'::jsonb)),
  check (revision = 1 or supersedes_id is not null),
  -- 확정한 퇴직 정산 · 중간정산의 기간은 한 직원 안에서 겹치지 못한다 (같은 기간을 두 번 정산하지 않게)
  exclude using gist (employee_id with =, daterange(period_from, period_to, '[]') with &&) where (state = 'FINALIZED' and not is_test)
);
create index on public.payroll_retirement_cases (employee_id, created_at desc);

-- ══ 민감정보 ══

-- 10. 주민번호 · 외국인등록번호 · 계좌 — 암호문만. 일반 직원 표(profiles)에는 넣지 않는다
create table public.payroll_sensitive_records (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid references public.profiles(id),
  payee_id      uuid references public.payroll_payees(id),
  record_kind   text not null check (record_kind in ('RRN', 'FOREIGN_NO', 'BANK')),
  ciphertext    text not null check (char_length(ciphertext) between 20 and 4000),     -- 서버가 암호화한 값 (AES-256-GCM). 푸는 열쇠는 DB에 없다
  key_version   int not null check (key_version >= 1),                                 -- 열쇠를 바꿀 때 어느 열쇠로 잠갔는지
  lookup_hmac   text check (lookup_hmac is null or lookup_hmac ~ '^[0-9a-f]{64}$'),    -- 같은 번호인지 찾기 위한 값 (열쇠가 있어야 만들 수 있다 — 단순 해시가 아니다)
  masked        text not null check (char_length(masked) between 1 and 40),            -- 화면에 보이는 가려진 값 (예: 900101-1******, **은행 ****1234)
  need_basis    text not null check (char_length(btrim(need_basis)) between 2 and 300),   -- 왜 모으는가 (수집 근거)
  active        boolean not null default true,                                         -- 바꾸면 앞 줄을 끄고 새 줄을 넣는다
  created_by    uuid not null references public.profiles(id),
  updated_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  check ((employee_id is not null)::int + (payee_id is not null)::int = 1)
);
create unique index payroll_sensitive_records_emp on public.payroll_sensitive_records (employee_id, record_kind) where active and employee_id is not null;
create unique index payroll_sensitive_records_payee on public.payroll_sensitive_records (payee_id, record_kind) where active and payee_id is not null;

-- 11. 원문 열람 권한 — 급여를 보는 관리자라도 따로 받아야 한다. 스스로 줄 수 없고, 기한이 있다
create table public.payroll_sensitive_grants (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id),
  granted_by  uuid not null references public.profiles(id),
  reason      text not null check (char_length(btrim(reason)) between 2 and 300),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  check (admin_id <> granted_by),
  check (expires_at > created_at and expires_at <= created_at + interval '366 days')
);
create index on public.payroll_sensitive_grants (admin_id, expires_at);

-- 12. 민감정보 기록 — 누가 · 언제 · 무엇을 · 왜 (넣음 / 바꿈 / 원문 봄 / 파일에 넣음). 원문은 적지 않는다. 고치지 않는다
create table public.payroll_sensitive_access_logs (
  id          bigserial primary key,
  actor_id    uuid not null references public.profiles(id),
  record_id   uuid references public.payroll_sensitive_records(id),
  action      text not null check (action in ('CREATE', 'REPLACE', 'DISABLE', 'VIEW', 'EXPORT', 'DENIED')),
  reason      text check (reason is null or char_length(reason) <= 300),
  request_id  text,
  created_at  timestamptz not null default now(),
  check (action not in ('VIEW', 'EXPORT') or reason is not null)
);
create index on public.payroll_sensitive_access_logs (record_id, created_at);
create index on public.payroll_sensitive_access_logs (actor_id, created_at);

-- ══ 잠금 ══

alter table public.payroll_insurance_enrollments  enable row level security;
alter table public.payroll_insurance_notice_files enable row level security;
alter table public.payroll_insurance_notices      enable row level security;
alter table public.payroll_insurance_allocations  enable row level security;
alter table public.payroll_payees                 enable row level security;
alter table public.payroll_payee_engagements      enable row level security;
alter table public.payroll_daily_work             enable row level security;
alter table public.payroll_daily_statements       enable row level security;
alter table public.payroll_retirement_cases       enable row level security;
alter table public.payroll_sensitive_records      enable row level security;
alter table public.payroll_sensitive_grants       enable row level security;
alter table public.payroll_sensitive_access_logs  enable row level security;
revoke all on public.payroll_insurance_enrollments, public.payroll_insurance_notice_files, public.payroll_insurance_notices, public.payroll_insurance_allocations,
  public.payroll_payees, public.payroll_payee_engagements, public.payroll_daily_work, public.payroll_daily_statements, public.payroll_retirement_cases,
  public.payroll_sensitive_records, public.payroll_sensitive_grants, public.payroll_sensitive_access_logs from anon, authenticated;
revoke all on sequence public.payroll_sensitive_access_logs_id_seq from anon, authenticated;

-- 지우지 않는다. 바꿀 수 있는 칸만 열어 둔다
create trigger payroll_insurance_enrollments_guard before update or delete on public.payroll_insurance_enrollments
  for each row execute function public.guard_columns('state', 'confirmed_on', 'evidence', 'note', 'active', 'version', 'updated_by');
create trigger payroll_insurance_notice_files_guard before update or delete on public.payroll_insurance_notice_files
  for each row execute function public.guard_columns('state', 'withdraw_reason');
create trigger payroll_insurance_notices_guard before update or delete on public.payroll_insurance_notices
  for each row execute function public.guard_columns('employee_id', 'mapping_state', 'mapping_basis', 'mapped_by', 'mapped_at');   -- 받은 숫자(components)는 고치지 못한다
create trigger payroll_insurance_allocations_guard before update or delete on public.payroll_insurance_allocations
  for each row execute function public.guard_columns('active', 'updated_by');
create trigger payroll_payees_guard before update or delete on public.payroll_payees
  for each row execute function public.guard_columns('name', 'profile_id', 'phone', 'note', 'active', 'updated_by');
create trigger payroll_payee_engagements_guard before update or delete on public.payroll_payee_engagements
  for each row execute function public.guard_columns('ends_on', 'day_rate', 'tax_state', 'ei_state', 'np_state', 'hi_state', 'basis_note', 'active', 'updated_by');
create trigger payroll_daily_work_guard before update or delete on public.payroll_daily_work
  for each row execute function public.guard_columns('quantity', 'day_rate', 'items', 'basis_note', 'status', 'version', 'updated_by');
create trigger payroll_daily_statements_guard before update or delete on public.payroll_daily_statements
  for each row execute function public.guard_columns();
create trigger payroll_retirement_cases_guard before update or delete on public.payroll_retirement_cases
  for each row execute function public.guard_columns('input_snapshot', 'policy_refs', 'missing', 'amount', 'tax_amount', 'tax_basis', 'calc_mode', 'state', 'reason', 'result_hash', 'finalized_by', 'finalized_at');
create trigger payroll_sensitive_records_guard before update or delete on public.payroll_sensitive_records
  for each row execute function public.guard_columns('active', 'updated_by');   -- 암호문은 고치지 못한다(바꾸면 새 줄)
create trigger payroll_sensitive_grants_guard before update or delete on public.payroll_sensitive_grants
  for each row execute function public.guard_columns('revoked_at', 'revoked_by');
create trigger payroll_sensitive_access_logs_guard before update or delete on public.payroll_sensitive_access_logs
  for each row execute function public.guard_columns();

-- 확정한 일용 근무 줄 · 확정한 퇴직급여 건은 내용이 바뀌지 않는다
create or replace function public.payroll_extras_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'payroll_daily_work' then
    -- 확정한 줄은 「무효」로만 바꿀 수 있다(금액 · 공수를 고치려면 무효로 하고 새로 넣는다). 무효는 되살리지 못한다
    if old.status = 'VOID' then
      raise exception 'payroll_daily_work: a void row cannot change' using errcode = 'PX001';
    end if;
    if old.status = 'CONFIRMED' and (new.status not in ('CONFIRMED', 'VOID') or new.quantity is distinct from old.quantity or new.day_rate is distinct from old.day_rate or new.items is distinct from old.items) then
      raise exception 'payroll_daily_work: a confirmed row cannot change — void it and add a new one' using errcode = 'PX001';
    end if;
    if new.version <> old.version + 1 then
      raise exception 'payroll_daily_work: version must increase by one (someone else saved first)' using errcode = 'PX003';
    end if;
  elsif tg_table_name = 'payroll_retirement_cases' then
    if old.state in ('FINALIZED', 'WITHDRAWN') and not (old.state = 'FINALIZED' and new.state = 'WITHDRAWN' and new.reason is not null
         and new.amount is not distinct from old.amount and new.tax_amount is not distinct from old.tax_amount and new.input_snapshot = old.input_snapshot and new.result_hash is not distinct from old.result_hash) then
      raise exception 'payroll_retirement_cases: a finalized case cannot change — withdraw it with a reason and create a new revision' using errcode = 'PX002';
    end if;
  end if;
  return new;
end;
$$;
create trigger payroll_daily_work_lock before update on public.payroll_daily_work
  for each row execute function public.payroll_extras_lock();
create trigger payroll_retirement_cases_lock before update on public.payroll_retirement_cases
  for each row execute function public.payroll_extras_lock();
revoke all on function public.payroll_extras_lock() from public, anon, authenticated;

-- 누가 언제 바꿨는지 — 금액이 없는 표만 공용 변경 기록에 남긴다 (금액이 있는 표는 서버가 payroll_audit_events에 남긴다)
create trigger payroll_insurance_enrollments_audit after insert or update or delete on public.payroll_insurance_enrollments
  for each row execute function public.audit_row();
create trigger payroll_sensitive_grants_audit after insert or update or delete on public.payroll_sensitive_grants
  for each row execute function public.audit_row();
