-- 20261002000011_leave.sql
-- ②-2 게이트 5: 연차·휴가 (②마스터 6장 스키마, 4-7, 4-11). 시프티 대조 우선 반영 ① (2026-10-02 의뢰인)
--
-- 되돌리는 방법: drop function public.decide_leave(...), public.cancel_leave(...);
--   drop table public.leave_requests, public.leave_grants, public.leave_types;
--   decision_log.subject_table 검사를 0006의 목록으로 되돌린다.
--   ⚠️ 운영 뒤에는 되돌리지 말고 새 마이그레이션으로 고친다 (연차 기록이 사라진다).

-- ─────────────────────────────────────────────
-- 휴가 종류. ⚠️⚠️ is_paid = true 인 휴가일은 결근이 아니다 — 결근으로 세면 급여가 깎인다.
-- 병가·경조사의 유급 여부는 회사 규정이다 (법정 의무 아님) — 기본값은 아래, 규정이 다르면 update 한 줄로 바꾼다.
-- ─────────────────────────────────────────────
create table public.leave_types (
  code            text primary key,
  name            text not null,
  is_paid         boolean not null,
  deducts_balance boolean not null,
  day_unit        numeric(3,2) not null default 1.0,   -- 1.0 하루 단위 / 0.5 반차 / 0.25 반반차
  sort            int not null default 0,
  active          boolean not null default true
);
insert into public.leave_types (code, name, is_paid, deducts_balance, day_unit, sort) values
  ('annual',     '연차',   true,  true,  1.0,  1),
  ('half',       '반차',   true,  true,  0.5,  2),
  ('quarter',    '반반차', true,  true,  0.25, 3),
  ('sick',       '병가',   false, false, 1.0,  4),
  ('condolence', '경조사', true,  false, 1.0,  5),
  ('unpaid',     '무급휴가', false, false, 1.0, 6);

-- ─────────────────────────────────────────────
-- 연차 부여 (4-7). ★ 자동 계산하지 않는다 — 관리자가 직접 입력. 앱의 계산기는 참고용
-- ─────────────────────────────────────────────
create table public.leave_grants (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.profiles(id),
  period_label   text not null,                -- '2026' 또는 '2026-03~2027-02'
  granted_days   numeric(4,2) not null check (granted_days >= 0),
  carried_days   numeric(4,2) not null default 0 check (carried_days >= 0),
  basis          text not null check (basis in ('hire_date','fiscal_year')),
  note           text,
  effective_from date not null,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  unique (employee_id, period_label)
);
create index on public.leave_grants (employee_id, effective_from desc);

-- ─────────────────────────────────────────────
-- 휴가 신청. ⚠️ days는 소수 (반차 0.5, 반반차 0.25). reason은 선택 (4-7: NOT NULL 금지)
-- 연습 모드 구분 is_test — 출퇴근 기록과 같은 규칙 (0007)
-- ─────────────────────────────────────────────
create table public.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  type_code    text not null references public.leave_types(code),
  start_date   date not null,
  end_date     date not null,
  days         numeric(4,2) not null check (days > 0),
  reason       text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approved_by  uuid references public.profiles(id),
  requested_by uuid not null references public.profiles(id),
  is_test      boolean not null default true,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  check (end_date >= start_date)
);
create index on public.leave_requests (employee_id, start_date);
create index on public.leave_requests (status) where status = 'pending';

-- ─────────────────────────────────────────────
-- 권한 (4-11): 읽기는 본인·관리자. 쓰기는 서버(service_role)만 — 직원이 브라우저에서 approved로 넣는 구멍(B-29) 차단
-- ─────────────────────────────────────────────
alter table public.leave_types    enable row level security;
alter table public.leave_grants   enable row level security;
alter table public.leave_requests enable row level security;
create policy leave_types_select    on public.leave_types    for select to authenticated using (true);
create policy leave_grants_select   on public.leave_grants   for select to authenticated using (employee_id = (select auth.uid()) or (select private.is_admin()));
create policy leave_requests_select on public.leave_requests for select to authenticated using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.leave_types, public.leave_grants, public.leave_requests from anon, authenticated;
revoke all on public.leave_types, public.leave_grants, public.leave_requests from anon;

-- 신청 내용(사실)은 고정, 결정 칸만 바뀐다. 삭제 금지 (4-1)
create trigger leave_requests_guard before update or delete on public.leave_requests
  for each row execute function public.guard_columns('status', 'approved_by', 'decided_at');
create trigger leave_requests_no_truncate before truncate on public.leave_requests
  for each statement execute function public.forbid_change();
-- 부여: 숫자는 고칠 수 있다(오타) — 대신 변경 기록에 남는다. 삭제 금지
create trigger leave_grants_guard before delete on public.leave_grants
  for each row execute function public.guard_columns();

-- 변경 기록 (0009 audit_row)
create trigger leave_types_audit    after insert or update or delete on public.leave_types    for each row execute function public.audit_row();
create trigger leave_grants_audit   after insert or update or delete on public.leave_grants   for each row execute function public.audit_row();
create trigger leave_requests_audit after insert or update or delete on public.leave_requests for each row execute function public.audit_row();

-- ─────────────────────────────────────────────
-- 결정 기록에 연차 추가 + 'cancelled' (승인된 연차를 관리자가 취소 — 4-6: 출근 기록과 충돌할 때 관리자가 판단)
-- ─────────────────────────────────────────────
alter table public.decision_log drop constraint decision_log_subject_table_check;
alter table public.decision_log add constraint decision_log_subject_table_check
  check (subject_table in ('overtime_requests', 'punch_corrections', 'leave_requests'));
alter table public.decision_log drop constraint decision_log_decision_check;
alter table public.decision_log add constraint decision_log_decision_check
  check (decision in ('approved', 'rejected', 'cancelled'));

-- 관리자 결정: pending → approved/rejected, approved → cancelled. 먼저 반영된 쪽만 유효 (R-4)
create or replace function public.decide_leave(
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
  update public.leave_requests r
     set status = p_decision, approved_by = p_decided_by, decided_at = now()
   where r.id = p_id
     and ((p_decision in ('approved','rejected') and r.status = 'pending') or (p_decision = 'cancelled' and r.status = 'approved'));
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return case when exists (select 1 from public.leave_requests where id = p_id) then 'already' else 'not_found' end;
  end if;
  insert into public.decision_log (subject_table, subject_id, decision, reason, decided_by, request_id)
  values ('leave_requests', p_id, p_decision, p_reason, p_decided_by, p_request_id);
  return 'ok';
end;
$$;

-- 직원 본인 취소: 대기 중인 자기 신청만
create or replace function public.cancel_leave(p_id uuid, p_employee uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows int;
begin
  update public.leave_requests r set status = 'cancelled', decided_at = now()
   where r.id = p_id and r.employee_id = p_employee and r.status = 'pending';
  get diagnostics v_rows = row_count;
  return case when v_rows = 1 then 'ok' when exists (select 1 from public.leave_requests where id = p_id and employee_id = p_employee) then 'already' else 'not_found' end;
end;
$$;

revoke execute on function public.decide_leave(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cancel_leave(uuid, uuid) from public, anon, authenticated;
grant execute on function public.decide_leave(uuid, text, uuid, text, text) to service_role;
grant execute on function public.cancel_leave(uuid, uuid) to service_role;
