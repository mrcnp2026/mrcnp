-- 20261013000038_work_messages_promotion.sql
-- 업무 메시지함 · 연차 사용 촉진 · 이상 기록 확인 표시 · 마감 다시 열기 요청 (PRD v1.3 35.1 · 35.2 · 37.3 · 37.4, 통합 개발 계획 M8 · M6의 남은 것).
-- ★ 운영 적용은 의뢰인이 변경 목록을 보고 승인한 뒤에만 한다 (`DB 변경 목록 — 묶음 5 (메시지 · 촉진).md`).
-- ★ 새 표 7개만 만든다. 기존 표는 고치지 않는다. 적용 직후에는 아무것도 달라지지 않는다(빈 표).
-- ★ 새 표는 브라우저에서 직접 읽지 못한다(정책 없음 = 전부 거부). 서버가 「보낸 사람 · 받는 사람 본인 · 관리자」인지 확인하고 읽고 쓴다.
-- ★ 메시지 본문 · 회신은 공용 변경 기록(audit_logs)에 넣지 않는다(내용이 그대로 복사되지 않게). 표 자체가 고칠 수 없는 기록이다.
-- ★ 외부 메신저(Slack 등) · 문자 · 메일 발송은 없다. 앱 안의 메시지함뿐이다.
--
-- 되돌리는 방법 (값을 넣기 전에만): 아래 표를 만든 반대 순서로 drop table.

-- 1. 업무 메시지 — 관리자 ↔ 직원의 근태 · 휴가 통지와 문의. 고치지 않는다(잘못 보냈으면 회신으로 바로잡는다)
create table public.work_messages (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('notice', 'inquiry', 'system')),      -- 통지 / 문의 / 프로그램이 만든 알림
  needs_reply boolean not null default false,                                     -- 답변이 필요한 통지인가 (단순 알림과 구분)
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 4000),
  related     jsonb not null default '{}'::jsonb,                                 -- 관련 업무 { type: leave | correction | anomaly | promotion | closing …, id, href }
  audience    jsonb not null default '{}'::jsonb,                                 -- 보낼 때 고른 대상 (전체 · 부서 · 개인) — 받는 사람은 아래 표에 고정된다
  sender_id   uuid references public.profiles(id),                                -- 프로그램 알림이면 비어 있다
  dedupe_key  text,                                                               -- 프로그램 알림을 다시 시도해도 한 번만
  is_test     boolean not null default false,
  created_at  timestamptz not null default now(),
  check (kind = 'system' or sender_id is not null)
);
create unique index work_messages_dedupe on public.work_messages (dedupe_key) where dedupe_key is not null;
create index on public.work_messages (sender_id, created_at desc);

-- 2. 받는 사람 — 보낼 때 고정한다(나중에 부서를 옮겨도 받은 사람은 바뀌지 않는다). 읽은 시각만 바뀐다
create table public.work_message_recipients (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.work_messages(id),
  employee_id uuid not null references public.profiles(id),
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (message_id, employee_id)
);
create index on public.work_message_recipients (employee_id, read_at);

