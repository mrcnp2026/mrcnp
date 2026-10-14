-- 20261014000040_console_pin.sql
-- 통합설정 잠금 숫자(4자리) — 관리자라도 통합설정을 열 때마다 미리 등록한 숫자 4자리를 넣어야 들어간다 (2026-10-14 의뢰인, 결정 사항 개발-29).
-- ★ 운영 적용은 의뢰인이 변경 목록을 보고 승인한 뒤에만 한다 (`DB 변경 목록 — 묶음 7 (통합설정 잠금 숫자).md`).
-- ★ 새 표 2개만 만든다. 기존 표는 고치지 않는다. 적용 직후에는 아무것도 달라지지 않는다(빈 표 — 잠금은 화면 배포와 함께 켜진다).
-- ★ 숫자 자체는 저장하지 않는다. 한 방향으로만 바꾼 값(scrypt + 사람마다 다른 소금)만 저장한다. 관리자도 다른 사람의 숫자를 볼 수 없다.
-- ★ 브라우저에서 직접 읽지 못한다(정책 없음 = 전부 거부). 서버만 읽고 쓴다.
--
-- 되돌리는 방법: drop table public.console_pin_attempts; drop table public.console_pins;

-- 1. 관리자마다 하나 — 숫자를 한 방향으로 바꾼 값, 연속 실패 횟수, 잠긴 시각
create table public.console_pins (
  employee_id  uuid primary key references public.profiles(id),
  pin_hash     text not null check (char_length(pin_hash) between 20 and 300),   -- scrypt$소금$값 (숫자 원문은 어디에도 남지 않는다)
  failed_count int not null default 0 check (failed_count between 0 and 100),
  locked_until timestamptz,                                                      -- 5번 연속 틀리면 15분 잠김
  set_at       timestamptz not null default now(),
  set_by       uuid not null references public.profiles(id),                    -- 본인이 정했는지, 다른 관리자가 지웠다 다시 정하게 했는지
  updated_at   timestamptz not null default now()
);

-- 2. 열기 시도 기록 — 누가 언제 통합설정을 열었고 틀렸는지 (숫자는 남기지 않는다). 고치지 않는다
create table public.console_pin_attempts (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  ok          boolean not null,
  kind        text not null check (kind in ('open', 'set', 'reset')),          -- 열기 · 처음 정하기/바꾸기 · 다른 관리자가 지움
  actor_id    uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index on public.console_pin_attempts (employee_id, created_at desc);

alter table public.console_pins enable row level security;
alter table public.console_pin_attempts enable row level security;
-- 정책을 만들지 않는다 = 브라우저 요청은 전부 거부. 서버(service role)만 쓴다

-- 시도 기록은 고치거나 지우지 못한다
create or replace function public.console_pin_attempts_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'console_pin_attempts is append-only' using errcode = 'PX010';
end $$;
create trigger console_pin_attempts_no_change before update or delete on public.console_pin_attempts
  for each row execute function public.console_pin_attempts_immutable();
