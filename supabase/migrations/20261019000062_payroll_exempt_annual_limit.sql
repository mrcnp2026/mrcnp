-- 20261019000062_payroll_exempt_annual_limit.sql — 묶음 28 (2026-10-19 의뢰인: 비과세 연간 누적)
-- 지급 항목에 「연간 비과세 한도」(원) 칸을 더한다 — 예: 생산직 연장 · 야간 · 휴일근로수당 비과세 연 240만원.
-- 비어 있으면 연간 한도 없음(지금처럼 달마다의 한도만). 저장 함수가 이 칸을 받도록 허용 목록에 더한다(함수의 나머지는 그대로).
-- 되돌리기: alter table public.payroll_item_versions drop column tax_exempt_annual_limit; (함수는 0043의 허용 목록으로 다시 만든다)

alter table public.payroll_item_versions add column tax_exempt_annual_limit bigint check (tax_exempt_annual_limit is null or tax_exempt_annual_limit >= 0);

CREATE OR REPLACE FUNCTION public.append_payroll_version_atomic(p_table text, p_identity text, p_values jsonb, p_valid_from date, p_reason text, p_expected_version integer, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  ident text; allowed text[]; last_row jsonb; next_version int; payload jsonb;
  columns_sql text; result jsonb;
begin
  if not exists(select 1 from public.profiles where id=p_actor and active and role='admin' and can_view_payroll) then
    raise exception using errcode='P0001',message='payroll_forbidden';
  end if;
  case p_table
    when 'payroll_company_setting_versions' then ident := 'section'; allowed := array['payload'];
    when 'payroll_item_versions' then ident := 'code'; allowed := array['kind','ko_name','en_name','calc_kind','default_amount','fixed_allowance','tax_treatment','tax_exempt_limit','tax_exempt_annual_limit','ordinary_wage','sort'];
    when 'payroll_policy_versions' then ident := 'policy_kind'; allowed := array['validated_payload'];
    when 'payroll_contract_versions' then ident := 'employee_id'; allowed := array['pay_type','amount','time_basis','monthly_hours','annual_divisor','included','employment_id'];
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
end $function$
;
