-- 20261013000033_payroll_settings.sql
-- 급여 설정 바탕 (PRD v1.3 4 · 17 · 21 · 25장, 통합 개발 계획 M3) — 회사 설정 › 급여 9개 화면과 공식자료(요율 · 세액표) 저장.
-- ★ 운영 적용은 의뢰인이 변경 목록을 보고 승인한 뒤에만 한다 (`DB 변경 목록 — 묶음 1 (급여 설정).md`).
-- ★ 금액 칸은 이름이 payroll_ 로 시작하는 표에만 둔다. 근태 표(punch_* · work_rules · leave_* …)는 건드리지 않는다 (tests/calc.test.ts).
-- ★ 새 표는 전부 브라우저에서 직접 읽지 못한다(정책 없음 = 전부 거부). 서버가 급여 담당자(admin + can_view_payroll)인지 확인하고 읽고 쓴다.
-- ★ 이 파일에 요율 · 세액 · 가산율 숫자를 넣지 않는다. 값은 수집 후보 또는 관리자 입력으로 들어오고, 급여 담당 관리자가 확인한 것만 APPROVED가 된다.
-- ★ 기존 표 pay_contract_types · employee_pay · pay_rule_sets (0030)은 그대로 둔다 — 지우지도 고치지도 않는다.
--
-- 되돌리는 방법 (값을 넣기 전에만): 아래 표를 만든 반대 순서로 drop table.
--   ⚠️ 설정 · 승인 자료가 들어간 뒤에는 되돌리지 말 것.

-- 적용기간이 겹치는 판을 DB가 막으려면 필요하다 (글자 = 와 기간 겹침 && 을 한 제약에 쓰기 위한 확장)
create extension if not exists btree_gist with schema extensions;

-- 1. 회사 급여 설정 — 화면(section)마다 적용기간이 있는 판. 고치면 새 판이 쌓인다
create table public.payroll_company_setting_versions (
  id                 uuid primary key default gen_random_uuid(),
  section            text not null check (section in ('employee-defaults', 'ledger', 'masking', 'working-time')),
  payload            jsonb not null,                                   -- 화면별 값 (서버가 형식을 검사해 넣는다)
  valid_from         date not null,
  valid_to           date check (valid_to is null or valid_to > valid_from),   -- 이 날 전날까지 [시작, 끝)
  version            int not null check (version >= 1),
  status             text not null default 'active' check (status in ('active', 'superseded', 'withdrawn')),
  verification_state text not null default 'TEMPORARY' check (verification_state in ('TEMPORARY', 'VERIFIED')),  -- 임시 입력 / 경영지원실의 노무 · 세무 검증을 받은 값
  verification_note  text check (verification_note is null or char_length(verification_note) <= 500),
  reason             text check (reason is null or char_length(reason) <= 500),
  supersedes_id      uuid references public.payroll_company_setting_versions(id),
  created_by         uuid not null references public.profiles(id),
  created_at         timestamptz not null default now(),
  unique (section, version),
  exclude using gist (section with =, daterange(valid_from, valid_to, '[)') with &&) where (status = 'active')
);

