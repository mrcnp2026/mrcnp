-- 20261118000094_break_defaults.sql
-- 직원별 저녁 휴게 기본값 (결정 사항 급여-78, 2026-11-18 의뢰인: 노해균은 저녁 휴게 없이 일한다 — 날마다 승인하지 않게 한 번 설정).
--   「안 쉼」 판이 걸린 날은 회사 규칙의 17시 이후 휴게를 빼지 않는다(점심은 그대로). 계산은 period-data(waivedFor)가 한다.
--   판을 덧붙이기만 한다 — 그 날짜에는 시작일이 그날 이전인 판 가운데 가장 늦은 것(같으면 나중에 넣은 것)이 적용된다. 고치거나 지우지 않는다 (4-1).
--
-- 되돌리는 방법: drop table public.break_defaults;
--   ⚠️ 운영 뒤에는 되돌리지 말 것 (판이 사라지면 그 직원의 저녁 휴게가 다시 빠져 연장 · 지급액이 바뀐다). 앱 코드를 먼저 예전으로 돌려야 한다.

create table public.break_defaults (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id),
  valid_from    date not null,
  skip_evening  boolean not null,                   -- true = 저녁 휴게 안 쉼
  reason        text not null check (char_length(btrim(reason)) between 1 and 200),
  is_test       boolean not null default true,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index on public.break_defaults (employee_id, valid_from);

alter table public.break_defaults enable row level security;
create policy break_defaults_select on public.break_defaults for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.break_defaults from anon, authenticated;
revoke all on public.break_defaults from anon;
-- 넣은 판은 고정 — 바꾸려면 새 판을 넣는다
create trigger break_defaults_no_change before update or delete on public.break_defaults
  for each row execute function public.forbid_change();
create trigger break_defaults_no_truncate before truncate on public.break_defaults
  for each statement execute function public.forbid_change();
create trigger break_defaults_audit after insert or update or delete on public.break_defaults
  for each row execute function public.audit_row();
