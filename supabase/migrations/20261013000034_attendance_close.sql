-- 20261013000034_attendance_close.sql
-- 근태 월 마감(잠금)과 재직 · 소속 이력 (PRD v1.3 8 · 35.2 · 38.1장, 통합 개발 계획 M1).
-- ★ 운영 적용은 의뢰인이 변경 목록을 보고 승인한 뒤에만 한다 (`DB 변경 목록 — 묶음 2 (마감 · 이력).md`).
-- ★ 새 표 4개를 만들고, **기존 근태 표 10개에 「마감된 기간이면 막는」 검사(트리거)를 붙인다.** 기존 표의 칸과 자료는 바꾸지 않는다.
--    마감한 기간이 하나도 없는 동안에는 이 검사가 아무것도 막지 않는다 — 지금까지의 동작과 같다.
-- ★ 새 표는 브라우저에서 직접 읽지 못한다(정책 없음 = 전부 거부). 서버가 권한을 확인하고 읽고 쓴다.
--
-- 되돌리는 방법 (마감을 한 번도 하지 않았을 때만):
--   drop trigger … _close_lock on 각 표(아래 10개); drop function public.attendance_lock_guard();
--   그 뒤 새 표 4개를 만든 반대 순서로 지운다.

-- 1. 재직 기간 — 입사 · 퇴사. 현재 켜짐/꺼짐(active)만으로는 지난달에 재직했는지 알 수 없다
create table public.staff_employment_periods (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  starts_on   date not null,
  ends_on     date check (ends_on is null or ends_on >= starts_on),        -- 마지막 근무일(이 날까지 재직). 재직 중이면 비워 둔다
  end_reason  text check (end_reason is null or char_length(end_reason) <= 200),
  note        text check (note is null or char_length(note) <= 300),
  active      boolean not null default true,                               -- 잘못 넣은 줄은 끈다 (지우지 않는다)
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  exclude using gist (employee_id with =, daterange(starts_on, ends_on, '[]') with &&) where (active)
);
create index on public.staff_employment_periods (employee_id, starts_on desc);

-- 2. 소속 · 직무 이력 — 그 날짜의 소속으로 집계하려면 필요하다 (지금은 현재 소속만 있다)
create table public.staff_assignment_history (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  group_id    uuid references public.org_groups(id),
  job_id      uuid references public.jobs(id),
  job_title   text check (job_title is null or char_length(job_title) <= 40),
  valid_from  date not null,
  valid_to    date check (valid_to is null or valid_to > valid_from),      -- 이 날 전날까지 [시작, 끝)
  active      boolean not null default true,
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  exclude using gist (employee_id with =, daterange(valid_from, valid_to, '[)') with &&) where (active)
);
create index on public.staff_assignment_history (employee_id, valid_from desc);

-- 3. 근태 마감 — 직원 × 기간 × 연습/운영. 다시 열면(REOPENED) 그 줄은 남고, 다시 마감하면 판 번호가 올라간 새 줄이 생긴다
create table public.attendance_closes (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id),
  period_from   date not null,
  period_to     date not null check (period_to > period_from),             -- 이 날 전날까지 [시작, 끝)
  is_test       boolean not null,
  revision      int not null default 1 check (revision >= 1),
  state         text not null default 'CLOSED' check (state in ('CLOSED', 'REOPENED')),
  input_hash    text not null,                                             -- 마감할 때 본 근태 자료의 해시
  closed_by     uuid not null references public.profiles(id),
  closed_at     timestamptz not null default now(),
  reopened_by   uuid references public.profiles(id),
  reopened_at   timestamptz,
  reopen_reason text check (reopen_reason is null or char_length(reopen_reason) between 2 and 500),
  check (state <> 'REOPENED' or (reopened_by is not null and reopened_at is not null and reopen_reason is not null)),
  unique (employee_id, period_from, period_to, is_test, revision),
  exclude using gist (employee_id with =, (is_test::int) with =, daterange(period_from, period_to, '[)') with &&) where (state = 'CLOSED')
);
create index on public.attendance_closes (period_from, is_test, state);

-- 4. 마감 스냅샷 — 마감 시점의 근태 사실과 계산 입력. 고치지 않는다
create table public.attendance_close_snapshots (
  close_id                uuid primary key references public.attendance_closes(id),
  snapshot_schema_version int not null default 1,
  dependency_from         date not null,                                   -- 주 단위 계산이 기댄 날짜 범위 (월 경계의 앞 · 뒤 며칠 포함)
  dependency_to           date not null check (dependency_to >= dependency_from),
  payload                 jsonb not null,
  input_hash              text not null,
  created_at              timestamptz not null default now()
);

