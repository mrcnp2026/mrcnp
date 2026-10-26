// 출퇴근 장소(GPS)·지점 연결 읽기. 서버 전용.
import 'server-only';
import { cache } from 'react';
import { OFFICE } from '@/config/office';
import { FREE_PLACE_GROUP } from '@/lib/punch-requests';
import { loadTemplateOf } from '@/lib/shift-data';
import { allowedLocations, type OfficeLocation } from '@/lib/geo';
import { readAll } from '@/lib/read-all';
import { createAdminClient } from '@/lib/supabase/admin';

// 한 화면(요청) 안에서는 한 번만 읽는다 — 같은 화면이 여러 번 부르던 것 (2026-10-19 속도). 받는 쪽이 고쳐 써도 되게 복사본을 돌려준다
export async function loadOfficeLocations(includeOff = false): Promise<OfficeLocation[]> {
  return [...(await locationsOnce(includeOff))];
}
const locationsOnce = cache(async (includeOff: boolean): Promise<OfficeLocation[]> => {
  let q = createAdminClient().from('office_locations').select('id, label, address, lat, lng, radius_m, active, anywhere').order('label').order('created_at');
  if (!includeOff) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`loadOfficeLocations: ${error.code}`);
  return (data ?? []).map((l) => ({ id: l.id, label: l.label, address: l.address, lat: Number(l.lat), lng: Number(l.lng), radiusM: l.radius_m, active: l.active, anywhere: !!l.anywhere }));
});

/** 지점 ↔ 장소 연결 전부 */
export async function loadGroupLocationLinks(): Promise<{ groupId: string; locationId: string }[]> {
  const { data, error } = await createAdminClient().from('group_locations').select('group_id, location_id');
  if (error) throw new Error(`loadGroupLocationLinks: ${error.code}`);
  return (data ?? []).map((k) => ({ groupId: k.group_id, locationId: k.location_id }));
}

/** 그 직원이 찍을 때 확인에 쓰는 장소들 — 소속 지점과 그 상위 지점에 붙인 장소 (없으면 켜진 장소 전체) */
export async function loadLocationsFor(employeeId: string): Promise<OfficeLocation[]> {
  const db = createAdminClient();
  const [locations, links, { data: me }] = await Promise.all([loadOfficeLocations(), loadGroupLocationLinks(), db.from('profiles').select('group_id').eq('id', employeeId).maybeSingle()]);
  const groupIds: string[] = [];
  if (me?.group_id) {
    // 소속 조직과 그 위의 모든 상위 조직 (최대 3단계)
    const { data: all } = await db.from('org_groups').select('id, parent_id');
    const parentOf = new Map((all ?? []).map((g) => [g.id as string, g.parent_id as string | null]));
    for (let id: string | null | undefined = me.group_id, n = 0; id && n < 4; n++) {
      groupIds.push(id);
      id = parentOf.get(id);
    }
  }
  return allowedLocations(locations, links, groupIds);
}

/**
 * 회사가 사무실로 인정하는 인터넷 주소 전부 + 그 직원 지점의 것인지 (2026-10-23 의뢰인: 지점마다 와이파이 · IP가 다르다).
 * 1지점 직원이 2지점에서 눌러도 막지 않는다 — 2지점 장소로 확인된 기록이 되어 「어느 장소에서 찍었는지」가 그대로 남는다(1지점 출근처럼 보이지 않게).
 * own = 그 직원 소속 지점에 연결된 장소(연결이 없으면 켜진 장소 전체)의 주소 · 장소를 정하지 않은 옛 공통 주소 · 열쇠 파일(OFFICE_CIDRS).
 */
export async function officeNetworksFor(employeeId: string): Promise<{ cidr: string; locationId: string | null; own: boolean }[]> {
  const ids = new Set((await loadLocationsFor(employeeId)).map((l) => l.id));
  const active = new Set((await loadOfficeLocations()).map((l) => l.id));
  const { data } = await readAll((a, b) => createAdminClient().from('office_networks').select('cidr, location_id').eq('active', true).order('id').range(a, b));
  return [
    ...(data ?? []).filter((r) => !r.location_id || active.has(r.location_id as string)).map((r) => ({ cidr: String(r.cidr), locationId: (r.location_id as string | null) ?? null, own: !r.location_id || ids.has(r.location_id as string) })),
    ...OFFICE.allowedCidrs.map((c) => ({ cidr: c, locationId: null, own: true })),
  ];
}
export async function officeCidrsFor(employeeId: string): Promise<string[]> {
  return (await officeNetworksFor(employeeId)).filter((n) => n.own).map((n) => n.cidr); // 자기 지점 것만 — 다른 지점 와이파이는 일반 출근으로 보지 않는다
}

/**
 * 출근할 때 장소를 따지지 않는 사람인가 (2026-10-23 의뢰인): 최고관리자 · 「영업부」(하위 팀 포함) · 간주근무 일정인 사람.
 * 이들은 사무실 밖에서 찍어도 요청이 아니라 바로 기록된다 — 찍은 위치(GPS)는 출근 때 남긴다(관리자는 제외).
 */
export async function mayPunchAnywhere(me: { id: string; role: string }): Promise<boolean> {
  if (me.role === 'admin') return true;
  const db = createAdminClient();
  const [{ data: p }, { data: groups }, tpl] = await Promise.all([db.from('profiles').select('group_id').eq('id', me.id).maybeSingle(), db.from('org_groups').select('id, name, parent_id'), loadTemplateOf(me.id)]);
  if (tpl?.kind === 'deemed') return true;
  const byId = new Map((groups ?? []).map((g) => [g.id as string, g]));
  for (let id = p?.group_id as string | null | undefined, n = 0; id && n < 6; n++) {
    const g = byId.get(id);
    if (!g) break;
    if (String(g.name).trim() === FREE_PLACE_GROUP) return true;
    id = g.parent_id as string | null;
  }
  return false;
}