-- 3. 회신 — 받은 사람과 보낸 사람(관리자)이 주고받는다. 고치지 않는다
create table public.work_message_replies (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.work_messages(id),
  author_id  uuid not null references public.profiles(id),
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.work_message_replies (message_id, created_at);

-- 4. 연차 사용 촉진 — 한 번의 촉진(대상 기준일 · 계획 제출 기한 · 안내문 판)
--    ★ 메시지를 읽었다는 것만으로 법적 촉진 완료나 미사용 수당 면제를 확정하지 않는다. 최종 처리는 관리자가 한다
create table public.leave_promotion_campaigns (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  basis_on       date not null,                                   -- 이 날 기준 잔여로 대상을 뽑는다
  plan_due_on    date not null check (plan_due_on >= basis_on),    -- 사용 계획 제출 기한
  notice_body    text not null check (char_length(notice_body) between 1 and 4000),   -- 직원에게 보낸 안내문 (보낸 뒤 고칠 수 없다)
  notice_version int not null default 1 check (notice_version >= 1),
  state          text not null default 'DRAFT' check (state in ('DRAFT', 'SENT', 'CLOSED')),
  policy_note    text check (policy_note is null or char_length(policy_note) <= 1000),   -- 통지 방식 · 기간 등 회사가 확인한 기준 (노무 확인 메모)
  is_test        boolean not null default false,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  sent_by        uuid references public.profiles(id),
  sent_at        timestamptz,
  closed_by      uuid references public.profiles(id),
  closed_at      timestamptz,
  check (state = 'DRAFT' or (sent_by is not null and sent_at is not null))
);

-- 5. 촉진 대상 — 직원마다 잔여 · 통지 · 계획 제출 · 관리자 처리. 계획은 고치면 판이 올라간다(앞 판은 history에 남긴다)
create table public.leave_promotion_targets (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.leave_promotion_campaigns(id),
  employee_id       uuid not null references public.profiles(id),
  remaining_minutes int not null check (remaining_minutes >= 0),     -- 기준일의 잔여 (대상을 뽑을 때 값)
  state             text not null default 'CANDIDATE' check (state in ('CANDIDATE', 'EXCLUDED', 'NOTIFIED', 'PLAN_SUBMITTED', 'CONFIRMED', 'EXCEPTION')),
  exclude_reason    text check (exclude_reason is null or char_length(exclude_reason) between 2 and 300),
  message_id        uuid references public.work_messages(id),        -- 보낸 통지
  notified_at       timestamptz,
  plan              jsonb,                                           -- 사용 계획 { dates: […], note }
  plan_version      int not null default 0 check (plan_version >= 0),
  plan_submitted_at timestamptz,
  plan_history      jsonb not null default '[]'::jsonb,              -- 앞서 낸 계획들
  decided_by        uuid references public.profiles(id),
  decided_at        timestamptz,
  decision_note     text check (decision_note is null or char_length(decision_note) <= 500),
  created_at        timestamptz not null default now(),
  unique (campaign_id, employee_id),
  check (state <> 'EXCLUDED' or exclude_reason is not null),
  check (state not in ('CONFIRMED', 'EXCEPTION') or (decided_by is not null and decided_at is not null))
);
create index on public.leave_promotion_targets (employee_id, state);

-- 6. 이상 기록 확인 표시 — 「확인만」 유형의 이상 기록을 담당자가 봤다는 표시(직원 × 날짜 × 연습/운영). 기록 자체를 고치는 것이 아니다
create table public.attendance_anomaly_reviews (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  work_date   date not null,
  is_test     boolean not null,
  types       text[] not null,                                      -- 확인할 때 보였던 이상 유형
  note        text check (note is null or char_length(note) <= 300),
  active      boolean not null default true,                        -- 확인을 거두면 끈다
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);
create unique index attendance_anomaly_reviews_one on public.attendance_anomaly_reviews (employee_id, work_date, is_test) where active;

-- 7. 마감 다시 열기 요청 — 다른 관리자가 있으면 그 관리자가 확인해야 열린다(권한 변경의 두 번째 관리자 확인과 같은 방식)
create table public.attendance_reopen_requests (
  id           uuid primary key default gen_random_uuid(),
  close_id     uuid not null references public.attendance_closes(id),
  reason       text not null check (char_length(btrim(reason)) between 2 and 500),
  requested_by uuid not null references public.profiles(id),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by   uuid references public.profiles(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  check (status <> 'approved' or (decided_by is not null and decided_by <> requested_by))   -- 확인하는 사람은 요청한 사람과 달라야 한다
);
create unique index attendance_reopen_one_pending on public.attendance_reopen_requests (close_id) where status = 'pending';

alter table public.work_messages               enable row level security;
alter table public.work_message_recipients     enable row level security;
alter table public.work_message_replies        enable row level security;
alter table public.leave_promotion_campaigns   enable row level security;
alter table public.leave_promotion_targets     enable row level security;
alter table public.attendance_anomaly_reviews  enable row level security;
alter table public.attendance_reopen_requests  enable row level security;
revoke all on public.work_messages, public.work_message_recipients, public.work_message_replies, public.leave_promotion_campaigns, public.leave_promotion_targets,
  public.attendance_anomaly_reviews, public.attendance_reopen_requests from anon, authenticated;

-- 지우지 않는다. 메시지 · 회신은 내용을 고칠 수 없고, 받는 사람은 읽은 시각만 바뀐다
create trigger work_messages_guard before update or delete on public.work_messages
  for each row execute function public.guard_columns();
create trigger work_message_recipients_guard before update or delete on public.work_message_recipients
  for each row execute function public.guard_columns('read_at');
create trigger work_message_replies_guard before update or delete on public.work_message_replies
  for each row execute function public.guard_columns();
create trigger leave_promotion_campaigns_guard before update or delete on public.leave_promotion_campaigns
  for each row execute function public.guard_columns('title', 'plan_due_on', 'notice_body', 'notice_version', 'state', 'policy_note', 'sent_by', 'sent_at', 'closed_by', 'closed_at');
create trigger leave_promotion_targets_guard before update or delete on public.leave_promotion_targets
  for each row execute function public.guard_columns('state', 'exclude_reason', 'message_id', 'notified_at', 'plan', 'plan_version', 'plan_submitted_at', 'plan_history', 'decided_by', 'decided_at', 'decision_note');
create trigger attendance_anomaly_reviews_guard before update or delete on public.attendance_anomaly_reviews
  for each row execute function public.guard_columns('active', 'updated_by');
create trigger attendance_reopen_requests_guard before update or delete on public.attendance_reopen_requests
  for each row execute function public.guard_columns('status', 'decided_by', 'decided_at');

-- 보낸 촉진의 안내문은 고칠 수 없다(직원이 받은 글과 기록이 달라지지 않게)
create or replace function public.leave_promotion_sent_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state <> 'DRAFT' and (new.notice_body is distinct from old.notice_body or new.notice_version is distinct from old.notice_version or new.title is distinct from old.title) then
    raise exception 'leave_promotion_campaigns: a sent campaign''s notice cannot change' using errcode = '42501';
  end if;
  if old.state = 'CLOSED' and new.state <> 'CLOSED' then
    raise exception 'leave_promotion_campaigns: a closed campaign cannot reopen' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger leave_promotion_campaigns_sent_lock before update on public.leave_promotion_campaigns
  for each row execute function public.leave_promotion_sent_lock();
revoke all on function public.leave_promotion_sent_lock() from public, anon, authenticated;

-- 누가 언제 바꿨는지 (본문이 없는 표만 공용 변경 기록에 남긴다)
create trigger leave_promotion_targets_audit after insert or update or delete on public.leave_promotion_targets
  for each row execute function public.audit_row();
create trigger attendance_anomaly_reviews_audit after insert or update or delete on public.attendance_anomaly_reviews
  for each row execute function public.audit_row();
create trigger attendance_reopen_requests_audit after insert or update or delete on public.attendance_reopen_requests
  for each row execute function public.audit_row();
