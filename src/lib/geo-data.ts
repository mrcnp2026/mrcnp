// 사무실 위치(GPS) 읽기. 서버 전용.
import 'server-only';
import type { OfficeLocation } from '@/lib/geo';
import { createAdminClient } from '@/lib/supabase/admin';

export async function loadOfficeLocations(includeOff = false): Promise<OfficeLocation[]> {
  let q = createAdminClient().from('office_locations').select('id, label, lat, lng, radius_m, active').order('created_at');
  if (!includeOff) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`loadOfficeLocations: ${error.code}`);
  return (data ?? []).map((l) => ({ id: l.id, label: l.label, lat: Number(l.lat), lng: Number(l.lng), radiusM: l.radius_m, active: l.active }));
}
