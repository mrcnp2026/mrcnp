// 외국인 정보 고치기 (관리자만) — 국적 · 체류 자격 · 체류 기간 끝 · 국내 첫 근로일 (묶음 31, 2026-10-20 의뢰인).
// 보험 · 세금은 여기서 바꾸지 않는다 — 화면이 제안만 보이고, 담당자가 사원별 급여에서 정한다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { cleanForeign } from '@/lib/foreign-rules';
import { saveForeignInfo } from '@/lib/staff-details';
import { assertStaffTarget } from '@/lib/staff-data';
import { toKstDate } from '@/lib/time';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.foreign', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  await assertStaffTarget(me.id, id);
  const v = cleanForeign(await readJson(req), toKstDate(new Date()));
  if ('error' in v) throw new ApiError(400, v.error);
  await saveForeignInfo(id, v, me.id);
  return Response.json({ ok: true });
});
