-- 검수 R12: 두 대장의 동시 확정을 같은 잠금에서 검사한다. 운영 미적용.
create or replace function public.guard_payroll_finalization_integrity() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if new.status<>'FINALIZED' or old.status='FINALIZED' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('payroll:finalization',0));
  if new.current_generation_id is null or not exists(select 1 from public.payroll_calculation_generations where id=new.current_generation_id and run_id=new.id and state='SUCCEEDED') then raise exception using errcode='P0001',message='payroll_not_calculated'; end if;
  if new.run_kind='DAILY' then
    if not exists(select 1 from public.payroll_daily_statements where generation_id=new.current_generation_id) or exists(select 1 from public.payroll_daily_statements where generation_id=new.current_generation_id and state<>'OK') then raise exception using errcode='P0001',message='payroll_has_blocked'; end if;
    if exists(select 1 from public.payroll_daily_statements s where s.generation_id=new.current_generation_id and (not(s.snapshot ? 'workVersions') or jsonb_array_length(s.snapshot->'workVersions')<>jsonb_array_length(s.snapshot->'workIds'))) then raise exception using errcode='P0001',message='payroll_stale'; end if;
    if exists(select 1 from public.payroll_daily_statements s cross join lateral jsonb_array_elements(s.snapshot->'workVersions') v left join public.payroll_daily_work w on w.id=(v->>'id')::uuid where s.generation_id=new.current_generation_id and (w.id is null or w.status<>'CONFIRMED' or w.version<>(v->>'version')::int)) then raise exception using errcode='P0001',message='payroll_stale'; end if;
    if exists(
      select 1 from public.payroll_daily_statements a cross join lateral jsonb_array_elements_text(a.snapshot->'workIds') aw
      join public.payroll_runs r on r.status='FINALIZED' and r.run_kind='DAILY' and r.is_test=new.is_test and r.id<>new.id
      join public.payroll_daily_statements b on b.generation_id=r.current_generation_id
      where a.generation_id=new.current_generation_id and not(r.period_from=new.period_from and r.period_to=new.period_to and r.sequence=new.sequence) and b.snapshot->'workIds' ? aw.value
    ) then raise exception using errcode='P0001',message='payroll_duplicate_payment'; end if;
    if exists(
      select 1 from public.payroll_daily_statements ds join public.payroll_payees p on p.id=ds.payee_id
      cross join lateral jsonb_array_elements_text(ds.snapshot->'workIds') wi join public.payroll_daily_work w on w.id=wi.value::uuid
      join public.payroll_statements st on st.employee_id=p.profile_id and st.state='OK'
      join public.payroll_runs r on r.current_generation_id=st.generation_id and r.status='FINALIZED' and r.run_kind='REGULAR' and r.is_test=new.is_test and w.work_date>=r.period_from and w.work_date<r.period_to
      where ds.generation_id=new.current_generation_id
    ) then raise exception using errcode='P0001',message='payroll_duplicate_payment'; end if;
  elsif new.run_kind='REGULAR' then
    if not exists(select 1 from public.payroll_statements where generation_id=new.current_generation_id) or exists(select 1 from public.payroll_statements where generation_id=new.current_generation_id and state<>'OK') then raise exception using errcode='P0001',message='payroll_has_blocked'; end if;
    if exists(
      select 1 from public.payroll_statements st join public.payroll_payees p on p.profile_id=st.employee_id
      join public.payroll_daily_statements ds on ds.payee_id=p.id
      join public.payroll_runs r on r.current_generation_id=ds.generation_id and r.status='FINALIZED' and r.run_kind='DAILY' and r.is_test=new.is_test
      cross join lateral jsonb_array_elements_text(ds.snapshot->'workIds') wi join public.payroll_daily_work w on w.id=wi.value::uuid
      where st.generation_id=new.current_generation_id and w.work_date>=new.period_from and w.work_date<new.period_to
    ) then raise exception using errcode='P0001',message='payroll_duplicate_payment'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_payroll_finalization_integrity() from public,anon,authenticated;
create trigger payroll_finalization_integrity before update of status on public.payroll_runs for each row execute function public.guard_payroll_finalization_integrity();

create or replace function public.guard_daily_work_after_finalization() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('payroll:finalization',0));
  if exists(select 1 from public.payroll_daily_statements s join public.payroll_runs r on r.current_generation_id=s.generation_id and r.status='FINALIZED'
    where s.snapshot->'workIds' ? old.id::text and not exists(select 1 from public.payroll_runs correction where correction.run_kind='DAILY' and correction.period_from=r.period_from and correction.period_to=r.period_to and correction.sequence=r.sequence and correction.is_test=r.is_test and correction.revision>r.revision and correction.status<>'FINALIZED')) then
    raise exception using errcode='P0001',message='daily_work_in_run';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function public.guard_daily_work_after_finalization() from public,anon,authenticated;
create trigger daily_work_finalization_guard before update or delete on public.payroll_daily_work for each row execute function public.guard_daily_work_after_finalization();
