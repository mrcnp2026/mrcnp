-- DB 변경 묶음 12 (2026-10-15 — 의뢰인 승인 전에는 적용하지 않는다). 원본 초안: supabase/drafts/attendance_integrity.sql
-- 검토 반영: 다시 실행해도 되게(if not exists · drop trigger if exists), 휴가 삭제 요청 승인을 지점관리자도 할 수 있게
-- 검수 R07/R22/R25 초안. 격리 DB 검증 후 CLI로 정식 마이그레이션 생성. 운영 미적용.
-- 과거 신청은 자동 재해석/재작성하지 않는다. 기존 행의 새 칸은 null이다.
alter table public.leave_requests add column if not exists type_snapshot jsonb;
alter table public.leave_requests add column if not exists work_dates date[];

create or replace function public.guard_leave_integrity() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare t public.leave_types%rowtype; d date; unit numeric; taken numeric; dates date[];
begin
  perform pg_advisory_xact_lock(hashtextextended('attendance:'||new.employee_id::text,0));
  if tg_op='INSERT' then
    select * into t from public.leave_types where code=new.type_code for share;
    new.type_snapshot := jsonb_build_object('isPaid',t.is_paid,'deductsBalance',t.deducts_balance,'dayUnit',t.day_unit,'hours',t.hours);
    if new.work_dates is null or cardinality(new.work_dates)=0 then raise exception using errcode='P0001',message='invalid_input'; end if;
    if exists(select 1 from unnest(new.work_dates) as ds(v) where v is null or v<new.start_date or v>new.end_date) or cardinality(new.work_dates)<>(select count(distinct v) from unnest(new.work_dates) as ds(v)) then raise exception using errcode='P0001',message='invalid_input'; end if;
    if new.days <> cardinality(new.work_dates)*t.day_unit then raise exception using errcode='P0001',message='invalid_input'; end if;
  elsif new.type_snapshot is distinct from old.type_snapshot or new.work_dates is distinct from old.work_dates then
    raise exception using errcode='P0001',message='invalid_input';
  end if;
  dates:=coalesce(new.work_dates,array(select generate_series(new.start_date,new.end_date,interval '1 day')::date));
  if new.status='approved' or (tg_op='UPDATE' and old.status='approved') then
    if exists(select 1 from public.day_confirms c where c.employee_id=new.employee_id and c.work_date=any(dates) and c.is_test=new.is_test and c.active) then raise exception using errcode='P0001',message='day_confirmed'; end if;
    if exists(select 1 from public.attendance_closes c where c.employee_id=new.employee_id and c.state='CLOSED' and daterange(c.period_from,c.period_to,'[)') && daterange(new.start_date,new.end_date,'[]') and c.is_test=new.is_test) then raise exception using errcode='P0001',message='period_locked'; end if;
  end if;
  if new.status not in ('pending','approved') then return new; end if;
  unit:=coalesce((new.type_snapshot->>'dayUnit')::numeric,(select day_unit from public.leave_types where code=new.type_code));
  foreach d in array dates loop
    select coalesce(sum(coalesce((r.type_snapshot->>'dayUnit')::numeric,lt.day_unit)),0) into taken from public.leave_requests r join public.leave_types lt on lt.code=r.type_code
      where r.employee_id=new.employee_id and r.id<>new.id and r.is_test=new.is_test and r.status in ('pending','approved') and d between r.start_date and r.end_date and (r.work_dates is null or d=any(r.work_dates));
    if taken+unit>1 then raise exception using errcode='P0001',message='duplicate_request'; end if;
    if new.start_time is not null and exists(select 1 from public.leave_requests r where r.employee_id=new.employee_id and r.id<>new.id and r.is_test=new.is_test and r.status in ('pending','approved') and d between r.start_date and r.end_date and (r.work_dates is null or d=any(r.work_dates)) and r.start_time is not null and new.start_time<r.end_time and r.start_time<new.end_time) then raise exception using errcode='P0001',message='duplicate_request'; end if;
  end loop;
  return new;
end $$;
revoke all on function public.guard_leave_integrity() from public,anon,authenticated;
drop trigger if exists leave_integrity_guard on public.leave_requests;
create trigger leave_integrity_guard before insert or update on public.leave_requests for each row execute function public.guard_leave_integrity();

