-- 20261103000086_role_request_scopes.sql
-- 지점관리자 지정 요청에 맡을 지점을 함께 담아 둔다 (2026-11-03 의뢰인: 「지점관리자 저장 방식이 이상해」).
--   대표 등급이 아닌 최고관리자가 등급을 바꾸면 다른 관리자 확인을 기다리는 요청(role_change_requests)이 된다 —
--   그때 고른 지점이 어디에도 남지 않아, 승인 뒤에 지점을 다시 골라야 했다. 요청마다 고른 지점을 여기 남기고, 승인되면 그대로 반영한다.
--   덧붙이기만 한다(고치거나 지우지 않는다).
--
-- 되돌리는 방법: drop table public.role_request_scopes; (앱 코드를 먼저 예전으로)

create table public.role_request_scopes (
  request_id  uuid primary key references public.role_change_requests(id),
  group_ids   uuid[] not null check (cardinality(group_ids) between 1 and 200),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);
alter table public.role_request_scopes enable row level security;
create policy role_request_scopes_select on public.role_request_scopes for select to authenticated using ((select private.is_admin()));
revoke insert, update, delete, truncate on public.role_request_scopes from anon, authenticated;
revoke all on public.role_request_scopes from anon;
create trigger role_request_scopes_no_update   before update   on public.role_request_scopes for each row       execute function public.forbid_change();
create trigger role_request_scopes_no_delete   before delete   on public.role_request_scopes for each row       execute function public.forbid_change();
create trigger role_request_scopes_no_truncate before truncate on public.role_request_scopes for each statement execute function public.forbid_change();
