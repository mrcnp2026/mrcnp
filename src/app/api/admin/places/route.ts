// 출퇴근 장소 만들기 (의뢰인 2026-10-10). 관리자만. 좌표 + 반경 + 이름·주소.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { cleanPlaceText, validateLocation } from '@/lib/geo';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('admin.places.create', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const v = validateLocation(b);
  if (!v) throw new ApiError(400, 'invalid_location');
  const label = cleanPlaceText(b.label, 40);
  const address = cleanPlaceText(b.address, 200);
  if (!label || address === undefined) throw new ApiError(400, 'invalid_place');
  const { data, error } = await createAdminClient()
    .from('office_locations')
    .insert({ label, address, lat: v.lat, lng: v.lng, radius_m: v.radiusM, created_by: me.id, updated_by: me.id })
    .select('id')
    .single();
  if (error) throw new Error(`places.create: ${error.code}`);
  return { id: data.id };
});
