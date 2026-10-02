-- 20261002000005_record_punch_work_notes.sql
-- 게이트 4: 출퇴근 기록 DB 함수(직원 단위 잠금 + 60초 중복 방지 + 근무일 결정) · 근무노트 표 (부록 R-10-2).
--
-- 되돌리는 방법: drop function public.record_punch(...); drop table public.work_notes;
--   ⚠️ 근무노트 내용이 사라진다. 운영 뒤에는 되돌리지 말고 새 마이그레이션으로 고친다 (R-12-6).

-- ─────────────────────────────────────────────
-- 출퇴근 기록 — 서버(service_role)만 부른다. 시각·근무일·검증 여부는 서버가 정해서 넘긴다 (7-4 요점 4)
--
-- 부록 R-4: "조회 → 없으면 삽입"을 따로 하면 동시에 온 두 요청이 둘 다 "없다"를 보고 둘 다 넣는다.
--   그래서 직원 단위 잠금(pg_advisory_xact_lock) 안에서 조회와 삽입을 한 번에 한다. 앱 코드의 if로 막지 않는다.
-- 7-4 요점 1: 같은 직원·같은 kind가 직전 60초 안에 있으면 새로 만들지 않고 그 기록을 돌려준다 (deduped).
-- 6장 work_date 규칙:
--   출근: p_now의 사무실 날짜 (시간대는 서버 설정 office.ts에서 받는다 — 4-5)
--   퇴근: 짝 없는 직전 출근의 work_date를 상속 (자정 넘긴 야근, B-4).
--         단, 그 출근이 p_open_shift_max_hours보다 오래됐으면 상속하지 않고 '짝 없는 퇴근' (며칠 전 출근에 붙지 않게)
-- 7-4 요점 2: 같은 근무일에 출근이 이미 있으면 막지 않고 note에 '중복 출근'
-- 연습/운영 기록은 서로 짝짓지 않는다 (is_test가 같은 기록끼리만)
-- ─────────────────────────────────────────────
create or replace function public.record_punch(
  p_employee_id          uuid,
  p_kind                 text,
  p_now                  timestamptz,
  p_timezone             text,
  p_client_ip            inet,
  p_ip_verified          boolean,
  p_source               text,
  p_is_test              boolean,
  p_passkey_id           uuid,
  p_dedupe_seconds       int,
  p_open_shift_max_hours int
)
returns table (event_id uuid, deduped boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_last     public.punch_events%rowtype;
  v_date     date;
  v_note     text := null;
  v_id       uuid;
begin
  if p_kind not in ('in', 'out') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('punch:' || p_employee_id::text));

  select e.id into v_existing
    from public.punch_events e
   where e.employee_id = p_employee_id and e.kind = p_kind and e.is_test = p_is_test
     and e.punched_at > p_now - make_interval(secs => p_dedupe_seconds)
     and e.punched_at <= p_now
   order by e.punched_at desc
   limit 1;
  if found then
    return query select v_existing, true;
    return;
  end if;

  select * into v_last
    from public.punch_events e
   where e.employee_id = p_employee_id and e.is_test = p_is_test and e.punched_at <= p_now
   order by e.punched_at desc
   limit 1;

  if p_kind = 'out' then
    if v_last.id is not null and v_last.kind = 'in'
       and v_last.punched_at > p_now - make_interval(hours => p_open_shift_max_hours) then
      v_date := v_last.work_date;
    else
      v_date := (p_now at time zone p_timezone)::date;
      v_note := '짝 없는 퇴근';
    end if;
  else
    v_date := (p_now at time zone p_timezone)::date;
    if exists (select 1 from public.punch_events e
                where e.employee_id = p_employee_id and e.is_test = p_is_test
                  and e.kind = 'in' and e.work_date = v_date) then
      v_note := '중복 출근';
    end if;
  end if;

  insert into public.punch_events (employee_id, kind, punched_at, work_date, source, client_ip, ip_verified,
                                   is_test, note, passkey_id)
  values (p_employee_id, p_kind, p_now, v_date, p_source, p_client_ip, p_ip_verified,
          p_is_test, v_note, p_passkey_id)
  returning id into v_id;

  return query select v_id, false;
end;
$$;
revoke execute on function public.record_punch(uuid, text, timestamptz, text, inet, boolean, text, boolean, uuid, int, int)
  from public, anon, authenticated;
grant execute on function public.record_punch(uuid, text, timestamptz, text, inet, boolean, text, boolean, uuid, int, int)
  to service_role;

-- ─────────────────────────────────────────────
-- 근무노트 (부록 R-10-2) — 직원이 남기는 짧은 메모. 판정에 쓰이지 않는다. 덧붙이기만 한다.
-- 고치면 새 행을 추가하고 supersedes로 이전 행을 가리킨다 (이전 행은 남는다)
-- ─────────────────────────────────────────────
create table public.work_notes (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  work_date   date not null,            -- 서버가 정한다 (요청 본문 무시)
  body        text not null check (char_length(body) between 1 and 200),
  supersedes  uuid references public.work_notes(id),
  is_test     boolean not null default true,    -- 연습 모드 (4-6)
  created_at  timestamptz not null default now()
);
create index on public.work_notes (employee_id, work_date, created_at desc);

alter table public.work_notes enable row level security;
create policy work_notes_select on public.work_notes
  for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.work_notes from anon, authenticated;
revoke all on public.work_notes from anon;

-- 서버도 고치거나 지우지 못한다 (4-1과 같은 이유 — 고치면 새 행)
create trigger work_notes_no_update   before update   on public.work_notes for each row       execute function public.forbid_change();
create trigger work_notes_no_delete   before delete   on public.work_notes for each row       execute function public.forbid_change();
create trigger work_notes_no_truncate before truncate on public.work_notes for each statement execute function public.forbid_change();