-- 일별 확정·월 마감도 같은 직원 잠금을 사용해 검사와 변경 사이 경합을 막는다.
create or replace function public.lock_attendance_employee() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('attendance:'||new.employee_id::text,0));
  return new;
end $$;
revoke all on function public.lock_attendance_employee() from public,anon,authenticated;
drop trigger if exists day_confirms_employee_lock on public.day_confirms;
create trigger day_confirms_employee_lock before insert or update on public.day_confirms for each row execute function public.lock_attendance_employee();
drop trigger if exists attendance_closes_employee_lock on public.attendance_closes;
create trigger attendance_closes_employee_lock before insert or update on public.attendance_closes for each row execute function public.lock_attendance_employee();

create or replace function public.guard_shift_integrity() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('attendance:'||new.employee_id::text,0));
  -- 일정은 운영/연습 공통이므로 어느 쪽에서든 확정한 날짜는 먼저 확정을 풀어야 한다.
  if exists(select 1 from public.day_confirms where employee_id=new.employee_id and work_date=new.work_date and active) then raise exception using errcode='P0001',message='day_confirmed'; end if;
  if exists(select 1 from public.attendance_closes where employee_id=new.employee_id and state='CLOSED' and new.work_date>=period_from and new.work_date<period_to) then raise exception using errcode='P0001',message='period_locked'; end if;
  return new;
end $$;
revoke all on function public.guard_shift_integrity() from public,anon,authenticated;
drop trigger if exists shifts_integrity_guard on public.shifts;
create trigger shifts_integrity_guard before insert or update on public.shifts for each row execute function public.guard_shift_integrity();

-- 승인과 원장 사용/되돌림은 같은 트랜잭션이다. 기존 decide_leave도 이 트리거를 거친다.
create or replace function public.sync_leave_request_ledger() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare since_on date; seq bigint; used_now bigint; target_minutes int; needed int; take_minutes int; part record; deducts boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('attendance:'||new.employee_id::text,0));
  select min(usable_from) into since_on from public.leave_grant_lots where employee_id=new.employee_id and state='APPROVED';
  select count(*),-coalesce(sum(minutes),0) into seq,used_now from public.leave_ledger where request_id=new.id;
  if since_on is null and seq=0 then return new; end if;
  if new.start_date<coalesce(since_on,'9999-12-31'::date) and seq=0 then return new; end if;
  select coalesce((new.type_snapshot->>'deductsBalance')::boolean,t.deducts_balance) into deducts from public.leave_types t where code=new.type_code;
  target_minutes := case when new.status='approved' and deducts then round(new.days*480)::int else 0 end;
  if used_now=target_minutes then return new; end if;
  for part in select lot_id,sum(minutes)::int as total from public.leave_ledger where request_id=new.id group by lot_id having sum(minutes)<>0 loop
    insert into public.leave_ledger(employee_id,type_code,lot_id,event,minutes,effective_on,is_test,request_id,dedupe_key,actor_id)
      values(new.employee_id,'annual',part.lot_id,'cancel',-part.total,new.start_date,new.is_test,new.id,'req:'||new.id||':'||seq||':'||coalesce(part.lot_id::text,'adv')||':cancel',new.approved_by);
  end loop;
  needed:=target_minutes;
  if needed>0 then
    for part in
      select l.id,b.remaining from public.leave_grant_lots l cross join lateral(
        select coalesce(sum(e.minutes),0)::int as remaining from public.leave_ledger e where e.lot_id=l.id and e.request_id is distinct from new.id
          and (case when e.event='offset' then not new.is_test when e.request_id is null then not e.is_test else e.is_test=new.is_test end)
      ) b where l.employee_id=new.employee_id and l.state='APPROVED' and l.usable_from<=new.start_date and (l.usable_to is null or new.start_date<l.usable_to) and b.remaining>0
      order by coalesce(l.usable_to,'9999-12-31'::date),l.granted_on,l.id for update of l
    loop
      exit when needed<=0; take_minutes:=least(needed,part.remaining);
      insert into public.leave_ledger(employee_id,type_code,lot_id,event,minutes,effective_on,is_test,request_id,dedupe_key,actor_id)
        values(new.employee_id,'annual',part.id,'use',-take_minutes,new.start_date,new.is_test,new.id,'req:'||new.id||':'||seq||':'||part.id||':use',new.approved_by);
      needed:=needed-take_minutes;
    end loop;
    if needed>0 then
      insert into public.leave_ledger(employee_id,type_code,lot_id,event,minutes,effective_on,is_test,request_id,dedupe_key,actor_id)
        values(new.employee_id,'annual',null,'advance',-needed,new.start_date,new.is_test,new.id,'req:'||new.id||':'||seq||':adv:use',new.approved_by);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.sync_leave_request_ledger() from public,anon,authenticated;
