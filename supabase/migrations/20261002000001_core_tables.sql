-- 20261002000001_core_tables.sql
-- 근태 ① 핵심 표 — 마스터 6장 스키마 + 1.2판 추가(locale·user_passkeys) + 부록 R-2의 7(can_view_payroll)
--
-- 되돌리는 방법: 아래 표를 역순으로 drop.
--   ⚠️ 되돌리면 표 안의 데이터가 전부 사라진다. 운영 데이터가 생긴 뒤에는 되돌리지 말고 백업으로 복구한다 (R-12-6).
--   drop table overtime_requests, punch_corrections, punch_events, user_passkeys,
--              holidays, office_networks, work_rules, profiles;
--
-- 여기에는 금액 컬럼(원·amount·wage·rate)이 하나도 없다 — ①은 분 단위까지만 다룬다 (4-4).

-- ─────────────────────────────────────────────
-- 직원
-- ─────────────────────────────────────────────
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete restrict,
  name             text not null,
  employee_no      text unique,
  role             text not null default 'employee' check (role in ('admin','employee')),
  active           boolean not null default true,
  joined_on        date,
  -- 4-10: 직원 화면 언어. 직원 기본 en, 관리자는 초대할 때 ko로 지정
  locale           text not null default 'en' check (locale in ('ko','en','vi','th')),
  -- 부록 R-2의 7: 급여 화면은 급여 담당자만. 기본 false → 지정 전에는 아무도 급여를 못 본다
  can_view_payroll boolean not null default false,
  created_at       timestamptz not null default now()
);
-- on delete restrict: 퇴사해도 계정을 지우지 않는다. active=false로만 바꾼다.
-- 지우면 근태 기록이 고아가 되고 3년 보존 의무를 못 지킨다 (4-1).

-- ─────────────────────────────────────────────
-- 근무규칙 — MVP는 활성 규칙 1개만
-- ─────────────────────────────────────────────
create table public.work_rules (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  start_time      time not null,
  end_time        time not null,
  late_grace_min  int  not null default 0 check (late_grace_min >= 0),
  -- 1.3판: 휴게는 이 시간대와 실제 근무가 겹친 분만 공제한다 (7-6 요점 1)
  break_start     time,
  break_end       time,
  workdays        int[] not null default '{1,2,3,4,5}' check (workdays <@ '{1,2,3,4,5,6,7}'::int[]), -- ISO 1=월 … 7=일
  weekly_rest_day int  not null default 7 check (weekly_rest_day between 1 and 7),          -- 주휴일
  effective_from  date not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  check ((break_start is null) = (break_end is null)),
  check (break_start is null or break_start < break_end)
);
-- 활성 규칙이 2개가 되면 DB가 거부한다 (3장 "교대근무·유연근무는 MVP 범위 밖")
create unique index work_rules_one_active on public.work_rules ((true)) where active;

-- ─────────────────────────────────────────────
-- 폰 등록(패스키) — punch_events가 참조하므로 먼저 만든다 (4-11)
-- ─────────────────────────────────────────────
create table public.user_passkeys (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.profiles(id),
  credential_id  text unique not null,
  public_key     bytea not null,          -- 공개키만. 생체정보는 서버가 받지 않는다
  sign_count     bigint not null default 0,
  transports     text[],
  device_type    text,                    -- singleDevice / multiDevice
  backed_up      boolean not null default false,  -- 동기화된 패스키인가 (4-11 알려진 한계)
  device_label   text,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  revoked_at     timestamptz,             -- 지우지 않고 해제 시각만 남긴다
  revoked_by     uuid references public.profiles(id)
);
-- 직원당 활성 패스키 1개
create unique index one_active_passkey on public.user_passkeys (employee_id) where revoked_at is null;

