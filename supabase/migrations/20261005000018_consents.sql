-- 20261005000018_consents.sql
-- 개인정보·위치정보 수집 동의 기록 (의뢰인 2026-10-05: 로그인하면 동의 창이 뜨고, 동의해야 사라진다).
-- 동의는 덧붙이기만 한다 — 누가·언제·어느 판(version)의 안내문에 동의했는지가 증빙이다. 고치거나 지우지 못한다.
-- 안내문이 바뀌면 판을 올리고(src/config/consent.ts), 직원은 새 판에 다시 동의한다 (이전 판 동의 기록은 그대로 남는다).
--
-- 되돌리는 방법: drop table public.consents;  ⚠️ 동의 기록이 사라진다 — 운영 뒤에는 되돌리지 않는다 (R-12-6).

create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  kind        text not null check (kind in ('privacy_location')),
  version     text not null check (char_length(version) between 1 and 20),
  locale      text not null,            -- 동의할 때 본 화면 언어
  client_ip   inet,
  agreed_at   timestamptz not null default now(),
  unique (employee_id, kind, version)
);
create index on public.consents (employee_id);

alter table public.consents enable row level security;
create policy consents_select on public.consents for select to authenticated
  using ((employee_id = (select auth.uid()) and (select private.is_active())) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.consents from anon, authenticated;
revoke all on public.consents from anon;

create trigger consents_no_update   before update   on public.consents for each row       execute function public.forbid_change();
create trigger consents_no_delete   before delete   on public.consents for each row       execute function public.forbid_change();
create trigger consents_no_truncate before truncate on public.consents for each statement execute function public.forbid_change();
