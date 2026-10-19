-- 20261018000056_system_admin.sql — 묶음 23 (의뢰인 2026-10-18 승인)
-- 시스템관리자(system) 등급: 권한은 최고관리자(super · ceo)와 같고, 최고관리자 3명 제한(guard_top_admins)에는 세지 않는다. 한 명만.
-- admin 계정(지금 general)을 system으로 옮긴다. 화면에서 숨기는 것은 앱이 한다(lib/system-admin.ts).
-- 아래 네 함수는 운영 DB의 지금 정의를 그대로 가져와 「in ('super','ceo')」에 'system'만 더했다.
-- 되돌리기: 함수 네 개의 'system'을 빼고 다시 만든다 · drop index profiles_one_system;
--           update profiles set admin_level='general' where admin_level='system';
--           profiles_admin_level_check를 ('super','ceo','general')로 되돌린다.

alter table public.profiles drop constraint profiles_admin_level_check;
alter table public.profiles add constraint profiles_admin_level_check check (admin_level in ('super', 'ceo', 'general', 'system'));
create unique index profiles_one_system on public.profiles ((true)) where admin_level = 'system';

-- staff_role_change_block: 'system'을 최고관리자로 본다 (2곳)
CREATE OR REPLACE FUNCTION public.staff_role_change_block(p_actor uuid, p_target uuid, p_role text, p_pay boolean)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.profiles%rowtype; t public.profiles%rowtype; actor_top boolean; target_top boolean;
begin
  select * into a from public.profiles where id=p_actor;
  select * into t from public.profiles where id=p_target;
  if a.id is null or t.id is null then return 'not_found'; end if;
  if not a.active or a.role<>'admin' then return 'rank'; end if;
  if p_actor=p_target then return 'self_change'; end if;
  actor_top := coalesce(a.admin_level,'general') in ('super','ceo','system');
  target_top := t.role='admin' and coalesce(t.admin_level,'general') in ('super','ceo','system');
  if target_top and not actor_top then return 'owner_only'; end if;
  if not t.active then return 'employee_inactive'; end if;
  if p_role is null or p_role not in ('admin','manager','employee') or p_pay is null then return 'invalid_input'; end if;
  if p_pay and p_role<>'admin' then return 'payroll_needs_admin'; end if;
  if p_role=t.role and p_pay=t.can_view_payroll then return 'already'; end if;
  if p_pay is distinct from t.can_view_payroll and not a.can_view_payroll and not actor_top then return 'payroll_only_grant'; end if;
  if t.role='admin' and p_role<>'admin' and (select count(*) from public.profiles where active and role='admin' and id<>p_target)<2 then return 'min_admins'; end if;
  if t.role='admin' and t.can_view_payroll and (p_role<>'admin' or not p_pay) and not exists(select 1 from public.profiles where active and role='admin' and can_view_payroll and id<>p_target) then return 'min_payroll'; end if;
  return null;
end $function$
;

