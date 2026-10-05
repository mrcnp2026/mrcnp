-- 20261005000015_active_only_read.sql
-- 퇴사 처리 순간 읽기도 끊는다 (②-2 7-2 요점 2-1의 ③).
-- 계정을 차단해도 이미 발급된 로그인 토큰은 만료될 때까지(1시간 안팎) 유효하다. 그동안 퇴사자가 DB를 직접 조회하지 못하게,
-- 모든 읽기 정책에 "재직 중(profiles.active)" 조건을 넣는다. 앱 화면·API는 이미 서버(getMe)가 매 요청마다 재직 여부를 본다.
--
-- 되돌리는 방법: 아래 alter policy를 0003·0005·0011·0012·0013의 원래 using 절로 되돌리고 private.is_active()를 drop. 데이터 손실 없음.

create or replace function private.is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active);
$$;
revoke execute on function private.is_active() from public, anon;
grant  execute on function private.is_active() to authenticated;

-- 본인 것 읽기: 재직 중일 때만. 관리자 읽기는 private.is_admin()이 이미 active를 본다
alter policy profiles_select          on public.profiles          using ((id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));
alter policy punch_events_select      on public.punch_events      using ((employee_id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));
alter policy punch_corrections_select on public.punch_corrections using ((employee_id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));
alter policy overtime_requests_select on public.overtime_requests using ((employee_id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));
alter policy user_passkeys_select     on public.user_passkeys     using ((employee_id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));
alter policy work_notes_select        on public.work_notes        using ((employee_id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));
alter policy leave_grants_select      on public.leave_grants      using ((employee_id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));
alter policy leave_requests_select    on public.leave_requests    using ((employee_id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));
alter policy work_requests_select     on public.work_requests     using ((employee_id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));

-- 공용 설정·목록 읽기도 재직자만
alter policy work_rules_select      on public.work_rules      using ((select private.is_active()));
alter policy office_networks_select on public.office_networks using ((select private.is_active()));
alter policy holidays_select        on public.holidays        using ((select private.is_active()));
alter policy leave_types_select     on public.leave_types     using ((select private.is_active()));
alter policy org_groups_select      on public.org_groups      using ((select private.is_active()));
