-- 20261005000019_role_change_requests.sql
-- 두 번째 관리자 확인 (부록 R-2의 8): 관리자 권한 부여·회수, 급여 담당 변경은 요청한 관리자와 **다른 관리자**가 확인해야 반영된다.
-- 요청 내용(누구를 무엇으로·사유·요청자)은 고정이고 결정 칸만 바뀐다. 지우지 않는다. 한 사람에 대기 중인 요청은 하나만.
-- 관리자가 혼자일 때(확인해 줄 사람이 없다)는 서버가 요청을 만들지 않고 바로 반영한다 — 첫 두 번째 관리자를 지정할 수 있어야 한다.
--
-- 되돌리는 방법: drop table public.role_change_requests;  ⚠️ 요청·확인 기록이 사라진다.

create table public.role_change_requests (
  id                   uuid primary key default gen_random_uuid(),
  target_id            uuid not null references public.profiles(id),
  new_role             text not null check (new_role in ('admin', 'employee')),
  new_can_view_payroll boolean not null,
  reason               text not null check (char_length(btrim(reason)) between 2 and 200),
  requested_by         uuid not null references public.profiles(id),
  status               text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by           uuid references public.profiles(id),
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  -- 확인하는 사람은 요청자와 달라야 한다 (취소는 요청자 본인)
  check (status <> 'approved' or (decided_by is not null and decided_by <> requested_by))
);
create unique index role_change_one_pending on public.role_change_requests (target_id) where status = 'pending';
create index on public.role_change_requests (status) where status = 'pending';

alter table public.role_change_requests enable row level security;
create policy role_change_requests_select on public.role_change_requests for select to authenticated using ((select private.is_admin()));
revoke insert, update, delete, truncate on public.role_change_requests from anon, authenticated;
revoke all on public.role_change_requests from anon;

create trigger role_change_requests_guard before update or delete on public.role_change_requests
  for each row execute function public.guard_columns('status', 'decided_by', 'decided_at');
create trigger role_change_requests_no_truncate before truncate on public.role_change_requests
  for each statement execute function public.forbid_change();
create trigger role_change_requests_audit after insert or update or delete on public.role_change_requests
  for each row execute function public.audit_row();
