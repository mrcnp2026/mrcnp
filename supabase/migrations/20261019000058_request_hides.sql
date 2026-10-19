-- 20261019000058_request_hides.sql — 묶음 25 (의뢰인 2026-10-19 승인)
-- 요청 목록에서 「지우기」 (2026-10-19 의뢰인: 요청이 많아지면 필요할 때 지울 수 있게).
-- 요청 기록(휴가 · 정정 · 외근 …)은 그대로 두고, 그 사람의 목록에서만 보이지 않게 한다 — 사람마다 따로(관리자 한 명이 지워도 다른 관리자 목록에는 남는다).
-- 처리가 끝난 요청만 지운다(대기 중인 것은 화면에서 막는다). 서버(관리자 열쇠)만 읽고 쓴다.
-- 되돌리기: drop table public.request_hides;

create table public.request_hides (
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  item_key   text not null check (item_key ~ '^[a-zA-Z]+:[0-9a-f-]{36}$'),
  hidden_at  timestamptz not null default now(),
  primary key (viewer_id, item_key)
);
alter table public.request_hides enable row level security;
revoke all on public.request_hides from anon, authenticated;
