-- 20261013000035_leave_ledger.sql
-- 휴가 원장과 연차 정책 (PRD v1.3 36 · 37.1 · 38장, 통합 개발 계획 M4 · M5).
-- ★ 운영 적용은 의뢰인이 변경 목록을 보고 승인한 뒤에만 한다 (`DB 변경 목록 — 묶음 3 (휴가 원장).md`).
-- ★ 새 표 8개를 만든다. 기존 표(leave_types · leave_grants · leave_requests)의 칸과 자료는 바꾸지 않는다.
--    지금의 「받은 연차 입력」(leave_grants)과 잔여 계산은 그대로 동작한다 — 새 원장은 꺼 둔 채로 넣고, 맞는지 대조한 뒤 켠다.
-- ★ 새 표는 브라우저에서 직접 읽지 못한다(정책 없음 = 전부 거부). 서버가 권한을 확인하고 읽고 쓴다.
-- ★ 수량은 정수 「분」으로 둔다. 하루를 몇 분으로 치는지(day_minutes)는 지급 건마다 적는다 — 무조건 8시간으로 나누지 않는다.
--
-- 되돌리는 방법 (값을 넣기 전에만): 아래 표를 만든 반대 순서로 지운다.

-- 1. 휴가 정책 그룹 — 직원을 묶어 연차 생성 기준을 다르게 줄 수 있다 (휴가 종류의 묶음(group_name)과 다른 개념이다)
create table public.leave_policy_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 300),
  excluded    boolean not null default false,          -- 생성 제외 그룹: 이 그룹에 든 동안에는 연차를 자동으로 만들지 않는다
  is_default  boolean not null default false,          -- 어느 그룹에도 들지 않은 직원에게 쓰는 그룹 (하나만)
  sort        int not null default 0,
  active      boolean not null default true,
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create unique index leave_policy_groups_name on public.leave_policy_groups (lower(name)) where active;
create unique index leave_policy_groups_one_default on public.leave_policy_groups ((true)) where is_default and active;

-- 2. 그룹의 정책 판 — 생성 기준(입사일/회계연도) · 근속 구간표 · 소멸 · 선사용 · 반올림. 고치면 새 판이 쌓인다
create table public.leave_policy_versions (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.leave_policy_groups(id),
  payload            jsonb not null,
  valid_from         date not null,
  valid_to           date check (valid_to is null or valid_to > valid_from),      -- 이 날 전날까지 [시작, 끝)
  version            int not null check (version >= 1),
  status             text not null default 'active' check (status in ('active', 'superseded', 'withdrawn')),
  verification_state text not null default 'TEMPORARY' check (verification_state in ('TEMPORARY', 'REVIEW_REQUIRED', 'VERIFIED')),
  verification_note  text check (verification_note is null or char_length(verification_note) <= 500),
  reason             text check (reason is null or char_length(reason) <= 500),
  supersedes_id      uuid references public.leave_policy_versions(id),
  created_by         uuid not null references public.profiles(id),
  created_at         timestamptz not null default now(),
  unique (group_id, version),
  exclude using gist (group_id with =, daterange(valid_from, valid_to, '[)') with &&) where (status = 'active')
);

-- 3. 직원의 정책 그룹 소속 이력 — 한 직원은 한 번에 한 그룹에만 든다(겹치면 DB가 막는다 → 우선순위 다툼이 없다)
create table public.leave_policy_members (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  group_id    uuid not null references public.leave_policy_groups(id),
  valid_from  date not null,
  valid_to    date check (valid_to is null or valid_to > valid_from),
  reason      text check (reason is null or char_length(reason) <= 300),
  active      boolean not null default true,
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  exclude using gist (employee_id with =, daterange(valid_from, valid_to, '[)') with &&) where (active)
);

-- 4. 휴가 종류의 설정 판 — 신청 한도 · 기한 · 증빙 · 허용 요일 · 대상 · 지급 방식 · 유효기간 · 사용/유급/차감/소정근로일 인정 · 영어 이름
create table public.leave_type_policy_versions (
  id                 uuid primary key default gen_random_uuid(),
  type_code          text not null references public.leave_types(code),
  payload            jsonb not null,
  valid_from         date not null,
  valid_to           date check (valid_to is null or valid_to > valid_from),
  version            int not null check (version >= 1),
  status             text not null default 'active' check (status in ('active', 'superseded', 'withdrawn')),
  verification_state text not null default 'TEMPORARY' check (verification_state in ('TEMPORARY', 'REVIEW_REQUIRED', 'VERIFIED')),
  verification_note  text check (verification_note is null or char_length(verification_note) <= 500),
  reason             text check (reason is null or char_length(reason) <= 500),
  supersedes_id      uuid references public.leave_type_policy_versions(id),
  created_by         uuid not null references public.profiles(id),
  created_at         timestamptz not null default now(),
  unique (type_code, version),
  exclude using gist (type_code with =, daterange(valid_from, valid_to, '[)') with &&) where (status = 'active')
);

