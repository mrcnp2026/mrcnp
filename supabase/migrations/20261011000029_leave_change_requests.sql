-- 20261011000029_leave_change_requests.sql
-- 직원이 내는 「휴가 삭제 요청」 (의뢰인 2026-10-11: 시프티의 요청 › 휴가 삭제 — 승인된 휴가를 없애 달라고 요청하고 관리자가 승인).
--   승인하면 그 휴가가 취소된다(leave_requests.status='cancelled', decide_leave가 처리 — 잔여가 돌아온다). 거절하면 휴가는 그대로다.
--   직원은 대기 중인 자기 요청을 취소할 수 있다. 줄은 지우지 않는다 (4-1).
--   kind는 지금 'delete'뿐이다 — 휴가 수정 요청(날짜·종류 바꾸기)은 아직 없다 (할일 「라. 휴가」).
--
-- 되돌리는 방법: drop table public.leave_change_requests; decision_log.subject_table 검사를 0028의 목록으로 되돌린다.
--   ⚠️ 운영 뒤에는 되돌리지 말 것 (대기 중인 요청이 사라진다). 이미 취소된 휴가는 그대로 남는다.

create table public.leave_change_requests (
  id          uuid primary key default gen_random_uuid(),
  leave_id    uuid not null references public.leave_requests(id),
  employee_id uuid not null references public.profiles(id),
  kind        text not null default 'delete' check (kind in ('delete')),
  reason      text check (reason is null or char_length(reason) <= 200),
  status      text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approved_by uuid references public.profiles(id),
  decided_at  timestamptz,
  is_test     boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index leave_change_one_pending on public.leave_change_requests (leave_id) where status = 'pending';
create index on public.leave_change_requests (employee_id);

alter table public.leave_change_requests enable row level security;
create policy leave_change_requests_select on public.leave_change_requests for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.leave_change_requests from anon, authenticated;
revoke all on public.leave_change_requests from anon;
-- 요청 내용(사실)은 고정, 결정 칸만 바뀐다. 삭제 금지 (4-1)
create trigger leave_change_requests_guard before update or delete on public.leave_change_requests
  for each row execute function public.guard_columns('status', 'approved_by', 'decided_at');
create trigger leave_change_requests_no_truncate before truncate on public.leave_change_requests
  for each statement execute function public.forbid_change();
create trigger leave_change_requests_audit after insert or update or delete on public.leave_change_requests
  for each row execute function public.audit_row();

alter table public.decision_log drop constraint decision_log_subject_table_check;
alter table public.decision_log add constraint decision_log_subject_table_check
  check (subject_table in ('overtime_requests', 'punch_corrections', 'leave_requests', 'work_requests', 'punch_requests', 'shift_requests', 'leave_change_requests'));
