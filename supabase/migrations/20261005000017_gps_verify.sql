-- 20261005000017_gps_verify.sql
-- GPS로 사무실 확인 (의뢰인 2026-10-05). 사무실 인터넷 주소 확인에 **더하는** 보조 수단이다 (4-2: 기본 꺼짐 — 사무실 위치를 등록해야 켜진다).
--   · office_locations: 사무실 좌표 + 반경. 여러 곳 등록 가능, 끄기만 하고 지우지 않는다
--   · punch_events.verified_by: 무엇으로 사무실을 확인했는가 ('ip' | 'gps'). 확인 못 했으면 null
--     ip_verified 칸은 그대로 "사무실로 확인됨" 뜻으로 쓴다 (화면·집계가 모두 이 칸을 읽는다)
--   · record_punch: 좌표·확인 수단을 받는 새 모양을 **추가**한다. 예전 모양(11개 인자)은 그대로 둔다 — 배포 전 코드가 계속 부른다
-- ★ 좌표는 사무실 반경 안으로 확인됐을 때만 저장한다 (서버가 판단해서 넘긴다). 사무실 밖 위치는 저장하지 않는다 — 집 등 사생활 위치가 남지 않게.
--
-- 되돌리는 방법: drop function public.record_punch(uuid, text, timestamptz, text, inet, boolean, text, boolean, uuid, int, int, numeric, numeric, text);
--   drop table public.office_locations; alter table public.punch_events drop column verified_by;
--   ⚠️ 등록한 사무실 위치와 확인 수단 표시가 사라진다 (출퇴근 기록 자체는 남는다).

create table public.office_locations (
  id         uuid primary key default gen_random_uuid(),
  label      text check (label is null or char_length(label) <= 40),
  lat        numeric(9,6) not null check (lat between -90 and 90),
  lng        numeric(9,6) not null check (lng between -180 and 180),
  radius_m   int not null check (radius_m between 30 and 1000),
  active     boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.office_locations enable row level security;
-- 직원 화면은 좌표를 읽을 필요가 없다 (판정은 서버가 한다) → 관리자만
create policy office_locations_select on public.office_locations for select to authenticated using ((select private.is_admin()));
revoke insert, update, delete, truncate on public.office_locations from anon, authenticated;
revoke all on public.office_locations from anon;
create trigger office_locations_no_delete before delete on public.office_locations
  for each row execute function public.guard_columns();
create trigger office_locations_audit after insert or update or delete on public.office_locations
  for each row execute function public.audit_row();

alter table public.punch_events
  add column verified_by text check (verified_by is null or verified_by in ('ip', 'gps'));
comment on column public.punch_events.ip_verified is '사무실로 확인됨 (인터넷 주소 또는 GPS). 수단은 verified_by';

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
  p_open_shift_max_hours int,
  p_geo_lat              numeric,
  p_geo_lng              numeric,
  p_verified_by          text
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
  -- 확인됐다고 하면서 수단이 없거나, 확인 안 됐는데 수단·좌표가 있으면 거절 (서버 코드 실수를 DB가 잡는다)
  if p_ip_verified is distinct from (p_verified_by is not null) or (p_verified_by is distinct from 'gps' and (p_geo_lat is not null or p_geo_lng is not null)) then
    raise exception 'invalid_verification' using errcode = 'P0001';
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
                                   is_test, note, passkey_id, geo_lat, geo_lng, verified_by)
  values (p_employee_id, p_kind, p_now, v_date, p_source, p_client_ip, p_ip_verified,
          p_is_test, v_note, p_passkey_id, p_geo_lat, p_geo_lng, p_verified_by)
  returning id into v_id;

  return query select v_id, false;
end;
$$;
revoke execute on function public.record_punch(uuid, text, timestamptz, text, inet, boolean, text, boolean, uuid, int, int, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.record_punch(uuid, text, timestamptz, text, inet, boolean, text, boolean, uuid, int, int, numeric, numeric, text)
  to service_role;
