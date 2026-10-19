-- 20261019000061_anomaly_assignments.sql — 묶음 27 (2026-10-19 의뢰인: 이상 기록 담당자 · 처리 기한 · 기한 지남 알림)
-- 기본 담당자 · 기한(발생일 + N일)은 회사 정책 판(payroll_policy_versions, 종류 attendance.anomaly_task)에 있고 DB 변경 없이 동작한다.
-- 이 표는 「이 건만 담당자 · 기한을 바꾼다」는 기록이다. 바꿀 때마다 한 줄 — 그 직원 · 그 날의 마지막 줄이 지금 값이다. 고치거나 지우지 못한다.
--   assignee_id · due_on이 비어 있으면 그 칸은 기본값을 쓴다.
-- 되돌리기: drop table public.attendance_anomaly_assignments; drop function public.guard_anomaly_assignment();

create table public.attendance_anomaly_assignments (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id),
  work_date date not null,
  is_test boolean not null,
  assignee_id uuid references public.profiles(id),
  due_on date check (due_on is null or due_on >= work_date),
  note text check (note is null or char_length(note) <= 300),
  set_by uuid not null references public.profiles(id),
  set_at timestamptz not null default now()
);
create index on public.attendance_anomaly_assignments (work_date, is_test);
create index on public.attendance_anomaly_assignments (employee_id, work_date, id);

alter table public.attendance_anomaly_assignments enable row level security;
revoke all on public.attendance_anomaly_assignments from anon, authenticated;

create or replace function public.guard_anomaly_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'attendance_anomaly_assignments: append only';
end $$;
create trigger attendance_anomaly_assignments_guard before update or delete on public.attendance_anomaly_assignments
  for each row execute function public.guard_anomaly_assignment();