-- 2. 지급 · 공제 항목 — 코드가 식별자. 이름 · 계산 방식을 바꾸면 새 판 (명세서에 쓴 옛 판은 남는다)
create table public.payroll_item_versions (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null check (code ~ '^[A-Za-z0-9_]{2,40}$'),
  kind               text not null check (kind in ('PAYMENT', 'DEDUCTION')),
  ko_name            text not null check (char_length(ko_name) between 1 and 60),
  en_name            text not null check (char_length(en_name) between 1 and 60),
  calc_kind          text not null check (calc_kind in ('FIXED', 'MANUAL', 'TIME', 'RULE', 'NOTICE')),
  calc_handler_id    text check (calc_handler_id is null or char_length(calc_handler_id) <= 60),   -- 지원하는 계산기 이름 (임의 수식 금지)
  default_amount     bigint check (default_amount is null or default_amount >= 0),                 -- 원. 비어 있음(null)과 0은 다르다
  fixed_allowance    boolean not null default false,                                               -- 고정수당 여부
  tax_treatment      text not null default 'NOT_APPLICABLE' check (tax_treatment in ('TAXABLE', 'EXEMPT', 'PARTIAL', 'NOT_APPLICABLE')),
  tax_exempt_limit   bigint check (tax_exempt_limit is null or tax_exempt_limit >= 0),             -- 비과세 한도(원)
  insurance_rules    jsonb not null default '{}'::jsonb,                                           -- 보험별 기준액 포함 여부 (과세 여부에서 추정하지 않는다)
  ordinary_wage      text not null default 'UNKNOWN' check (ordinary_wage in ('INCLUDED', 'EXCLUDED', 'UNKNOWN')),
  negative_rule      text not null default 'NONE' check (negative_rule in ('NONE', 'REFUND', 'SETTLEMENT')),
  in_use             boolean not null default true,                                                -- 사용 여부 (사용중지 = 앞으로 안 씀, 지우지 않음)
  sort               int not null default 0,
  valid_from         date not null,
  valid_to           date check (valid_to is null or valid_to > valid_from),
  version            int not null check (version >= 1),
  status             text not null default 'active' check (status in ('active', 'superseded', 'withdrawn')),
  verification_state text not null default 'TEMPORARY' check (verification_state in ('TEMPORARY', 'VERIFIED')),
  verification_note  text check (verification_note is null or char_length(verification_note) <= 500),
  reason             text check (reason is null or char_length(reason) <= 500),
  supersedes_id      uuid references public.payroll_item_versions(id),
  created_by         uuid not null references public.profiles(id),
  created_at         timestamptz not null default now(),
  unique (code, version),
  exclude using gist (code with =, daterange(valid_from, valid_to, '[)') with &&) where (status = 'active')
);

-- 3. 회사 정책 판 — 법정수당의 회사 기준 등. 공식자료와 따로 둔다
create table public.payroll_policy_versions (
  id                 uuid primary key default gen_random_uuid(),
  policy_kind        text not null check (char_length(policy_kind) between 2 and 60),   -- 예: allowance.overtime, allowance.night, allowance.holiday, leave.annual-accrual
  validated_payload  jsonb not null,
  source_refs        jsonb not null default '[]'::jsonb,
  in_use             boolean not null default true,
  valid_from         date not null,
  valid_to           date check (valid_to is null or valid_to > valid_from),
  version            int not null check (version >= 1),
  status             text not null default 'active' check (status in ('active', 'superseded', 'withdrawn')),
  verification_state text not null default 'TEMPORARY' check (verification_state in ('TEMPORARY', 'REVIEW_REQUIRED', 'VERIFIED')),
  verification_note  text check (verification_note is null or char_length(verification_note) <= 500),
  reason             text check (reason is null or char_length(reason) <= 500),
  supersedes_id      uuid references public.payroll_policy_versions(id),
  created_by         uuid not null references public.profiles(id),
  created_at         timestamptz not null default now(),
  unique (policy_kind, version),
  exclude using gist (policy_kind with =, daterange(valid_from, valid_to, '[)') with &&) where (status = 'active')
);

-- 4. 공식자료 출처 등록부
create table public.payroll_source_registry (
  id             uuid primary key default gen_random_uuid(),
  source_kind    text not null check (char_length(source_kind) between 2 and 40),    -- R01 … R12 (PRD 27.1)
  authority      text not null check (char_length(authority) between 1 and 80),      -- 기관
  allowlist      text[] not null default '{}',                                       -- 허용 도메인
  discovery_url  text check (discovery_url is null or discovery_url ~ '^https://'),
  parser_id      text,
  parser_version text,
  enabled        boolean not null default true,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  unique (source_kind, authority)
);

