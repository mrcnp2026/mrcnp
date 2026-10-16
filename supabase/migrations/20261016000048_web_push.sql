-- 20261016000048_web_push.sql — 묶음 15 (의뢰인 2026-10-16: 폰 알림은 무료 웹 푸시로 — 휴가 신청 · 미출근자 · 정정 요청)
-- 관리자가 폰에서 「폰 알림 받기」를 누르면 그 폰(브라우저)의 받는 주소가 여기 저장된다. 한 사람이 폰 · PC 여러 대를 둘 수 있다.
-- 앱 서버(관리자 열쇠)만 읽고 쓴다 — 화면 쪽 로그인 열쇠로는 읽을 수 없다.
--   · push_subscriptions: 받는 주소. 보내기가 「없는 주소」(404 · 410)로 실패하면 앱이 지운다.
--   · push_sent: 같은 알림을 두 번 보내지 않게 하는 표시 (예: absent:직원:2026-10-16 = 그날 미출근 알림은 한 번). 30일 지나면 앱이 지운다.
-- 되돌리기: drop table public.push_sent; drop table public.push_subscriptions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  device text check (device is null or char_length(device) <= 200),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  fail_count int not null default 0
);
create index on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table public.push_sent (
  key text primary key check (char_length(key) <= 200),
  sent_at timestamptz not null default now()
);
create index on public.push_sent (sent_at);

alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;
