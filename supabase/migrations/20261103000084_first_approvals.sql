-- 20261103000084_first_approvals.sql
-- 두 단계 승인 (결정 사항 권한-13, 2026-11-03 의뢰인): 지점에 지점관리자가 있으면 그 지점 일반직원의 요청은
--   ① 지점관리자가 1차 확인 → ② 최고관리자가 최종 승인. DB(기록 · 휴가 · 일정)에는 최종 승인 때만 반영한다(지금과 같은 결정 함수).
--   이 표는 ①「지점관리자 확인 완료」 사실만 남긴다 — 누가 · 언제 · 어느 요청. 요청 표의 상태(pending)는 그대로 둔다.
--   덧붙이기만 한다. 고치거나 지우지 않는다 (4-1). 같은 요청에 두 번 남기지 않는다.
--
-- 되돌리는 방법: drop table public.first_approvals;
--   앱 코드를 먼저 예전으로 돌려야 한다(지점관리자의 승인이 바로 최종이 되던 때로). 이미 남은 1차 확인 기록은 사라진다.

create table public.first_approvals (
  id            uuid primary key default gen_random_uuid(),
  subject_table text not null check (subject_table in ('overtime_requests', 'punch_corrections', 'leave_requests', 'work_requests', 'punch_requests', 'shift_requests', 'leave_change_requests')),
  subject_id    uuid not null,
  employee_id   uuid not null references public.profiles(id),
  approved_by   uuid not null references public.profiles(id),  -- 1차 확인한 지점관리자
  is_test       boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index first_approvals_one on public.first_approvals (subject_table, subject_id);
create index on public.first_approvals (employee_id);

alter table public.first_approvals enable row level security;
create policy first_approvals_select on public.first_approvals for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.first_approvals from anon, authenticated;
revoke all on public.first_approvals from anon;
create trigger first_approvals_no_update   before update   on public.first_approvals for each row       execute function public.forbid_change();
create trigger first_approvals_no_delete   before delete   on public.first_approvals for each row       execute function public.forbid_change();
create trigger first_approvals_no_truncate before truncate on public.first_approvals for each statement execute function public.forbid_change();
create trigger first_approvals_audit after insert on public.first_approvals
  for each row execute function public.audit_row();
