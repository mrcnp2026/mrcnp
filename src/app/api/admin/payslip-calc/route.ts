// 명세서 산출방식 켜기 · 끄기 (2026-10-30 의뢰인) — 관리자만. { on }. 회사 정보 이력에 누가 언제 바꿨는지 남는다
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { putSlipCalc } from '@/lib/switches';

export const POST = api('admin.payslipCalc', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (typeof b.on !== 'boolean') throw new ApiError(400, 'invalid_input');
  await putSlipCalc(b.on, me.id);
  return { ok: true };
});
