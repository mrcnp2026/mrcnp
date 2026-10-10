-- 20261011000026_punch_requests.sql
-- 반경 밖 「출근/퇴근 요청」 (의뢰인 2026-10-10 확정: "반경 밖은 시프티 방식으로").
--   사무실 인터넷도 아니고 출퇴근 장소 반경 안도 아닌 곳에서 찍으면 기록(punch_events)이 아니라 요청이 된다.
--   관리자가 승인하면 요청한 시각으로 기록이 만들어지고(event_id), 거절하면 기록이 생기지 않는다.
-- ⚠️ 이전 규칙(4-3: "사무실 밖이어도 기록은 남긴다")을 의뢰인 결정으로 바꾼 것이다.
--   예외: 출퇴근 장소·사무실 인터넷이 하나도 등록되지 않은 회사, 그날 승인된 외근·출장·재택이 있는 직원은 예전처럼 바로 기록된다.
-- 좌표는 저장하지 않는다 — 가장 가까운 출퇴근 장소까지의 거리(m)와 확인하지 못한 이유만 남긴다.
--
-- 되돌리는 방법: drop table public.punch_requests; decision_log.subject_table 검사를 0012의 목록으로 되돌린다.
--   ⚠️ 운영 뒤에는 되돌리지 말 것 (대기 중인 요청이 사라진다). 앱 코드(api/punch)를 먼저 예전 방식으로 돌려야 한다.

create table public.punch_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  kind         text not null check (kind in ('in','out')),
  requested_at timestamptz not null default now(),   -- 서버가 정한 시각. 승인하면 이 시각으로 기록된다
  work_date    date not null,                        -- 요청한 날 (한국 날짜) — 목록·월 잠금 확인용
  client_ip    inet,
  nearest_m    int check (nearest_m is null or nearest_m >= 0),   -- 가장 가까운 출퇴근 장소까지 (위치를 받았을 때만)
  geo_reason   text not null check (geo_reason in ('outside','no_fix','low_accuracy','no_office','no_consent')),
  passkey_id   uuid,
  status       text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approved_by  uuid references public.profiles(id),
  decided_at   timestamptz,
  event_id     uuid references public.punch_events(id),   -- 승인으로 만들어진 기록
  is_test      boolean not null default true,
  created_at   timestamptz not null default now()
);
create index on public.punch_requests (employee_id, work_date);
create index on public.punch_requests (status) where status = 'pending';

alter table public.punch_requests enable row level security;
create policy punch_requests_select on public.punch_requests for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.punch_requests from anon, authenticated;
revoke all on public.punch_requests from anon;
-- 요청 내용(사실)은 고정, 결정 칸만 바뀐다. 삭제 금지 (4-1)
create trigger punch_requests_guard before update or delete on public.punch_requests
  for each row execute function public.guard_columns('status', 'approved_by', 'decided_at', 'event_id');
create trigger punch_requests_no_truncate before truncate on public.punch_requests
  for each statement execute function public.forbid_change();
create trigger punch_requests_audit after insert or update or delete on public.punch_requests
  for each row execute function public.audit_row();

alter table public.decision_log drop constraint decision_log_subject_table_check;
alter table public.decision_log add constraint decision_log_subject_table_check
  check (subject_table in ('overtime_requests', 'punch_corrections', 'leave_requests', 'work_requests', 'punch_requests'));
