-- 20261029000082_access_log_certificates.sql — 묶음 40 (2026-10-29 의뢰인: 제품화 1차 — 9-5 로그 조회 · 9-3 제증명)
-- 1) login_events: 로그인 성공 · 실패 기록. 지금 login_attempts는 실패만 하루 남기는 막기 용도라, 「누가 언제 어디서 들어왔나」를 볼 수 없었다.
--    개인정보 안전성 확보조치 기준의 접속 기록 — 보관 2년(결정 운영-3 임시). 고치지 못하고, 2년이 지난 줄만 지울 수 있다(파기 9-8).
-- 2) certificate_issues: 재직 · 경력 · 퇴직증명서 발급 대장. 직원 신청 → 관리자 발급(또는 관리자가 바로 발급). 발급번호로 진위를 확인한다.
--    찍은 내용(snapshot)을 그대로 남겨, 나중에 인사 정보가 바뀌어도 그때 무엇을 증명했는지 알 수 있다. 지우지 않는다.
-- 표는 서버 열쇠로만 연다(브라우저 세션 권한 없음).
-- 되돌리기: drop table public.login_events; drop table public.certificate_issues; drop function public.login_events_guard(); drop function public.certificate_issues_guard();

create table public.login_events (
  id          bigserial primary key,
  employee_id uuid references public.profiles(id),                                   -- 알 수 없는 아이디로 실패하면 비어 있다
  login_key   text check (login_key is null or login_key ~ '^[0-9a-f]{64}$'),          -- 입력한 아이디의 지문값(원문은 남기지 않는다)
  method      text not null check (method in ('PASSWORD', 'PASSKEY')),
  result      text not null check (result in ('OK', 'FAIL', 'THROTTLED')),
  client_ip   text check (client_ip is null or char_length(client_ip) <= 64),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index login_events_by_time on public.login_events (created_at desc);
create index login_events_by_employee on public.login_events (employee_id, created_at desc);
alter table public.login_events enable row level security;
revoke all on public.login_events from anon, authenticated;

-- 고치기는 막고, 지우기는 2년이 지난 줄만
create function public.login_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'login_events_immutable' using errcode = 'P0001';
  end if;
  if old.created_at > now() - interval '2 years' then
    raise exception 'login_events_keep_2y' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
create trigger login_events_guard before update or delete on public.login_events
  for each row execute function public.login_events_guard();
create trigger login_events_no_truncate before truncate on public.login_events
  for each statement execute function public.forbid_change();

create table public.certificate_issues (
  id            uuid primary key default gen_random_uuid(),
  serial        text unique check (serial is null or serial ~ '^[0-9]{4}-[0-9]{4,6}$'),  -- 발급번호 (예: 2026-0001). 발급할 때 붙는다
  employee_id   uuid not null references public.profiles(id),
  kind          text not null check (kind in ('EMPLOYMENT', 'CAREER', 'RETIREMENT')),      -- 재직 · 경력 · 퇴직
  purpose       text not null check (char_length(btrim(purpose)) between 1 and 100),     -- 용도 (예: 은행 제출)
  copies        int not null default 1 check (copies between 1 and 5),
  state         text not null default 'REQUESTED' check (state in ('REQUESTED', 'ISSUED', 'REJECTED')),
  requested_by  uuid not null references public.profiles(id),
  issued_by     uuid references public.profiles(id),
  issued_at     timestamptz,
  snapshot      jsonb check (snapshot is null or jsonb_typeof(snapshot) = 'object'),       -- 증명서에 찍은 내용 그대로
  reject_reason text check (reject_reason is null or char_length(btrim(reject_reason)) between 2 and 200),
  is_test       boolean not null default false,
  created_at    timestamptz not null default now(),
  check ((state = 'ISSUED') = (serial is not null and issued_by is not null and issued_at is not null and snapshot is not null)),
  check ((state = 'REJECTED') = (reject_reason is not null))
);
create index certificate_issues_by_employee on public.certificate_issues (employee_id, created_at desc);
create index certificate_issues_open on public.certificate_issues (state, created_at desc) where state = 'REQUESTED';
alter table public.certificate_issues enable row level security;
revoke all on public.certificate_issues from anon, authenticated;

-- 신청 중일 때만 발급 · 반려로 한 번 바뀐다. 그 뒤로는 고치지 못하고, 지우지 못한다
create function public.certificate_issues_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'certificate_issues_no_delete' using errcode = 'P0001';
  end if;
  if old.state <> 'REQUESTED' then
    raise exception 'certificate_issued' using errcode = 'P0001';
  end if;
  if new.employee_id is distinct from old.employee_id or new.kind is distinct from old.kind or new.purpose is distinct from old.purpose
     or new.copies is distinct from old.copies or new.requested_by is distinct from old.requested_by or new.created_at is distinct from old.created_at
     or new.is_test is distinct from old.is_test then
    raise exception 'certificate_issues_fixed_columns' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger certificate_issues_guard before update or delete on public.certificate_issues
  for each row execute function public.certificate_issues_guard();
create trigger certificate_issues_no_truncate before truncate on public.certificate_issues
  for each statement execute function public.forbid_change();
create trigger certificate_issues_audit after insert or update on public.certificate_issues
  for each row execute function public.audit_row();
