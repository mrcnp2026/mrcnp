-- 20261010000021_places.sql
-- 지점 + 출퇴근 장소 (의뢰인 2026-10-10: 시프티 화면 기준. 공장 3곳 + 거래처·외근지, 좌표 반경 80m, 지점 하나에 장소 여러 곳).
--   · office_locations.address : 근무지 주소 (화면에 보이는 글자. 판정은 좌표로만 한다)
--   · org_groups.memo          : 지점 메모 (주소 등)
--   · group_locations          : 지점 ↔ 출퇴근 장소 (여러 대 여러). 지점에 붙인 장소가 있으면 그 지점 직원은 그 장소들에서만 확인된다.
--                                붙인 장소가 하나도 없는 지점은 켜진 장소 전체를 쓴다 (설정 전에도 지금처럼 돌아가게).
--   · punch_events.location_id : 어느 장소로 확인됐는가 (출근 장소 / 퇴근 장소 표시용). GPS로 확인됐을 때만 값이 있다
--   · record_punch             : 장소를 받는 새 모양을 **추가**한다. 예전 모양(14개 인자)은 그대로 둔다 — 배포 전 코드가 계속 부른다
--
-- 되돌리는 방법: drop function public.record_punch(uuid, text, timestamptz, text, inet, boolean, text, boolean, uuid, int, int, numeric, numeric, text, uuid);
--   alter table public.punch_events drop column location_id; drop table public.group_locations;
--   alter table public.org_groups drop column memo; alter table public.office_locations drop column address;
--   ⚠️ 입력한 주소·메모·지점별 장소·기록의 장소 표시가 사라진다 (출퇴근 기록 자체는 남는다).

alter table public.office_locations
  add column address text check (address is null or char_length(address) <= 200);

alter table public.org_groups
  add column memo text check (memo is null or char_length(memo) <= 500);

create table public.group_locations (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.org_groups(id),
  location_id uuid not null references public.office_locations(id),
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (group_id, location_id)
);
create index on public.group_locations (location_id);
alter table public.group_locations enable row level security;
-- 직원 화면은 읽을 필요가 없다 (판정은 서버가 한다) → 관리자만. 쓰기는 서버(service_role)만
create policy group_locations_select on public.group_locations for select to authenticated using ((select private.is_admin()));
revoke insert, update, delete, truncate on public.group_locations from anon, authenticated;
revoke all on public.group_locations from anon;
-- 연결 줄은 떼면 지운다 (지점·장소 자체는 지우지 않는다). 붙이고 뗀 것은 변경 기록에 남는다
create trigger group_locations_audit after insert or update or delete on public.group_locations
  for each row execute function public.audit_row();

alter table public.punch_events
  add column location_id uuid references public.office_locations(id);

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
  -- 확인됐다고 하면서 수단이 없거나, 확인 안 됐는데 수단·좌표가 있으면 거절 (서버 코드 실수를 DB가 잡는다)
  if p_ip_verified is distinct from (p_verified_by is not null) or (p_verified_by is distinct from 'gps' and (p_geo_lat is not null or p_geo_lng is not null)) then
    raise exception 'invalid_verification' using errcode = 'P0001';
  end if;
  -- 장소는 GPS로 확인됐을 때만
  if p_location_id is not null and p_verified_by is distinct from 'gps' then
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
