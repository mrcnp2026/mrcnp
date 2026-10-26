-- 20261025000077_overtime_resync_and_payee_job.sql
-- ① 연장 신청 시간 바로잡기 (2026-10-25 의뢰인 승인): 샘플로 잘못 들어간 신청 분(分)을 실제 근무 시간으로 맞춘다.
--    · 집계된 분(overtime/night/holiday_minutes)은 여전히 아무도 못 고친다. 오직 아래 함수 resync_overtime()만, 그 트랜잭션 안에서만 고친다.
--    · 함수는 서버(service_role)만 부를 수 있고, 마감된 기간은 기존 close_lock 트리거가 그대로 막는다.
--    · 바꾸기 전 값과 바꾼 값은 decision_log(승인 건) · audit 기록에 남는다. 지우기는 여전히 막혀 있다.
-- ② 일용 지급 대상자에 「직무」(직접 입력) 칸. 소속(부서)은 두지 않는다.
--
-- 되돌리는 방법: drop function public.resync_overtime(...); 트리거 overtime_requests_guard를 0006의 guard_columns(...) 목록으로 다시 만들고
--   function public.overtime_requests_guard()를 지운다. alter table public.payroll_payees drop column job_title; 트리거를 0039의 칸 목록으로 되돌린다.
--   ⚠️ 이미 바로잡은 연장 시간은 되돌아가지 않는다(기록에서 이전 값을 확인할 수 있다).

-- ── ① 연장 신청 가드: 평소엔 0006과 같고, resync_overtime 안에서만 분 칸을 허용한다 ──
create or replace function public.overtime_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := array[
    'reason', 'status', 'approved_by', 'approved_minutes', 'approved_night_minutes', 'approved_holiday_minutes', 'decided_at',
    'needs_review', 'recomputed_overtime_minutes', 'recomputed_night_minutes', 'recomputed_holiday_minutes'];
begin
  if tg_op = 'DELETE' then
    raise exception '%: DELETE is not allowed (4-1). Use active=false / revoked_at / a new record.', tg_table_name using errcode = '42501';
  end if;
  if coalesce(current_setting('app.overtime_resync', true), '') = '1' then
    allowed := allowed || array['overtime_minutes', 'night_minutes', 'holiday_minutes', 'calc_version'];
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception '%: only % may change', tg_table_name, allowed using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger overtime_requests_guard on public.overtime_requests;
create trigger overtime_requests_guard before update or delete on public.overtime_requests
  for each row execute function public.overtime_requests_guard();

-- ── ① 바로잡기 함수: 신청 분을 실제 근무 분으로, 인정분은 전액(null)으로 ──
-- 결과: 'ok' | 'not_found' | 'rejected'(반려된 건은 건드리지 않는다)
create or replace function public.resync_overtime(
  p_id uuid, p_overtime int, p_night int, p_holiday int,
  p_actor uuid, p_reason text, p_request_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare r public.overtime_requests%rowtype;
begin
  if p_overtime < 0 or p_night < 0 or p_holiday < 0 then
    raise exception 'invalid_minutes' using errcode = 'P0001';
  end if;
  select * into r from public.overtime_requests where id = p_id for update;
  if not found then return 'not_found'; end if;
  if r.status = 'rejected' then return 'rejected'; end if;
  perform set_config('app.overtime_resync', '1', true);
  update public.overtime_requests
     set overtime_minutes = p_overtime, night_minutes = p_night, holiday_minutes = p_holiday,
         approved_minutes = null, approved_night_minutes = null, approved_holiday_minutes = null,
         needs_review = false,
         recomputed_overtime_minutes = null, recomputed_night_minutes = null, recomputed_holiday_minutes = null
   where id = p_id;
  perform set_config('app.overtime_resync', '', true);
  if r.status = 'approved' then
    insert into public.decision_log (subject_table, subject_id, decision, detail, reason, decided_by, request_id)
    values ('overtime_requests', p_id, 'approved',
            jsonb_build_object('resync', true,
              'before', jsonb_build_object('overtime', r.overtime_minutes, 'night', r.night_minutes, 'holiday', r.holiday_minutes,
                                           'approved_overtime', r.approved_minutes, 'approved_night', r.approved_night_minutes, 'approved_holiday', r.approved_holiday_minutes),
              'after', jsonb_build_object('overtime', p_overtime, 'night', p_night, 'holiday', p_holiday)),
            p_reason, p_actor, p_request_id);
  end if;
  return 'ok';
end;
$$;
revoke execute on function public.resync_overtime(uuid, int, int, int, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resync_overtime(uuid, int, int, int, uuid, text, text) to service_role;

-- ── ② 일용 지급 대상자의 직무 ──
alter table public.payroll_payees add column job_title text check (job_title is null or char_length(job_title) <= 40);
drop trigger payroll_payees_guard on public.payroll_payees;
create trigger payroll_payees_guard before update or delete on public.payroll_payees
  for each row execute function public.guard_columns('name', 'profile_id', 'phone', 'note', 'job_title', 'active', 'updated_by');
