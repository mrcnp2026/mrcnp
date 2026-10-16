// 내 개인 정보 넣기 · 고치기 (직원 본인) — 생년월일 · 비상연락처 · 자격증 · 차량 (묶음 17, 2026-10-16 의뢰인: 직원이 직접 넣는다).
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { saveStaffDetails } from '@/lib/staff-details';
import { cleanDetails } from '@/lib/staff-details-rules';
import { toKstDate } from '@/lib/time';

export const POST = api('me.details', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const v = cleanDetails(await readJson(req), toKstDate(new Date()));
  if ('error' in v) throw new ApiError(400, v.error);
  await saveStaffDetails(me.id, v, me.id);
  return Response.json({ ok: true });
});
