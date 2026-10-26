-- 20261026000079_inquiries.sql — 묶음 37 (2026-10-26 의뢰인 승인: 문의하기)
-- 직원이 앱 안에서 관리자에게, 관리자가 시스템관리자에게 묻고 답을 받는다. 지우지 않고, 답한 뒤에는 질문 · 답을 고치지 못한다.
-- 받는 곳(to_role): 직원 → 관리자들(ADMIN), 관리자 → 시스템관리자(SYSTEM). 누가 무엇을 볼지는 앱이 정한다(표는 서버 열쇠로만 열린다).
-- 되돌리기: drop table public.inquiries; drop function public.inquiries_answer_once();

create table public.inquiries (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id),                       -- 보낸 사람
  to_role       text not null check (to_role in ('ADMIN', 'SYSTEM')),
  space         text not null check (space in ('my', 'admin', 'console', 'other')), -- 큰 분류: 내 화면 / 관리자 화면 / 통합설정 / 그 밖
  topic         text check (topic is null or char_length(topic) <= 80),             -- 메뉴 열쇠 (예: console:aPay:payPaymentItems)
  title         text not null check (char_length(btrim(title)) between 2 and 100),
  body          text not null check (char_length(btrim(body)) between 2 and 2000),
  state         text not null default 'OPEN' check (state in ('OPEN', 'ANSWERED')),
  answer        text check (answer is null or char_length(btrim(answer)) between 1 and 2000),
  answered_by   uuid references public.profiles(id),
  answered_at   timestamptz,
  asker_seen_at timestamptz,                                                         -- 보낸 사람이 답을 열어 본 시각(아이콘 숫자)
  is_test       boolean not null default false,
  created_at    timestamptz not null default now(),
  check ((state = 'ANSWERED') = (answer is not null and answered_by is not null and answered_at is not null))
);
create index inquiries_by_asker on public.inquiries (employee_id, created_at desc);
create index inquiries_by_state on public.inquiries (state, to_role, created_at desc);

alter table public.inquiries enable row level security;
revoke all on public.inquiries from anon, authenticated;

-- 바뀔 수 있는 칸은 답 · 상태 · 본 시각뿐. 지우기와 비우기는 막는다
create trigger inquiries_guard before update or delete on public.inquiries
  for each row execute function public.guard_columns('state', 'answer', 'answered_by', 'answered_at', 'asker_seen_at');
create trigger inquiries_no_truncate before truncate on public.inquiries
  for each statement execute function public.forbid_change();

-- 한 번 답한 문의의 답은 다시 쓰지 못한다 (이력 보존)
create function public.inquiries_answer_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'ANSWERED' and (new.answer is distinct from old.answer or new.answered_by is distinct from old.answered_by or new.answered_at is distinct from old.answered_at or new.state is distinct from old.state) then
    raise exception 'inquiry_answered' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger inquiries_answer_once before update on public.inquiries
  for each row execute function public.inquiries_answer_once();

create trigger inquiries_audit after insert or update on public.inquiries
  for each row execute function public.audit_row();
