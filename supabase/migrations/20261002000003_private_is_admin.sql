-- 20261002000003_private_is_admin.sql
-- Supabase 보안 점검 경고(0029) 해소: public.is_admin()이 /rest/v1/rpc/is_admin 으로 외부에서 호출 가능했다.
-- 알려지는 것은 "호출한 본인이 관리자인가"뿐이라 위험은 낮지만, API로 노출되지 않는 private 스키마로 옮긴다.
--
-- 되돌리는 방법: 정책을 public.is_admin()으로 다시 만들고 private 스키마를 drop. 데이터 손실 없음.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.active
  );
$$;
revoke execute on function private.is_admin() from public, anon;
grant  execute on function private.is_admin() to authenticated;

alter policy profiles_select          on public.profiles          using (id = (select auth.uid())          or (select private.is_admin()));
alter policy punch_events_select      on public.punch_events      using (employee_id = (select auth.uid()) or (select private.is_admin()));
alter policy punch_corrections_select on public.punch_corrections using (employee_id = (select auth.uid()) or (select private.is_admin()));
alter policy overtime_requests_select on public.overtime_requests using (employee_id = (select auth.uid()) or (select private.is_admin()));
alter policy user_passkeys_select     on public.user_passkeys     using (employee_id = (select auth.uid()) or (select private.is_admin()));

drop function public.is_admin();
