// 출퇴근 장소(GPS)·지점 연결 읽기. 서버 전용.
import 'server-only';
import { allowedLocations, type OfficeLocation } from '@/lib/geo';
import { createAdminClient } from '@/lib/supabase/admin';

export async function loadOfficeLocations(includeOff = false): Promise<OfficeLocation[]> {
  let q = createAdminClient().from('office_locations').select('id, label, address, lat, lng, radius_m, active').order('label').order('created_at');
  if (!includeOff) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`loadOfficeLocations: ${error.code}`);
  return (data ?? []).map((l) => ({ id: l.id, label: l.label, address: l.address, lat: Number(l.lat), lng: Number(l.lng), radiusM: l.radius_m, active: l.active }));
}

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
    groupIds.push(me.group_id);
    const { data: g } = await db.from('org_groups').select('parent_id').eq('id', me.group_id).maybeSingle();
    if (g?.parent_id) groupIds.push(g.parent_id);
  }
  return allowedLocations(locations, links, groupIds);
}
