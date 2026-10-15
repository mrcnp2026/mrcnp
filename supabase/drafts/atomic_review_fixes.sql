-- 검수 R11/R20: 원자적 판 저장·권한 변경·명세 조정.
-- 검토 초안: CLI로 마이그레이션 생성 및 격리 DB 검증 후 적용한다. 운영 미적용.
-- 기존 데이터 삭제/일괄 재작성 없음. 함수는 SECURITY INVOKER + service_role 전용이다.

create or replace function public.append_payroll_version_atomic(
  p_table text, p_identity text, p_values jsonb, p_valid_from date,
  p_reason text, p_expected_version int, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  ident text; allowed text[]; last_row jsonb; next_version int; payload jsonb;
  columns_sql text; result jsonb;
begin
  if not exists(select 1 from public.profiles where id=p_actor and active and role='admin' and can_view_payroll) then
    raise exception using errcode='P0001',message='payroll_forbidden';
  end if;
  case p_table
    when 'payroll_company_setting_versions' then ident := 'section'; allowed := array['payload'];
    when 'payroll_item_versions' then ident := 'code'; allowed := array['kind','ko_name','en_name','calc_kind','default_amount','fixed_allowance','tax_treatment','tax_exempt_limit','ordinary_wage','sort'];
    when 'payroll_policy_versions' then ident := 'policy_kind'; allowed := array['validated_payload'];
    when 'payroll_contract_versions' then ident := 'employee_id'; allowed := array['pay_type','amount','time_basis','monthly_hours','annual_divisor','included'];
    when 'payroll_employee_tax_versions' then ident := 'employee_id'; allowed := array['withholding_ratio','family_count','child_count','insurance','student_loan','reliefs'];
    else raise exception using errcode='P0001',message='invalid_input';
  end case;
  if p_identity is null or p_identity='' or p_valid_from is null or p_expected_version is null or p_expected_version < 0 or jsonb_typeof(p_values) is distinct from 'object' then
    raise exception using errcode='P0001',message='invalid_input';
  end if;
  if exists(select 1 from jsonb_object_keys(p_values) as keys(k) where not(k=any(allowed))) then
    raise exception using errcode='P0001',message='invalid_input';
  end if;
  -- 같은 대상의 첫 판 삽입까지 직렬화한다. 외부 API 호출은 이 잠금 안에서 하지 않는다.
  perform pg_advisory_xact_lock(hashtextextended(p_table||':'||p_identity,0));
  execute format('select to_jsonb(v) from public.%I v where %I::text=$1 and status=''active'' order by version desc limit 1 for update',p_table,ident) into last_row using p_identity;
  if coalesce((last_row->>'version')::int,0) <> p_expected_version then
    raise exception using errcode='P0001',message='payroll_version_conflict';
  end if;
  if last_row is not null then
    if p_valid_from <= (last_row->>'valid_from')::date then raise exception using errcode='P0001',message='payroll_effective_from_past'; end if;
    if nullif(btrim(p_reason),'') is null then raise exception using errcode='P0001',message='payroll_reason_required'; end if;
    if p_table='payroll_item_versions' and last_row->>'kind' is distinct from p_values->>'kind' then raise exception using errcode='P0001',message='invalid_input'; end if;
    if last_row->>'valid_to' is null or (last_row->>'valid_to')::date > p_valid_from then
      execute format('update public.%I set valid_to=$1 where id=$2',p_table) using p_valid_from,(last_row->>'id')::uuid;
    end if;
  end if;
  execute format('select coalesce(max(version),0)+1 from public.%I where %I::text=$1',p_table,ident) into next_version using p_identity;
  payload := p_values || jsonb_build_object(ident,p_identity,'valid_from',p_valid_from,'version',next_version,'reason',p_reason,'supersedes_id',last_row->>'id','created_by',p_actor);
  if p_table in ('payroll_item_versions','payroll_policy_versions') then payload := payload||jsonb_build_object('in_use',coalesce((last_row->>'in_use')::boolean,true)); end if;
  select string_agg(format('%I',k),',' order by k) into columns_sql from jsonb_object_keys(payload) as keys(k);
  execute format('insert into public.%I as added (%s) select %s from jsonb_populate_record(null::public.%I,$1) returning to_jsonb(added)',p_table,columns_sql,columns_sql,p_table) into result using payload;
  insert into public.payroll_audit_events(actor_id,action,subject_table,subject_id,employee_id,detail)
  values(p_actor,'version.append',p_table,(result->>'id')::uuid,case when ident='employee_id' then p_identity::uuid else null end,jsonb_build_object('version',next_version,'validFrom',p_valid_from));
  return result;
end $$;
revoke all on function public.append_payroll_version_atomic(text,text,jsonb,date,text,int,uuid) from public,anon,authenticated;
grant execute on function public.append_payroll_version_atomic(text,text,jsonb,date,text,int,uuid) to service_role;

-- 호출자는 profiles 테이블을 SHARE ROW EXCLUSIVE로 잠근 뒤 검사/변경한다.
create or replace function public.staff_role_change_block(p_actor uuid,p_target uuid,p_role text,p_pay boolean)
returns text language plpgsql security invoker set search_path = pg_catalog,public as $$
declare a public.profiles%rowtype; t public.profiles%rowtype; actor_top boolean; target_top boolean;
begin
  select * into a from public.profiles where id=p_actor;
  select * into t from public.profiles where id=p_target;
  if a.id is null or t.id is null then return 'not_found'; end if;
  if not a.active or a.role<>'admin' then return 'rank'; end if;
  if p_actor=p_target then return 'self_change'; end if;
  actor_top := coalesce(a.admin_level,'general') in ('super','ceo');
  target_top := t.role='admin' and coalesce(t.admin_level,'general') in ('super','ceo');
  if target_top and not actor_top then return 'owner_only'; end if;
  if not t.active then return 'employee_inactive'; end if;
  if p_role is null or p_role not in ('admin','manager','employee') or p_pay is null then return 'invalid_input'; end if;
  if p_pay and p_role<>'admin' then return 'payroll_needs_admin'; end if;
  if p_role=t.role and p_pay=t.can_view_payroll then return 'already'; end if;
  if p_pay is distinct from t.can_view_payroll and not a.can_view_payroll and not actor_top then return 'payroll_only_grant'; end if;
  if t.role='admin' and p_role<>'admin' and (select count(*) from public.profiles where active and role='admin' and id<>p_target)<2 then return 'min_admins'; end if;
  if t.role='admin' and t.can_view_payroll and (p_role<>'admin' or not p_pay) and not exists(select 1 from public.profiles where active and role='admin' and can_view_payroll and id<>p_target) then return 'min_payroll'; end if;
  return null;
end $$;
revoke all on function public.staff_role_change_block(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.staff_role_change_block(uuid,uuid,text,boolean) to service_role;

create or replace function public.request_staff_role_atomic(p_actor uuid,p_target uuid,p_role text,p_pay boolean,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog,public as $$
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
  if coalesce(a.admin_level,'general') not in ('super','ceo') and exists(select 1 from public.profiles where active and role='admin' and id<>p_actor) then
    insert into public.role_change_requests(target_id,new_role,new_can_view_payroll,reason,requested_by) values(p_target,next_role,next_pay,p_reason,p_actor) returning id into made;
    return jsonb_build_object('ok',true,'pending',true,'requestId',made);
  end if;
  update public.profiles set role=next_role,can_view_payroll=next_pay,admin_level=case when next_role='admin' then coalesce(t.admin_level,'general') else null end,updated_by=p_actor where id=p_target;
  insert into public.audit_logs(actor_id,action,target_table,target_id,after_data,reason) values(p_actor,'update','profiles',p_target,jsonb_build_object('event','role_changed','from',jsonb_build_object('role',t.role,'canViewPayroll',t.can_view_payroll),'to',jsonb_build_object('role',next_role,'canViewPayroll',next_pay),'requestId',p_request_id),p_reason);
  return jsonb_build_object('ok',true,'role',next_role,'canViewPayroll',next_pay);
end $$;
revoke all on function public.request_staff_role_atomic(uuid,uuid,text,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.request_staff_role_atomic(uuid,uuid,text,boolean,text,uuid) to service_role;

create or replace function public.decide_staff_role_atomic(p_actor uuid,p_id uuid,p_decision text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog,public as $$
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
  if p_decision<>'cancelled' and (t.id=p_actor or (coalesce(t.admin_level,'general') in ('super','ceo') and coalesce(a.admin_level,'general') not in ('super','ceo'))) then raise exception using errcode='P0001',message='rank'; end if;
  if p_decision='approved' then
    blocked := public.staff_role_change_block(r.requested_by,r.target_id,r.new_role,r.new_can_view_payroll);
    if blocked is null then blocked := public.staff_role_change_block(p_actor,r.target_id,r.new_role,r.new_can_view_payroll); end if;
    if blocked is not null then raise exception using errcode='P0001',message=blocked; end if;
    update public.profiles set role=r.new_role,can_view_payroll=r.new_can_view_payroll,admin_level=case when r.new_role='admin' then coalesce(t.admin_level,'general') else null end,updated_by=p_actor where id=r.target_id;
    insert into public.audit_logs(actor_id,action,target_table,target_id,after_data,reason) values(p_actor,'update','profiles',r.target_id,jsonb_build_object('event','role_changed','to',jsonb_build_object('role',r.new_role,'canViewPayroll',r.new_can_view_payroll),'requestedBy',r.requested_by,'confirmedBy',p_actor,'roleRequestId',p_id,'requestId',p_request_id),r.reason);
  end if;
  update public.role_change_requests set status=p_decision,decided_by=p_actor,decided_at=now() where id=p_id;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.decide_staff_role_atomic(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.decide_staff_role_atomic(uuid,uuid,text,uuid) to service_role;

create or replace function public.replace_payroll_override_atomic(
 p_run uuid,p_employee uuid,p_item text,p_kind text,p_amount numeric,p_reason text,p_actor uuid,p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.payroll_runs%rowtype; st uuid; l public.payroll_statement_items%rowtype; original numeric; made uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and active and role='admin' and can_view_payroll) then raise exception using errcode='P0001',message='payroll_forbidden'; end if;
 select * into r from public.payroll_runs where id=p_run for update;
 if r.id is null then raise exception using errcode='P0001',message='not_found'; end if;
 if r.status='FINALIZED' then raise exception using errcode='P0001',message='payroll_finalized'; end if;
 if not exists(select 1 from public.payroll_run_members where run_id=p_run and employee_id=p_employee) then raise exception using errcode='P0001',message='not_found'; end if;
 if p_item is null or char_length(p_item) not between 2 and 40 or p_kind is null or p_kind not in ('PAYMENT','DEDUCTION') or p_amount is null or p_amount<>trunc(p_amount) or abs(p_amount)>9007199254740991 then raise exception using errcode='P0001',message='invalid_input'; end if;
 if nullif(btrim(p_reason),'') is null or char_length(btrim(p_reason)) not between 2 and 500 then raise exception using errcode='P0001',message='reason_required'; end if;
 if r.current_generation_id is not null then
   select id into st from public.payroll_statements where generation_id=r.current_generation_id and employee_id=p_employee;
   select * into l from public.payroll_statement_items where statement_id=st and item_code=p_item and kind=p_kind order by line_no limit 1;
   if l.source='OVERRIDE' then original:=coalesce((l.calc_trace->>'autoAmount')::numeric,l.amount); elsif l.source='AUTO' then original:=l.amount; end if;
 end if;
 update public.payroll_statement_overrides set active=false,updated_by=p_actor where run_id=p_run and employee_id=p_employee and item_code=p_item and active;
 insert into public.payroll_statement_overrides(run_id,employee_id,item_code,kind,original_amount,proposed_amount,reason,created_by) values(p_run,p_employee,p_item,p_kind,original,p_amount,p_reason,p_actor) returning id into made;
 insert into public.payroll_audit_events(actor_id,action,subject_table,subject_id,employee_id,run_id,request_id,detail) values(p_actor,'override.add','payroll_statement_overrides',made,p_employee,p_run,p_request_id,jsonb_build_object('itemCode',p_item,'kind',p_kind));
 return jsonb_build_object('id',made);
end $$;
revoke all on function public.replace_payroll_override_atomic(uuid,uuid,text,text,numeric,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.replace_payroll_override_atomic(uuid,uuid,text,text,numeric,text,uuid,uuid) to service_role;