-- 5. 생성 · 소멸 · 상계 · 이전 작업의 실행 기록
create table public.leave_runs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('accrual', 'expiry', 'advance_offset', 'retire_settle', 'migration')),
  as_of      date not null,
  status     text not null default 'running' check (status in ('running', 'done', 'partial', 'failed')),
  summary    jsonb not null default '{}'::jsonb,
  actor_id   uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

-- 6. 휴가 지급 건 — 발생한 휴가 한 묶음. 여러 지급 건이 동시에 살아 있을 수 있다(새 부여가 생겼다고 앞 건이 사라지지 않는다)
--    후보(CANDIDATE)로 만들어지고 관리자가 승인(APPROVED)한 건만 잔여에 들어간다
create table public.leave_grant_lots (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.profiles(id),
  type_code         text not null references public.leave_types(code),
  lot_kind          text not null check (lot_kind in ('annual', 'monthly', 'carry', 'compensatory', 'manual', 'migrated', 'periodic', 'on_request')),
  accrual_from      date,                                       -- 무엇에 대한 발생인가 (산정 기간)
  accrual_to        date check (accrual_to is null or accrual_from is null or accrual_to >= accrual_from),
  granted_on        date not null,                              -- 발생일
  usable_from       date not null,                              -- 이 날부터 쓸 수 있다
  usable_to         date check (usable_to is null or usable_to > usable_from),   -- 이 날 전날까지. 비어 있으면 소멸 없음
  quantity_minutes  int not null check (quantity_minutes > 0),
  day_minutes       int not null check (day_minutes between 60 and 1440),        -- 이 건에서 하루를 몇 분으로 치는가
  carriable         boolean not null default false,
  policy_version_id uuid references public.leave_policy_versions(id),
  basis             jsonb not null default '{}'::jsonb,         -- 산정 근거 (입사일 · 근속 · 기준 · 계산 과정)
  source_ref        text,                                       -- 옛 「받은 연차 입력」(leave_grants.id) · 초과근로 등 원본
  dedupe_key        text not null,                              -- 같은 발생을 두 번 만들지 않게 (직원 · 종류 · 산정 기간 · 종류)
  state             text not null default 'CANDIDATE' check (state in ('CANDIDATE', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  run_id            uuid references public.leave_runs(id),
  note              text check (note is null or char_length(note) <= 300),
  decided_by        uuid references public.profiles(id),
  decided_at        timestamptz,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  check (state not in ('APPROVED', 'REJECTED') or (decided_by is not null and decided_at is not null))
);
create unique index leave_grant_lots_dedupe on public.leave_grant_lots (dedupe_key) where state in ('CANDIDATE', 'APPROVED');
create index on public.leave_grant_lots (employee_id, type_code, state, usable_from);

-- 7. 휴가 원장 — 지급 · 사용 · 예약 · 해제 · 취소 · 소멸 · 이월 · 선사용 · 상계 · 정산 · 조정. 넣기만 하고 고치지 않는다(되돌릴 때는 반대 줄을 넣는다)
--    minutes: 잔여를 늘리면 +, 줄이면 −
create table public.leave_ledger (
  id                bigserial primary key,
  employee_id       uuid not null references public.profiles(id),
  type_code         text not null references public.leave_types(code),
  lot_id            uuid references public.leave_grant_lots(id),          -- 어느 지급 건에서 (선사용은 비어 있을 수 있다)
  event             text not null check (event in ('grant', 'use', 'reserve', 'release', 'cancel', 'expire', 'carry_out', 'carry_in', 'advance', 'offset', 'settle', 'adjust')),
  minutes           int not null check (minutes <> 0),
  effective_on      date not null,
  is_test           boolean not null default false,                      -- 연습 신청에서 나온 줄
  request_id        uuid references public.leave_requests(id),
  reverses_id       bigint references public.leave_ledger(id),            -- 되돌리는 줄이면 원래 줄
  policy_version_id uuid references public.leave_policy_versions(id),
  run_id            uuid references public.leave_runs(id),
  dedupe_key        text,                                                 -- 재시도해도 한 번만 (예: use:신청 번호:지급 건)
  reason            text check (reason is null or char_length(reason) <= 300),
  actor_id          uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
create unique index leave_ledger_dedupe on public.leave_ledger (dedupe_key) where dedupe_key is not null;
create index on public.leave_ledger (employee_id, type_code, effective_on);
create index on public.leave_ledger (lot_id);
create index on public.leave_ledger (request_id);

-- 8. 퇴사자 연차 정산 — 퇴사일 기준 발생 · 사용 · 소멸 · 선사용 · 미사용. 후보 → 승인. 고치면 새 판
create table public.leave_settlements (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.profiles(id),
  retire_on      date not null,
  revision       int not null default 1 check (revision >= 1),
  snapshot       jsonb not null,                                          -- 산정 내역 (지급 건별 잔여 · 선사용 미상계 · 예약 · 촉진 미완료 등)
  unused_minutes int not null,
  advance_minutes int not null default 0 check (advance_minutes >= 0),    -- 미상계 선사용 (자동으로 임금에서 빼지 않는다)
  state          text not null default 'CANDIDATE' check (state in ('CANDIDATE', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  note           text check (note is null or char_length(note) <= 500),
  decided_by     uuid references public.profiles(id),
  decided_at     timestamptz,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  unique (employee_id, retire_on, revision)
);
create unique index leave_settlements_one_approved on public.leave_settlements (employee_id, retire_on) where state = 'APPROVED';

alter table public.leave_policy_groups        enable row level security;
alter table public.leave_policy_versions      enable row level security;
alter table public.leave_policy_members       enable row level security;
alter table public.leave_type_policy_versions enable row level security;
alter table public.leave_runs                 enable row level security;
alter table public.leave_grant_lots           enable row level security;
alter table public.leave_ledger               enable row level security;
alter table public.leave_settlements          enable row level security;
revoke all on public.leave_policy_groups, public.leave_policy_versions, public.leave_policy_members, public.leave_type_policy_versions,
  public.leave_runs, public.leave_grant_lots, public.leave_ledger, public.leave_settlements from anon, authenticated;
revoke all on sequence public.leave_ledger_id_seq from anon, authenticated;

-- 지우지 않는다 (4-1). 판 · 지급 건의 내용은 고정이고 상태 · 끝나는 날 · 검증 표시만 바뀐다. 원장은 아무것도 바뀌지 않는다
create trigger leave_policy_groups_guard before delete on public.leave_policy_groups
  for each row execute function public.guard_columns();
create trigger leave_policy_versions_guard before update or delete on public.leave_policy_versions
  for each row execute function public.guard_columns('status', 'valid_to', 'verification_state', 'verification_note');
create trigger leave_policy_members_guard before update or delete on public.leave_policy_members
  for each row execute function public.guard_columns('valid_to', 'active', 'updated_by');
create trigger leave_type_policy_versions_guard before update or delete on public.leave_type_policy_versions
  for each row execute function public.guard_columns('status', 'valid_to', 'verification_state', 'verification_note');
create trigger leave_grant_lots_guard before update or delete on public.leave_grant_lots
  for each row execute function public.guard_columns('state', 'decided_by', 'decided_at', 'note');
create trigger leave_ledger_guard before update or delete on public.leave_ledger
  for each row execute function public.guard_columns();
create trigger leave_settlements_guard before update or delete on public.leave_settlements
  for each row execute function public.guard_columns('state', 'decided_by', 'decided_at', 'note');

-- 승인하거나 반려한 지급 건은 후보로 되돌릴 수 없다 (거둘 수만 있다)
create or replace function public.leave_lot_one_way()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state in ('REJECTED', 'WITHDRAWN') and new.state <> old.state then
    raise exception 'leave_grant_lots: a rejected or withdrawn lot cannot change state' using errcode = '42501';
  end if;
  if old.state = 'APPROVED' and new.state not in ('APPROVED', 'WITHDRAWN') then
    raise exception 'leave_grant_lots: an approved lot can only be withdrawn' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger leave_grant_lots_one_way before update on public.leave_grant_lots
  for each row execute function public.leave_lot_one_way();

-- 마감된 기간의 원장은 넣지 못한다 (0034의 마감 잠금을 그대로 쓴다 — 사용 · 소멸 · 선사용도 과거 결과를 바꾸는 길이다)
create trigger leave_ledger_close_lock before insert on public.leave_ledger
  for each row execute function public.attendance_lock_guard('effective_on', 'effective_on');

create trigger leave_policy_groups_audit after insert or update or delete on public.leave_policy_groups
  for each row execute function public.audit_row();
create trigger leave_policy_versions_audit after insert or update or delete on public.leave_policy_versions
  for each row execute function public.audit_row();
create trigger leave_policy_members_audit after insert or update or delete on public.leave_policy_members
  for each row execute function public.audit_row();
create trigger leave_type_policy_versions_audit after insert or update or delete on public.leave_type_policy_versions
  for each row execute function public.audit_row();
create trigger leave_grant_lots_audit after insert or update or delete on public.leave_grant_lots
  for each row execute function public.audit_row();
create trigger leave_settlements_audit after insert or update or delete on public.leave_settlements
  for each row execute function public.audit_row();