drop trigger if exists leave_request_ledger_sync on public.leave_requests;
create trigger leave_request_ledger_sync after insert or update of status on public.leave_requests for each row execute function public.sync_leave_request_ledger();
drop trigger if exists leave_ledger_employee_lock on public.leave_ledger;
create trigger leave_ledger_employee_lock before insert on public.leave_ledger for each row execute function public.lock_attendance_employee();
drop trigger if exists leave_lots_employee_lock on public.leave_grant_lots;
create trigger leave_lots_employee_lock before insert or update on public.leave_grant_lots for each row execute function public.lock_attendance_employee();

create or replace function public.assert_staff_approver(p_actor uuid,p_employee uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.profiles%rowtype; t public.profiles%rowtype;
begin
  lock table public.profiles in share mode;
  select * into a from public.profiles where id=p_actor;
  select * into t from public.profiles where id=p_employee;
  if a.id is null or t.id is null then raise exception using errcode='P0001',message='not_found'; end if;
  if not a.active then raise exception using errcode='P0001',message='rank'; end if;
  if a.role='admin' and coalesce(a.admin_level,'general') in ('super','ceo') then return; end if;
  if a.role='admin' then
    if coalesce(t.admin_level,'general') in ('super','ceo') then raise exception using errcode='P0001',message='rank'; end if;
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
end $$;
revoke all on function public.assert_staff_approver(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assert_staff_approver(uuid,uuid) to service_role;

create or replace function public.decide_leave_atomic(p_id uuid,p_decision text,p_decided_by uuid,p_reason text,p_request_id uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare employee uuid;
begin
  select employee_id into employee from public.leave_requests where id=p_id;
  if employee is null then raise exception using errcode='P0001',message='not_found'; end if;
  perform public.assert_staff_approver(p_decided_by,employee);
  if p_decision='cancelled' and not exists(select 1 from public.profiles where id=p_decided_by and role='admin') then raise exception using errcode='P0001',message='forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance:'||employee::text,0));
  return public.decide_leave(p_id,p_decision,p_decided_by,p_reason,p_request_id::text);
end $$;
revoke all on function public.decide_leave_atomic(uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.decide_leave_atomic(uuid,text,uuid,text,uuid) to service_role;

create or replace function public.decide_leave_change_atomic(p_id uuid,p_decision text,p_decided_by uuid,p_request_id uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.leave_change_requests%rowtype; result text;
begin
  lock table public.profiles in share mode;
  select * into r from public.leave_change_requests where id=p_id for update;
  if r.id is null then raise exception using errcode='P0001',message='not_found'; end if;
  if r.status<>'pending' then return 'already'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception using errcode='P0001',message='invalid_input'; end if;
  perform public.assert_staff_approver(p_decided_by,r.employee_id);
  if p_decision='approved' then
    -- 직원이 낸 휴가 삭제 요청의 승인은 지점관리자도 한다(예전 동작) — 관리자 전용인 직접 취소 검사는 거치지 않는다
    perform pg_advisory_xact_lock(hashtextextended('attendance:'||r.employee_id::text,0));
    result:=public.decide_leave(r.leave_id,'cancelled',p_decided_by,null,p_request_id::text);
    if result='not_found' then raise exception using errcode='P0001',message='not_found'; end if;
  end if;
  update public.leave_change_requests set status=p_decision,approved_by=p_decided_by,decided_at=now() where id=p_id;
  insert into public.decision_log(subject_table,subject_id,decision,reason,decided_by,request_id) values('leave_change_requests',p_id,p_decision,null,p_decided_by,p_request_id::text);
  return 'ok';
end $$;
revoke all on function public.decide_leave_change_atomic(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.decide_leave_change_atomic(uuid,text,uuid,uuid) to service_role;