-- 5. 원문 — 해시로 구분하고 고치지 않는다
create table public.payroll_source_documents (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.payroll_source_registry(id),
  document_id   text,                                   -- 문서번호 · 고시번호
  published_on  date,
  collected_at  timestamptz not null default now(),
  canonical_url text,
  original_hash text not null check (char_length(original_hash) between 16 and 128),
  storage_key   text,
  metadata      jsonb not null default '{}'::jsonb,
  unique (source_id, original_hash)
);

-- 6. 수집 · 업로드 실행 기록
create table public.payroll_refresh_runs (
  id             uuid primary key default gen_random_uuid(),
  trigger        text not null check (trigger in ('scheduled', 'manual', 'upload')),
  actor_id       uuid references public.profiles(id),
  status         text not null default 'running' check (status in ('running', 'done', 'partial', 'failed')),
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  request_id     text,
  source_results jsonb not null default '[]'::jsonb,     -- 기관별 결과
  error_code     text
);

-- 7. 기준 자료 판(요율 · 상하한 · 세액표 묶음) — 후보에서 승인까지. APPROVED는 급여 담당 관리자의 확인으로만 생긴다
create table public.payroll_reference_versions (
  id                    uuid primary key default gen_random_uuid(),
  reference_kind        text not null check (char_length(reference_kind) between 2 and 40),   -- pension.rate, pension.limit, health.rate, ltc.rate, employment.rate, accident.commute, income-tax.table, minimum-wage …
  origin                text not null check (origin in ('collected', 'manual', 'upload')),    -- 수집본과 손으로 넣은 값을 섞지 않는다
  source_document_id    uuid references public.payroll_source_documents(id),
  refresh_run_id        uuid references public.payroll_refresh_runs(id),
  valid_from            date,                                                                 -- 시행일을 모르면 비워 둔다 (그 상태로는 승인하지 못한다)
  valid_to              date check (valid_to is null or valid_from is null or valid_to > valid_from),
  normalized_payload    jsonb not null,                                                       -- 정규화한 값 (비율은 소수, 금액은 원)
  source_unit           text,                                                                 -- 원문 단위 (%, 천분율, 원, 천원)
  payload_hash          text not null,
  state                 text not null default 'PENDING_ADMIN_REVIEW'
                        check (state in ('FETCHED', 'PARSED', 'VALIDATED', 'PENDING_ADMIN_REVIEW', 'APPROVED', 'REVIEW_REQUIRED', 'REJECTED', 'WITHDRAWN')),
  validation_result     jsonb not null default '{}'::jsonb,
  verification_state    text not null default 'TEMPORARY' check (verification_state in ('TEMPORARY', 'VERIFIED')),
  verification_note     text check (verification_note is null or char_length(verification_note) <= 500),
  reviewed_payload_hash text,                                                                 -- 관리자가 본 바로 그 값의 해시
  review_reason         text check (review_reason is null or char_length(review_reason) <= 500),
  approved_by           uuid references public.profiles(id),
  approved_at           timestamptz,
  supersedes_id         uuid references public.payroll_reference_versions(id),
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  check (state <> 'APPROVED' or (approved_by is not null and approved_at is not null and valid_from is not null and reviewed_payload_hash = payload_hash)),
  exclude using gist (reference_kind with =, daterange(valid_from, valid_to, '[)') with &&) where (state = 'APPROVED')
);
create index on public.payroll_reference_versions (reference_kind, state, valid_from desc);

-- 8. 간이세액표의 줄 — 급여구간 × 가족수
create table public.payroll_tax_rows (
  id                   bigserial primary key,
  reference_version_id uuid not null references public.payroll_reference_versions(id),
  wage_from            bigint not null check (wage_from >= 0),          -- 원, 이상
  wage_to              bigint check (wage_to is null or wage_to > wage_from),   -- 원, 미만 (없으면 그 이상 전부)
  family_count         int not null check (family_count between 1 and 20),
  base_tax             bigint not null check (base_tax >= 0),           -- 원
  special_rule_ref     text,
  unique (reference_version_id, wage_from, family_count)
);