alter table public.staff_employment_periods   enable row level security;
alter table public.staff_assignment_history   enable row level security;
alter table public.attendance_closes          enable row level security;
alter table public.attendance_close_snapshots enable row level security;
revoke all on public.staff_employment_periods, public.staff_assignment_history, public.attendance_closes, public.attendance_close_snapshots from anon, authenticated;

-- 지우지 않는다 (4-1). 이력 줄은 끝나는 날 · 사유 · 켜짐만, 마감 줄은 다시 여는 칸만 바뀐다
create trigger staff_employment_periods_guard before update or delete on public.staff_employment_periods
  for each row execute function public.guard_columns('ends_on', 'end_reason', 'note', 'active', 'updated_by');
create trigger staff_assignment_history_guard before update or delete on public.staff_assignment_history
  for each row execute function public.guard_columns('valid_to', 'active', 'updated_by');
create trigger attendance_closes_guard before update or delete on public.attendance_closes
  for each row execute function public.guard_columns('state', 'reopened_by', 'reopened_at', 'reopen_reason');
create trigger attendance_close_snapshots_guard before update or delete on public.attendance_close_snapshots
  for each row execute function public.guard_columns();
create trigger staff_employment_periods_audit after insert or update or delete on public.staff_employment_periods
  for each row execute function public.audit_row();
create trigger staff_assignment_history_audit after insert or update or delete on public.staff_assignment_history
  for each row execute function public.audit_row();
create trigger attendance_closes_audit after insert or update or delete on public.attendance_closes
  for each row execute function public.audit_row();

-- 다시 연 마감 줄은 다시 닫히지 않는다 (다시 마감하려면 새 판을 넣는다)
create or replace function public.attendance_close_one_way()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'REOPENED' and new.state <> 'REOPENED' then
    raise exception 'attendance_closes: a reopened close cannot be closed again (insert a new revision)' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger attendance_closes_one_way before update on public.attendance_closes
  for each row execute function public.attendance_close_one_way();

-- 5. 마감 잠금 — 마감된(CLOSED) 기간에 걸친 근태 자료는 넣지도 고치지도 못한다.
--    화면의 버튼을 숨기는 것으로 끝내지 않고 DB가 막는다 (PRD 8장: 모든 쓰기 경로 · 마감과 수정이 겹치면 한쪽만 성공).
--    인자: 시작 날짜 칸, 끝 날짜 칸. 표에 is_test 칸이 없으면(근무일정) 운영 마감만 본다.
--    오류 코드 AC001 → 앱이 「마감된 기간입니다」(409)로 바꿔 보인다.
create or replace function public.attendance_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  j      jsonb;
  d_from date;
  d_to   date;
begin
  foreach j in array (case when tg_op = 'INSERT' then array[to_jsonb(new)] else array[to_jsonb(old), to_jsonb(new)] end)
  loop
    d_from := (j ->> tg_argv[0])::date;
    d_to   := (j ->> tg_argv[1])::date;
    if d_from is null or d_to is null then
      continue;
    end if;
    if exists (
      select 1 from public.attendance_closes c
      where c.employee_id = (j ->> 'employee_id')::uuid
        and c.state = 'CLOSED'
        and c.is_test = coalesce((j ->> 'is_test')::boolean, false)
        and c.period_from <= d_to
        and c.period_to > d_from
    ) then
      raise exception 'attendance period is closed: % (% ~ %)', tg_table_name, d_from, d_to using errcode = 'AC001';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.attendance_lock_guard() from public, anon, authenticated;

create trigger punch_events_close_lock      before insert or update on public.punch_events      for each row execute function public.attendance_lock_guard('work_date', 'work_date');
create trigger punch_corrections_close_lock before insert or update on public.punch_corrections for each row execute function public.attendance_lock_guard('work_date', 'work_date');
create trigger punch_requests_close_lock    before insert or update on public.punch_requests    for each row execute function public.attendance_lock_guard('work_date', 'work_date');
create trigger day_confirms_close_lock      before insert or update on public.day_confirms      for each row execute function public.attendance_lock_guard('work_date', 'work_date');
create trigger overtime_requests_close_lock before insert or update on public.overtime_requests for each row execute function public.attendance_lock_guard('work_date', 'work_date');
create trigger work_notes_close_lock        before insert or update on public.work_notes        for each row execute function public.attendance_lock_guard('work_date', 'work_date');
create trigger shift_requests_close_lock    before insert or update on public.shift_requests    for each row execute function public.attendance_lock_guard('work_date', 'work_date');
create trigger shifts_close_lock            before insert or update on public.shifts            for each row execute function public.attendance_lock_guard('work_date', 'work_date');
create trigger leave_requests_close_lock    before insert or update on public.leave_requests    for each row execute function public.attendance_lock_guard('start_date', 'end_date');
create trigger work_requests_close_lock     before insert or update on public.work_requests     for each row execute function public.attendance_lock_guard('start_date', 'end_date');
