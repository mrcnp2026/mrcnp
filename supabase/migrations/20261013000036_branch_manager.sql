-- 20261013000036_branch_manager.sql
-- 지점관리자 등급 (의뢰인 2026-10-13: 급여 계산 전에 넣는다. 결정 사항 개발-2 · 개발-19).
-- ★ 운영 적용은 의뢰인이 변경 목록을 보고 승인한 뒤에만 한다 (`DB 변경 목록 — 묶음 3-2 (지점관리자).md`).
-- ★ 기존 표 2개의 「등급에 올 수 있는 값」에 manager를 더하고, 새 표 1개를 만든다. 기존 자료는 바꾸지 않는다.
-- ★ 적용 직후에는 아무것도 달라지지 않는다 — 지점관리자로 지정한 사람이 없는 동안에는 지금과 똑같다.
-- ★ 브라우저 권한(private.is_admin)은 그대로 둔다: 지점관리자는 DB를 직접 읽지 못하고, 서버가 맡은 지점의 자료만 골라서 준다.
--
-- 되돌리는 방법 (지점관리자를 한 명도 지정하지 않았을 때): 두 check를 예전 값으로 다시 만들고 drop table public.staff_manager_scopes;

-- 1. 직원 등급: 관리자 · 지점관리자 · 직원
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'manager', 'employee'));

-- 2. 등급 변경 요청(두 번째 관리자 확인)에도 지점관리자를 고를 수 있게
alter table public.role_change_requests drop constraint role_change_requests_new_role_check;
alter table public.role_change_requests add constraint role_change_requests_new_role_check check (new_role in ('admin', 'manager', 'employee'));

-- 3. 지점관리자가 맡은 지점 — 부서를 맡기면 그 밑의 팀도 포함한다(앱이 펼친다). 여러 지점을 맡을 수 있다
create table public.staff_manager_scopes (
  id         uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.profiles(id),
  group_id   uuid not null references public.org_groups(id),
  active     boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index staff_manager_scopes_one on public.staff_manager_scopes (manager_id, group_id) where active;
create index on public.staff_manager_scopes (manager_id) where active;

alter table public.staff_manager_scopes enable row level security;
revoke all on public.staff_manager_scopes from anon, authenticated;

create trigger staff_manager_scopes_guard before update or delete on public.staff_manager_scopes
  for each row execute function public.guard_columns('active', 'updated_by');
create trigger staff_manager_scopes_audit after insert or update or delete on public.staff_manager_scopes
  for each row execute function public.audit_row();