-- request_staff_role_atomic: 'system'을 최고관리자로 본다 (1곳)
CREATE OR REPLACE FUNCTION public.request_staff_role_atomic(p_actor uuid, p_target uuid, p_role text, p_pay boolean, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.profiles%rowtype; t public.profiles%rowtype; next_role text; next_pay boolean; blocked text; made uuid;
begin
  lock table public.profiles in share row exclusive mode;
  select * into a from public.profiles where id=p_actor;
  select * into t from public.profiles where id=p_target;
  next_role := coalesce(p_role,t.role); next_pay := case when next_role='admin' then coalesce(p_pay,t.can_view_payroll) else false end;
  if p_pay is true and next_role<>'admin' then raise exception using errcode='P0001',message='payroll_needs_admin'; end if;
  blocked := public.staff_role_change_block(p_actor,p_target,next_role,next_pay);
  if blocked is not null then raise exception using errcode='P0001',message=blocked; end if;
  if nullif(btrim(p_reason),'') is null or char_length(btrim(p_reason)) not between 2 and 200 then raise exception using errcode='P0001',message='reason_required'; end if;
  if exists(select 1 from public.role_change_requests where target_id=p_target and status='pending') then raise exception using errcode='P0001',message='request_pending'; end if;
  if coalesce(a.admin_level,'general') not in ('super','ceo','system') and exists(select 1 from public.profiles where active and role='admin' and id<>p_actor) then
    insert into public.role_change_requests(target_id,new_role,new_can_view_payroll,reason,requested_by) values(p_target,next_role,next_pay,p_reason,p_actor) returning id into made;
    return jsonb_build_object('ok',true,'pending',true,'requestId',made);
  end if;
  update public.profiles set role=next_role,can_view_payroll=next_pay,admin_level=case when next_role='admin' then coalesce(t.admin_level,'general') else null end,updated_by=p_actor where id=p_target;
  insert into public.audit_logs(actor_id,action,target_table,target_id,after_data,reason) values(p_actor,'update','profiles',p_target,jsonb_build_object('event','role_changed','from',jsonb_build_object('role',t.role,'canViewPayroll',t.can_view_payroll),'to',jsonb_build_object('role',next_role,'canViewPayroll',next_pay),'requestId',p_request_id),p_reason);
  return jsonb_build_object('ok',true,'role',next_role,'canViewPayroll',next_pay);
end $function$
;

-- decide_staff_role_atomic: 'system'을 최고관리자로 본다 (2곳)
CREATE OR REPLACE FUNCTION public.decide_staff_role_atomic(p_actor uuid, p_id uuid, p_decision text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.profiles%rowtype; t public.profiles%rowtype; r public.role_change_requests%rowtype; blocked text;
begin
  lock table public.profiles in share row exclusive mode;
  select * into a from public.profiles where id=p_actor;
  if a.id is null or not a.active or a.role<>'admin' then raise exception using errcode='P0001',message='rank'; end if;
  select * into r from public.role_change_requests where id=p_id for update;
  if r.id is null then raise exception using errcode='P0001',message='not_found'; end if;
  if r.status<>'pending' then raise exception using errcode='P0001',message='already'; end if;
  if p_decision is null or p_decision not in ('approved','rejected','cancelled') then raise exception using errcode='P0001',message='invalid_input'; end if;
  if p_decision='cancelled' and r.requested_by<>p_actor then raise exception using errcode='P0001',message='forbidden'; end if;
  if p_decision<>'cancelled' and r.requested_by=p_actor then raise exception using errcode='P0001',message='self_decision'; end if;
  select * into t from public.profiles where id=r.target_id;
  if p_decision<>'cancelled' and (t.id=p_actor or (coalesce(t.admin_level,'general') in ('super','ceo','system') and coalesce(a.admin_level,'general') not in ('super','ceo','system'))) then raise exception using errcode='P0001',message='rank'; end if;
  if p_decision='approved' then
    blocked := public.staff_role_change_block(r.requested_by,r.target_id,r.new_role,r.new_can_view_payroll);
    if blocked is null then blocked := public.staff_role_change_block(p_actor,r.target_id,r.new_role,r.new_can_view_payroll); end if;
    if blocked is not null then raise exception using errcode='P0001',message=blocked; end if;
    update public.profiles set role=r.new_role,can_view_payroll=r.new_can_view_payroll,admin_level=case when r.new_role='admin' then coalesce(t.admin_level,'general') else null end,updated_by=p_actor where id=r.target_id;
    insert into public.audit_logs(actor_id,action,target_table,target_id,after_data,reason) values(p_actor,'update','profiles',r.target_id,jsonb_build_object('event','role_changed','to',jsonb_build_object('role',r.new_role,'canViewPayroll',r.new_can_view_payroll),'requestedBy',r.requested_by,'confirmedBy',p_actor,'roleRequestId',p_id,'requestId',p_request_id),r.reason);
  end if;
  update public.role_change_requests set status=p_decision,decided_by=p_actor,decided_at=now() where id=p_id;
  return jsonb_build_object('ok',true);
end $function$
;

-- assert_staff_approver: 'system'을 최고관리자로 본다 (2곳)
CREATE OR REPLACE FUNCTION public.assert_staff_approver(p_actor uuid, p_employee uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.profiles%rowtype; t public.profiles%rowtype;
begin
  lock table public.profiles in share mode;
  select * into a from public.profiles where id=p_actor;
  select * into t from public.profiles where id=p_employee;
  if a.id is null or t.id is null then raise exception using errcode='P0001',message='not_found'; end if;
  if not a.active then raise exception using errcode='P0001',message='rank'; end if;
  if a.role='admin' and coalesce(a.admin_level,'general') in ('super','ceo','system') then return; end if;
  if a.role='admin' then
    if coalesce(t.admin_level,'general') in ('super','ceo','system') then raise exception using errcode='P0001',message='rank'; end if;
    if p_actor=p_employee and exists(select 1 from public.profiles where active and role='admin' and id<>p_actor) then raise exception using errcode='P0001',message='self_decision'; end if;
    return;
  end if;
  if a.role<>'manager' or t.role<>'employee' then raise exception using errcode='P0001',message='rank'; end if;
  if p_actor=p_employee then raise exception using errcode='P0001',message='self_decision'; end if;
  lock table public.staff_manager_scopes,public.org_groups in share mode;
  if not exists(with recursive managed(id) as(
    select group_id from public.staff_manager_scopes where manager_id=p_actor and active
    union select g.id from public.org_groups g join managed m on g.parent_id=m.id
  ) select 1 from managed where id=t.group_id) then raise exception using errcode='P0001',message='out_of_scope'; end if;
end $function$
;

update public.profiles set admin_level = 'system' where employee_no = 'admin' and role = 'admin';
