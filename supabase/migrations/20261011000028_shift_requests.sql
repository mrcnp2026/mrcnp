-- 20261011000028_shift_requests.sql
-- 직원이 내는 「근무일정 생성 요청」 (의뢰인 2026-10-11: 시프티의 요청 › 근무일정 요청 — 특근·잔업·하루만 다른 시각을 직원이 요청하고 관리자가 승인).
--   승인하면 그 날짜에 날짜별 일정(shifts)이 한 건 만들어지고(shift_id), 거절하면 만들어지지 않는다.
--   직원은 대기 중인 자기 요청을 취소할 수 있다(status='cancelled'). 줄은 지우지 않는다 (4-1).
--   일정 수정·삭제 요청은 아직 없다 (할일 「다. 근무일정」).
--
-- 되돌리는 방법: drop table public.shift_requests; decision_log.subject_table 검사를 0026의 목록으로 되돌린다.
--   ⚠️ 운영 뒤에는 되돌리지 말 것 (대기 중인 요청이 사라진다). 이미 승인되어 만들어진 일정(shifts)은 남는다.

create table public.shift_requests (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  work_date   date not null,
  start_time  time not null,
  end_time    time not null,
  kind        text not null default 'none' check (kind in ('none','normal','deemed','outside','remote','holiday','extra')),
  reason      text check (reason is null or char_length(reason) <= 200),
  status      text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approved_by uuid references public.profiles(id),
  decided_at  timestamptz,
  shift_id    uuid references public.shifts(id),   -- 승인으로 만들어진 일정
  is_test     boolean not null default true,
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);
create index on public.shift_requests (employee_id, work_date);
create index on public.shift_requests (status) where status = 'pending';

alter table public.shift_requests enable row level security;
create policy shift_requests_select on public.shift_requests for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.shift_requests from anon, authenticated;
revoke all on public.shift_requests from anon;
-- 요청 내용(사실)은 고정, 결정 칸만 바뀐다. 삭제 금지 (4-1)
create trigger shift_requests_guard before update or delete on public.shift_requests
  for each row execute function public.guard_columns('status', 'approved_by', 'decided_at', 'shift_id');
create trigger shift_requests_no_truncate before truncate on public.shift_requests
  for each statement execute function public.forbid_change();
create trigger shift_requests_audit after insert or update or delete on public.shift_requests
  for each row execute function public.audit_row();

alter table public.decision_log drop constraint decision_log_subject_table_check;
alter table public.decision_log add constraint decision_log_subject_table_check
  check (subject_table in ('overtime_requests', 'punch_corrections', 'leave_requests', 'work_requests', 'punch_requests', 'shift_requests'));
