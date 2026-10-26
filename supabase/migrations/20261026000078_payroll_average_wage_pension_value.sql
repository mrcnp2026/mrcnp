-- 20261026000078_payroll_average_wage_pension_value.sql — 묶음 36 (2026-10-26 의뢰인 승인: 퇴직금 평균임금 항목 구분 · 퇴직연금 계좌 평가금액)
-- 1) 지급 항목에 「퇴직금 평균임금에서의 구분」 칸을 더한다. 비어 있으면 지금과 같다(구분 없음 → 퇴직금 계산에서 사람이 직접 나눠 넣는다).
--    저장 함수(append_payroll_version_atomic)의 허용 목록에 이 칸을 더한다(함수의 나머지는 0062 그대로).
-- 2) 퇴직연금 가입에 「계좌 평가금액 · 기준일」 칸을 더한다(참고 표시용). 비어 있으면 지금과 같다. 수정 허용 목록(guard_columns)에 두 칸을 더한다.
--    (임금총액 범위 칸은 2026년 입금 내역으로 앱 규칙을 확인한 뒤 필요할 때만 만든다 — 이번 묶음에 넣지 않았다)
-- 되돌리기: alter table public.payroll_item_versions drop column average_wage_kind;
--          alter table public.payroll_pension_members drop column market_value, drop column market_value_as_of; (함수 · 트리거는 0062 · 0066의 목록으로 다시 만든다)

alter table public.payroll_item_versions add column average_wage_kind text check (average_wage_kind is null or average_wage_kind in ('MONTHLY','BONUS','EXCLUDED'));

alter table public.payroll_pension_members add column market_value numeric(18,0) check (market_value is null or market_value >= 0);
alter table public.payroll_pension_members add column market_value_as_of date;
alter table public.payroll_pension_members add constraint payroll_pension_value_pair check ((market_value is null) = (market_value_as_of is null));

-- 운영 DB에는 표 이름을 바꾸기 전 이름(retirement_pension_members_guard)의 트리거가 남아 있고 개발 DB에는 새 이름이다 — 있는 쪽을 지우고 새 이름으로 다시 만든다
drop trigger if exists payroll_pension_members_guard on public.payroll_pension_members;
drop trigger if exists retirement_pension_members_guard on public.payroll_pension_members;
create trigger payroll_pension_members_guard before update or delete on public.payroll_pension_members
  for each row execute function public.guard_columns('plan_kind', 'joined_on', 'ended_on', 'institution', 'opening_balance', 'opening_as_of', 'market_value', 'market_value_as_of', 'note', 'active', 'updated_by', 'updated_at');

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
    when 'payroll_item_versions' then ident := 'code'; allowed := array['kind','ko_name','en_name','calc_kind','default_amount','fixed_allowance','tax_treatment','tax_exempt_limit','tax_exempt_annual_limit','average_wage_kind','ordinary_wage','sort'];
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