-- ─────────────────────────────────────────────
-- ★ 출퇴근 원본 기록 — 덧붙이기만 한다 (4-1). 수정·삭제는 다음 파일의 트리거가 막는다
-- ─────────────────────────────────────────────
create table public.punch_events (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  kind         text not null check (kind in ('in','out')),
  punched_at   timestamptz not null default now(),
  -- ⚠️ work_date 규칙 (6장): 출근 = punched_at의 서울 날짜 / 퇴근 = 짝 없는 직전 출근의 work_date 상속.
  --    퇴근 시각의 날짜를 그대로 쓰면 자정 넘긴 야근이 갈라진다. 계산은 서버(src/lib/time.ts)가 한다.
  work_date    date not null,
  source       text not null default 'web' check (source in ('web','qr','admin')),
  client_ip    inet,
  ip_verified  boolean not null default false,   -- 검증 실패해도 기록은 남긴다 (4-3)
  geo_lat      numeric(9,6),                     -- GPS는 기본 꺼짐 (4-2)
  geo_lng      numeric(9,6),
  is_test      boolean not null default true,    -- ★ 연습 모드 기본 켜짐 (4-6)
  note         text,
  passkey_id   uuid references public.user_passkeys(id),  -- source='admin'(대리 등록)이면 null이 정상
  created_at   timestamptz not null default now()
);
create index on public.punch_events (work_date, employee_id);
create index on public.punch_events (employee_id, punched_at desc);

-- ─────────────────────────────────────────────
-- ★ 정정 — 원본을 고치지 않고 덮어쓸 값을 따로 쌓는다 (4-1, 4-8)
-- ─────────────────────────────────────────────
create table public.punch_corrections (
  id              uuid primary key default gen_random_uuid(),
  correction_type text not null default 'modify'
                  check (correction_type in ('modify','void','add_missing')),
  target_id       uuid references public.punch_events(id),   -- add_missing이면 null
  employee_id     uuid not null references public.profiles(id),
  work_date       date not null,
  kind            text check (kind in ('in','out')),          -- add_missing이면 필수
  new_punched_at  timestamptz,                                -- modify·add_missing이면 필수, void면 null
  reason          text not null,
  requested_by    uuid not null references public.profiles(id),
  approved_by     uuid references public.profiles(id),
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  check (
    (correction_type = 'modify'      and target_id is not null and new_punched_at is not null) or
    (correction_type = 'void'        and target_id is not null and new_punched_at is null) or
    (correction_type = 'add_missing' and target_id is null and kind is not null and new_punched_at is not null)
  )
);
-- 부록 R-4: 같은 (직원, 근무일, kind)에 승인된 add_missing은 1건만 — 동시 승인도 DB가 막는다
create unique index punch_corrections_one_approved_add_missing
  on public.punch_corrections (employee_id, work_date, kind)
  where correction_type = 'add_missing' and status = 'approved';
create index on public.punch_corrections (employee_id, work_date);

-- ─────────────────────────────────────────────
-- 사무실 네트워크 (4-2). 단일 IP도 /32, IPv6는 /64 대역으로 (R-6의 3)
-- ─────────────────────────────────────────────
create table public.office_networks (
  id         uuid primary key default gen_random_uuid(),
  cidr       cidr not null,
  label      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 휴일. public·weekly_rest → 휴일 축 / company → 휴무일(소정·연장) — 7-6 요점 7의 판정표
-- ─────────────────────────────────────────────
create table public.holidays (
  the_date date primary key,
  label    text not null,
  kind     text not null default 'public' check (kind in ('public','company','weekly_rest'))
);

-- ─────────────────────────────────────────────
-- ★ 연장근로 승인 — 집계는 자동(사실), 승인은 사람(판단). 둘을 합치지 않는다 (6장 주석, 14장 5번)
-- ─────────────────────────────────────────────
create table public.overtime_requests (
  id                       uuid primary key default gen_random_uuid(),
  employee_id              uuid not null references public.profiles(id),
  work_date                date not null,
  overtime_minutes         int not null check (overtime_minutes >= 0),
  night_minutes            int not null default 0 check (night_minutes >= 0),
  holiday_minutes          int not null default 0 check (holiday_minutes >= 0),
  reason                   text,
  status                   text not null default 'pending'
                           check (status in ('pending','approved','rejected')),
  approved_by              uuid references public.profiles(id),
  approved_minutes         int,     -- null이면 전액 인정
  approved_night_minutes   int,
  approved_holiday_minutes int,
  created_at               timestamptz not null default now(),
  decided_at               timestamptz,
  unique (employee_id, work_date),
  -- 인정분은 사실(집계분)보다 클 수 없다 (1.3판)
  check (approved_minutes         is null or approved_minutes         between 0 and overtime_minutes),
  check (approved_night_minutes   is null or approved_night_minutes   between 0 and night_minutes),
  check (approved_holiday_minutes is null or approved_holiday_minutes between 0 and holiday_minutes)
);
