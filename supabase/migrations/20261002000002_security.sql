-- 20261002000002_security.sql
-- 권한 잠금 — 마스터 6장 "권한 잠금(RLS)" + 1.3판 "기록을 쓰는 것은 서버뿐" + 4-1 기록 불변
--
-- 세 겹으로 막는다:
--   1) RLS: 브라우저 로그인 세션은 select 정책만 있다. insert/update/delete 정책은 하나도 만들지 않는다.
--   2) 권한(grant): anon·authenticated에서 쓰기 권한 자체를 회수한다. 정책을 실수로 추가해도 쓰기는 안 된다.
--   3) 트리거: 서버(service_role)도 punch_events를 고치거나 지우지 못한다. 다른 표는 "사실 칸"을 못 바꾼다.
--      service_role은 RLS를 건너뛰므로 4-1을 DB에서 강제하는 마지막 장치가 트리거다.
--      ⚠️ 이 트리거를 "잠깐" 끄지 마라 (부록 R-12-0). 틀린 기록은 정정 레코드로 푼다.
--
-- 되돌리는 방법: 정책·트리거·함수를 drop하고 grant를 되돌린다. 데이터는 사라지지 않지만,
--   되돌린 동안 기록 보호가 없어진다 — 되돌리지 말고 새 마이그레이션으로 고친다.

-- ─────────────────────────────────────────────
-- 1) RLS 켜기 — 전 테이블
-- ─────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.work_rules        enable row level security;
alter table public.user_passkeys     enable row level security;
alter table public.punch_events      enable row level security;
alter table public.punch_corrections enable row level security;
alter table public.office_networks   enable row level security;
alter table public.holidays          enable row level security;
alter table public.overtime_requests enable row level security;

-- 관리자인가 — 정책 안에서 profiles를 다시 읽으면 profiles 정책이 자기 자신을 부르므로 security definer로 우회
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.active
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- 읽기 정책만 만든다. 직원은 자기 것만, 관리자는 전체.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy punch_events_select on public.punch_events
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.is_admin()));

create policy punch_corrections_select on public.punch_corrections
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.is_admin()));

create policy overtime_requests_select on public.overtime_requests
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.is_admin()));

create policy user_passkeys_select on public.user_passkeys
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.is_admin()));

-- 설정 표: 로그인한 사람은 읽기만
create policy work_rules_select      on public.work_rules      for select to authenticated using (true);
create policy office_networks_select on public.office_networks for select to authenticated using (true);
create policy holidays_select        on public.holidays        for select to authenticated using (true);

-- ⚠️ 마스터 6장 표는 profiles·설정 표에 "관리자: 전체"라고 적었지만 쓰기 정책은 만들지 않는다.
--   이유: profiles에 관리자 update 정책을 주면 관리자가 자기 can_view_payroll을 직접 켤 수 있다 (부록 R-2의 7 위반).
--   RLS는 "어느 행"만 막고 "어느 칸"은 못 막는다 (6장 1.3판 경고). 관리자 쓰기도 서버 API로만 한다.

-- ─────────────────────────────────────────────
-- 2) 쓰기 권한 회수 — 브라우저(anon·authenticated)는 public 스키마에 아무것도 쓰지 못한다
-- ─────────────────────────────────────────────
revoke all    on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant  select on all tables in schema public to authenticated;

-- 앞으로 만드는 표도 같은 기본값 (새 표를 만들 때 권한이 슬쩍 열리는 사고 방지 — R-12-6)
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from authenticated;

-- ─────────────────────────────────────────────
-- 3) 트리거 — 서버도 못 넘는 선
-- ─────────────────────────────────────────────

-- punch_events: 어떤 경우에도 update·delete·truncate 금지 (4-1)
create or replace function public.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%: % is not allowed — records are append-only (4-1). Use a correction record.',
    tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

create trigger punch_events_no_update   before update   on public.punch_events for each row       execute function public.forbid_change();
create trigger punch_events_no_delete   before delete   on public.punch_events for each row       execute function public.forbid_change();
create trigger punch_events_no_truncate before truncate on public.punch_events for each statement execute function public.forbid_change();

-- 다른 표: 삭제 금지 + 트리거 인자로 받은 칸만 바꿀 수 있다 (나머지는 "사실 칸")
create or replace function public.guard_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := coalesce(tg_argv, '{}'::text[]);
begin
  if tg_op = 'DELETE' then
    raise exception '%: DELETE is not allowed (4-1). Use active=false / revoked_at / a new record.', tg_table_name
      using errcode = '42501';
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception '%: only % may change', tg_table_name, allowed
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 정정: 요청 내용(사실)은 고정, 결정 칸만 바뀐다
create trigger punch_corrections_guard before update or delete on public.punch_corrections
  for each row execute function public.guard_columns('status', 'approved_by', 'decided_at');
create trigger punch_corrections_no_truncate before truncate on public.punch_corrections
  for each statement execute function public.forbid_change();

-- 연장: 집계된 분(사실)은 아무도 못 고친다. 사유·결정·인정분만 바뀐다 (6장 주석)
create trigger overtime_requests_guard before update or delete on public.overtime_requests
  for each row execute function public.guard_columns(
    'reason', 'status', 'approved_by', 'approved_minutes',
    'approved_night_minutes', 'approved_holiday_minutes', 'decided_at');
create trigger overtime_requests_no_truncate before truncate on public.overtime_requests
  for each statement execute function public.forbid_change();

-- 패스키: 지우지 않고 해제 시각만 남긴다. 사용 기록 칸만 바뀐다
create trigger user_passkeys_guard before update or delete on public.user_passkeys
  for each row execute function public.guard_columns('sign_count', 'last_used_at', 'revoked_at', 'revoked_by', 'device_label');

-- 직원: 지우지 않는다 (on delete restrict와 같은 이유). 칸 변경은 서버 API가 판단한다
create trigger profiles_no_delete before delete on public.profiles
  for each row execute function public.guard_columns();