-- 9. 같은 작업을 두 번 누르거나 다시 보내도 한 번만 처리되게
create table public.payroll_idempotency_keys (
  id           bigserial primary key,
  actor_id     uuid not null references public.profiles(id),
  operation    text not null check (char_length(operation) between 2 and 60),
  key          text not null check (char_length(key) between 8 and 120),
  request_hash text not null,
  status       text not null default 'processing' check (status in ('processing', 'done', 'failed')),
  response_ref jsonb,
  created_at   timestamptz not null default now(),
  unique (actor_id, operation, key)
);

-- 권한: 전부 서버 전용
alter table public.payroll_company_setting_versions enable row level security;
alter table public.payroll_item_versions            enable row level security;
alter table public.payroll_policy_versions          enable row level security;
alter table public.payroll_source_registry          enable row level security;
alter table public.payroll_source_documents         enable row level security;
alter table public.payroll_refresh_runs             enable row level security;
alter table public.payroll_reference_versions       enable row level security;
alter table public.payroll_tax_rows                 enable row level security;
alter table public.payroll_idempotency_keys         enable row level security;
revoke all on public.payroll_company_setting_versions, public.payroll_item_versions, public.payroll_policy_versions,
  public.payroll_source_registry, public.payroll_source_documents, public.payroll_refresh_runs,
  public.payroll_reference_versions, public.payroll_tax_rows, public.payroll_idempotency_keys from anon, authenticated;
revoke all on sequence public.payroll_tax_rows_id_seq, public.payroll_idempotency_keys_id_seq from anon, authenticated;

-- 지우지 않는다 (4-1). 판의 내용은 고정이고 상태 · 검증 표시 · 끝나는 날만 바뀐다
create trigger payroll_company_setting_versions_guard before update or delete on public.payroll_company_setting_versions
  for each row execute function public.guard_columns('status', 'valid_to', 'verification_state', 'verification_note');
create trigger payroll_item_versions_guard before update or delete on public.payroll_item_versions
  for each row execute function public.guard_columns('status', 'valid_to', 'in_use', 'verification_state', 'verification_note');
create trigger payroll_policy_versions_guard before update or delete on public.payroll_policy_versions
  for each row execute function public.guard_columns('status', 'valid_to', 'in_use', 'verification_state', 'verification_note');
create trigger payroll_source_documents_guard before update or delete on public.payroll_source_documents
  for each row execute function public.guard_columns();
create trigger payroll_reference_versions_guard before update or delete on public.payroll_reference_versions
  for each row execute function public.guard_columns('state', 'valid_from', 'valid_to', 'validation_result', 'verification_state', 'verification_note', 'reviewed_payload_hash', 'review_reason', 'approved_by', 'approved_at');
create trigger payroll_tax_rows_guard before update or delete on public.payroll_tax_rows
  for each row execute function public.guard_columns();

-- 승인된 기준 자료는 값도 기간도 고칠 수 없다 — 거둘(WITHDRAWN) 수만 있다
create or replace function public.payroll_reference_approved_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'APPROVED' then
    if new.state not in ('APPROVED', 'WITHDRAWN')
       or new.valid_from is distinct from old.valid_from
       or new.reviewed_payload_hash is distinct from old.reviewed_payload_hash
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or (new.valid_to is distinct from old.valid_to and old.valid_to is not null) then
      raise exception 'payroll_reference_versions: an approved version is fixed (only valid_to may be closed or the row withdrawn)'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger payroll_reference_versions_approved_lock before update on public.payroll_reference_versions
  for each row execute function public.payroll_reference_approved_lock();

-- 변경 기록 (누가 · 언제 · 무엇을)
create trigger payroll_company_setting_versions_audit after insert or update or delete on public.payroll_company_setting_versions
  for each row execute function public.audit_row();
create trigger payroll_item_versions_audit after insert or update or delete on public.payroll_item_versions
  for each row execute function public.audit_row();
create trigger payroll_policy_versions_audit after insert or update or delete on public.payroll_policy_versions
  for each row execute function public.audit_row();
create trigger payroll_reference_versions_audit after insert or update or delete on public.payroll_reference_versions
  for each row execute function public.audit_row();
