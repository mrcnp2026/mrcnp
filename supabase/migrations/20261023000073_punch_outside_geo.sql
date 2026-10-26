-- 20261023000073_punch_outside_geo.sql
-- 사무실 밖에서 출근할 때 찍은 위치(GPS)를 기록에 남긴다 (2026-10-23 의뢰인: 외부 출근은 출근 지점을 GPS로 남기고, 퇴근은 위치를 묻지 않는다).
--   record_punch: 확인되지 않은 기록(verified_by 없음)에도 좌표를 받을 수 있게 검사를 풀었다. 인터넷 주소('ip')로 확인된 기록에는 여전히 좌표를 두지 않는다. 장소(location_id)는 확인된 기록(GPS · 인터넷 주소)에 둘 수 있다.
-- 되돌리는 방법: 20261010000021_places.sql의 record_punch 정의를 다시 실행한다. 이미 남은 좌표는 그대로 남는다.
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
  p_verified_by          text,
  p_location_id          uuid
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
  -- 확인됐다고 하면서 수단이 없거나, 확인 안 됐는데 수단이 있거나, 인터넷 주소로 확인됐는데 좌표가 있으면 거절 (서버 코드 실수를 DB가 잡는다)
  -- 2026-10-23 의뢰인: 사무실 밖(외근 · 영업부 · 간주근무 · 최고관리자)에서 출근하면 찍은 위치를 남긴다 → 확인 안 된 기록에도 좌표를 둘 수 있다
  if p_ip_verified is distinct from (p_verified_by is not null) or (p_verified_by = 'ip' and (p_geo_lat is not null or p_geo_lng is not null)) then
    raise exception 'invalid_verification' using errcode = 'P0001';
  end if;
  -- 장소는 확인된 기록에만 (GPS 반경 안, 또는 그 장소에 등록한 인터넷 주소 — 2026-10-23: 다른 지점에서 찍은 것이 우리 지점 기록처럼 보이지 않게 어느 장소로 확인됐는지 남긴다)
  if p_location_id is not null and p_verified_by is null then
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
                                   is_test, note, passkey_id, geo_lat, geo_lng, verified_by, location_id)
  values (p_employee_id, p_kind, p_now, v_date, p_source, p_client_ip, p_ip_verified,
          p_is_test, v_note, p_passkey_id, p_geo_lat, p_geo_lng, p_verified_by, p_location_id)
  returning id into v_id;

  return query select v_id, false;
end;
$$;
revoke execute on function public.record_punch(uuid, text, timestamptz, text, inet, boolean, text, boolean, uuid, int, int, numeric, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_punch(uuid, text, timestamptz, text, inet, boolean, text, boolean, uuid, int, int, numeric, numeric, text, uuid)
  to service_role;
