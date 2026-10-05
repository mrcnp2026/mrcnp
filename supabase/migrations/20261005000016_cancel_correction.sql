-- 20261005000016_cancel_correction.sql
-- 승인된 정정(직원 요청·관리자 대리 등록)을 취소하는 길. 지금까지는 잘못 승인하거나 잘못 넣으면 되돌릴 방법이 없었다.
-- 정정 행은 지우거나 고치지 않는다 (4-1) — 상태만 'cancelled'로 바뀌고, 누가·왜 취소했는지는 결정 기록(decision_log)에 새 줄로 남는다.
-- 취소된 정정은 집계에 쓰이지 않는다 (집계는 status='approved'만 읽는다).
--
-- 되돌리는 방법: drop function public.cancel_correction(uuid, uuid, text, text);
--   punch_corrections.status 검사를 ('pending','approved','rejected')로 되돌린다 — 단, 이미 취소된 행이 있으면 되돌릴 수 없다.

alter table public.punch_corrections drop constraint punch_corrections_status_check;
alter table public.punch_corrections add constraint punch_corrections_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled'));

-- 결과: 'ok' | 'already' (승인 상태가 아님 — 이미 취소됐거나 대기·거부) | 'not_found'
-- R-4: "update … where status='approved'" 후 반영 행이 0이면 already. 읽은 뒤 쓰지 않는다.
create or replace function public.cancel_correction(p_id uuid, p_decided_by uuid, p_reason text, p_request_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows int;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 2 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.punch_corrections c
     set status = 'cancelled', decided_at = now()
   where c.id = p_id and c.status = 'approved';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return case when exists (select 1 from public.punch_corrections where id = p_id) then 'already' else 'not_found' end;
  end if;
  insert into public.decision_log (subject_table, subject_id, decision, reason, decided_by, request_id)
  values ('punch_corrections', p_id, 'cancelled', p_reason, p_decided_by, p_request_id);
  return 'ok';
end;
$$;
revoke execute on function public.cancel_correction(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_correction(uuid, uuid, text, text) to service_role;
