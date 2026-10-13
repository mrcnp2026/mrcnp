// 연차 사용 계획 내기 (직원) — 통지받은 본인만. 계획을 낸다고 휴가가 신청되지는 않는다.
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { submitPlan } from '@/lib/leave-promotion';

export const POST = api<{ params: Promise<{ id: string }> }>('leave.promotion.plan', async (req, ctx) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, 'invalid_input');
  const b = await readJson(req);
  if (!Array.isArray(b.dates) || !b.dates.every((d) => typeof d === 'string')) throw new ApiError(400, 'promotion_plan_invalid');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) : '';
  await submitPlan({ targetId: id, me, dates: b.dates as string[], note: note || null });
  return { ok: true };
});
