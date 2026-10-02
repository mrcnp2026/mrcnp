-- 20261002000012_work_requests.sql
-- ②-3 게이트 11: 외근·출장·재택 신청 (②마스터 6장 스키마, 7-11). 시프티 대조 우선 반영 ④ (2026-10-02 의뢰인)
--
-- 되돌리는 방법: drop function public.decide_work(...), public.cancel_work(...); drop table public.work_requests;
--   decision_log.subject_table 검사를 0011의 목록으로 되돌린다.
--
-- ⚠️ 승인해도 punch_events.ip_verified 값은 바꾸지 않는다 (B-21). 사실(사무실 밖이었다)은 그대로 두고
--    화면에서 "승인된 외근"으로 표시만 한다 — 사실과 판단의 분리 (① 6장).

create table public.work_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  kind         text not null check (kind in ('outside','business_trip','remote')),
  start_date   date not null,
  end_date     date not null,
  start_time   time,            -- 반나절 외근이면
  end_time     time,
  place        text not null check (length(place) between 1 and 100),  -- 업무 정보라 필수 (7-11 요점 5)
  reason       text,            -- 선택
  status       text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approved_by  uuid references public.profiles(id),
  requested_by uuid not null references public.profiles(id),
  is_test      boolean not null default true,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  check (end_date >= start_date),
  check ((start_time is null) = (end_time is null))
);
create index on public.work_requests (employee_id, start_date);
create index on public.work_requests (status) where status = 'pending';

alter table public.work_requests enable row level security;
create policy work_requests_select on public.work_requests for select to authenticated using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.work_requests from anon, authenticated;
revoke all on public.work_requests from anon;

create trigger work_requests_guard before update or delete on public.work_requests
  for each row execute function public.guard_columns('status', 'approved_by', 'decided_at');
create trigger work_requests_no_truncate before truncate on public.work_requests
  for each statement execute function public.forbid_change();
create trigger work_requests_audit after insert or update or delete on public.work_requests for each row execute function public.audit_row();

alter table public.decision_log drop constraint decision_log_subject_table_check;
alter table public.decision_log add constraint decision_log_subject_table_check
  check (subject_table in ('overtime_requests', 'punch_corrections', 'leave_requests', 'work_requests'));

-- 관리자 결정: pending → approved/rejected, approved → cancelled (먼저 반영된 쪽만, R-4)
create or replace function public.decide_work(
  p_id uuid, p_decision text, p_decided_by uuid, p_reason text, p_request_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows int;
begin
  if p_decision not in ('approved', 'rejected', 'cancelled') then raise exception 'invalid_decision' using errcode = 'P0001'; end if;
  update public.work_requests r
     set status = p_decision, approved_by = p_decided_by, decided_at = now()
   where r.id = p_id
     and ((p_decision in ('approved','rejected') and r.status = 'pending') or (p_decision = 'cancelled' and r.status = 'approved'));
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return case when exists (select 1 from public.work_requests where id = p_id) then 'already' else 'not_found' end;
  end if;
  insert into public.decision_log (subject_table, subject_id, decision, reason, decided_by, request_id)
  values ('work_requests', p_id, p_decision, p_reason, p_decided_by, p_request_id);
  return 'ok';
end;
$$;

create or replace function public.cancel_work(p_id uuid, p_employee uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows int;
begin
  update public.work_requests r set status = 'cancelled', decided_at = now()
   where r.id = p_id and r.employee_id = p_employee and r.status = 'pending';
  get diagnostics v_rows = row_count;
  return case when v_rows = 1 then 'ok' when exists (select 1 from public.work_requests where id = p_id and employee_id = p_employee) then 'already' else 'not_found' end;
end;
$$;

revoke execute on function public.decide_work(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cancel_work(uuid, uuid) from public, anon, authenticated;
grant execute on function public.decide_work(uuid, text, uuid, text, text) to service_role;
grant execute on function public.cancel_work(uuid, uuid) to service_role;
