-- 20261002000006_decisions.sql
-- 게이트 7·8: 연장 승인·정정 승인의 결정 기록과 동시 처리 규칙 (부록 R-2의 5·6, R-4, R-12-2, R-12-5)
--
-- 되돌리는 방법: drop function public.decide_overtime(...), public.decide_correction(...); drop table public.decision_log;
--   alter table public.overtime_requests drop column needs_review, recomputed_*, calc_version; 트리거를 0002의 칸 목록으로 다시 만든다.
--   ⚠️ 결정 기록이 사라진다 — 운영 뒤에는 되돌리지 말고 새 마이그레이션으로 고친다.

-- ─────────────────────────────────────────────
-- 연장 요청: 재확인 필요 표시 (R-4 마지막 전 행, 게이트 7에서 확정)
--   정정·재집계로 그날 집계가 바뀌어도 집계분(사실 칸)은 고치지 않는다. 새 값은 recomputed_*에 적고
--   needs_review=true로 처리함에 다시 올린다. 인정분을 코드가 임의로 줄이지 않는다 (판단은 사람).
-- 계산 버전 (R-12-2): 어느 코드로 만든 숫자인지
-- ─────────────────────────────────────────────
alter table public.overtime_requests
  add column needs_review boolean not null default false,
  add column recomputed_overtime_minutes int,
  add column recomputed_night_minutes int,
  add column recomputed_holiday_minutes int,
  add column calc_version text;

drop trigger overtime_requests_guard on public.overtime_requests;
create trigger overtime_requests_guard before update or delete on public.overtime_requests
  for each row execute function public.guard_columns(
    'reason', 'status', 'approved_by', 'approved_minutes',
    'approved_night_minutes', 'approved_holiday_minutes', 'decided_at',
    'needs_review', 'recomputed_overtime_minutes', 'recomputed_night_minutes', 'recomputed_holiday_minutes');

-- ─────────────────────────────────────────────
-- 결정 기록 — 누가·언제·무엇을 (R-2의 5). 덧붙이기만 한다 (R-12-5: 재결정도 새 행)
-- ─────────────────────────────────────────────
create table public.decision_log (
  id            uuid primary key default gen_random_uuid(),
  subject_table text not null check (subject_table in ('overtime_requests', 'punch_corrections')),
  subject_id    uuid not null,
  decision      text not null check (decision in ('approved', 'rejected')),
  detail        jsonb,          -- 부분 승인 분 등
  reason        text,
  decided_by    uuid not null references public.profiles(id),
  request_id    text,           -- 요청 번호 (R-12-4)
  created_at    timestamptz not null default now()
);
create index on public.decision_log (subject_table, subject_id, created_at desc);
alter table public.decision_log enable row level security;
create policy decision_log_select on public.decision_log for select to authenticated using ((select private.is_admin()));
revoke insert, update, delete, truncate on public.decision_log from anon, authenticated;
revoke all on public.decision_log from anon;
create trigger decision_log_no_update   before update   on public.decision_log for each row       execute function public.forbid_change();
create trigger decision_log_no_delete   before delete   on public.decision_log for each row       execute function public.forbid_change();
create trigger decision_log_no_truncate before truncate on public.decision_log for each statement execute function public.forbid_change();

-- ─────────────────────────────────────────────
-- 연장 결정 — R-4: "update … where status='pending'" 후 반영 행이 0이면 "이미 처리됨". 읽은 뒤 쓰지 않는다.
-- 재확인 필요(needs_review) 건은 이미 결정됐어도 다시 결정할 수 있다 — 그때 needs_review를 내리고 새 결정 행을 남긴다.
-- 결과: 'ok' | 'already' (누가 먼저 처리함) | 'not_found'
-- ─────────────────────────────────────────────
create or replace function public.decide_overtime(
  p_id uuid, p_decision text, p_approved_minutes int, p_approved_night int, p_approved_holiday int,
  p_decided_by uuid, p_reason text, p_request_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows int;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid_decision' using errcode = 'P0001'; end if;
  update public.overtime_requests o
     set status = p_decision,
         approved_by = p_decided_by,
         decided_at = now(),
         approved_minutes         = case when p_decision = 'approved' then p_approved_minutes end,
         approved_night_minutes   = case when p_decision = 'approved' then p_approved_night end,
         approved_holiday_minutes = case when p_decision = 'approved' then p_approved_holiday end,
         needs_review = false
   where o.id = p_id and (o.status = 'pending' or o.needs_review);
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return case when exists (select 1 from public.overtime_requests where id = p_id) then 'already' else 'not_found' end;
  end if;
  insert into public.decision_log (subject_table, subject_id, decision, detail, reason, decided_by, request_id)
  values ('overtime_requests', p_id, p_decision,
          jsonb_build_object('approved_minutes', p_approved_minutes, 'approved_night_minutes', p_approved_night,
                             'approved_holiday_minutes', p_approved_holiday),
          p_reason, p_decided_by, p_request_id);
  return 'ok';
end;
$$;

-- 정정 결정. add_missing 2건 승인은 부분 유일 인덱스가 막는다 → 'conflict'
create or replace function public.decide_correction(
  p_id uuid, p_decision text, p_decided_by uuid, p_reason text, p_request_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows int;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid_decision' using errcode = 'P0001'; end if;
  begin
    update public.punch_corrections c
       set status = p_decision, approved_by = p_decided_by, decided_at = now()
     where c.id = p_id and c.status = 'pending';
    get diagnostics v_rows = row_count;
  exception when unique_violation then
    return 'conflict';
  end;
  if v_rows = 0 then
    return case when exists (select 1 from public.punch_corrections where id = p_id) then 'already' else 'not_found' end;
  end if;
  insert into public.decision_log (subject_table, subject_id, decision, reason, decided_by, request_id)
  values ('punch_corrections', p_id, p_decision, p_reason, p_decided_by, p_request_id);
  return 'ok';
end;
$$;

revoke execute on function public.decide_overtime(uuid, text, int, int, int, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.decide_correction(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.decide_overtime(uuid, text, int, int, int, uuid, text, text) to service_role;
grant execute on function public.decide_correction(uuid, text, uuid, text, text) to service_role;
