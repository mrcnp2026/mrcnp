// 직원 개인 정보 고치기 (관리자) — 생년월일 · 비상연락처 · 자격증 · 차량 (묶음 17). 직원이 넣은 것을 관리자도 고칠 수 있다(2026-10-16 의뢰인).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { saveStaffDetails } from '@/lib/staff-details';
import { cleanDetails } from '@/lib/staff-details-rules';
import { assertStaffTarget } from '@/lib/staff-data';
import { toKstDate } from '@/lib/time';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.details', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  await assertStaffTarget(me.id, id);
  const v = cleanDetails(await readJson(req), toKstDate(new Date()));
  if ('error' in v) throw new ApiError(400, v.error);
  await saveStaffDetails(id, v, me.id);
  return Response.json({ ok: true });
});
