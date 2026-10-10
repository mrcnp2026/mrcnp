// 출퇴근 장소 고치기: 이름·주소·좌표·반경 · 끄기/켜기. 지우지 않는다 (4-6) — 예전 기록이 그 장소를 가리킨다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { cleanPlaceText, validateLocation } from '@/lib/geo';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.places.update', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  const patch: Record<string, unknown> = { updated_by: me.id };
  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') throw new ApiError(400, 'invalid_input');
    patch.active = b.active;
  }
  if (b.lat !== undefined || b.lng !== undefined || b.radiusM !== undefined) {
    const v = validateLocation(b);
    if (!v) throw new ApiError(400, 'invalid_location');
    Object.assign(patch, { lat: v.lat, lng: v.lng, radius_m: v.radiusM });
  }
  if (b.label !== undefined) {
    const label = cleanPlaceText(b.label, 40);
    if (!label) throw new ApiError(400, 'invalid_place');
    patch.label = label;
  }
  if (b.address !== undefined) {
    const address = cleanPlaceText(b.address, 200);
    if (address === undefined) throw new ApiError(400, 'invalid_place');
    patch.address = address;
  }
  if (Object.keys(patch).length === 1) throw new ApiError(400, 'invalid_input');
  const { data, error } = await createAdminClient().from('office_locations').update(patch).eq('id', id).select('id');
  if (error) throw new Error(`places.update: ${error.code}`);
  if (!data?.length) throw new ApiError(404, 'not_found');
  return { ok: true };
});
