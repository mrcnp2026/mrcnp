// 올린 급여명세서 회수 — 직원 「내 급여」에서 사라진다. 기록(금액 · 올린 사람 · 회수 사유)은 남는다. 급여 담당 관리자만, 사유 필수.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { requirePayroll } from '@/lib/payroll/data';
import { withdrawUploads } from '@/lib/payroll/slip-upload-data';
import { cleanReason } from '@/lib/staff-rules';

const UUID = /^[0-9a-f-]{36}$/i;

export const POST = api('admin.payroll.slips.withdraw', async (req, ctx) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : [];
  if (ids.length === 0 || ids.length > 1000) throw new ApiError(400, 'invalid_input');
  const reason = cleanReason(b.reason);
  if (!reason) throw new ApiError(400, 'reason_required');
  const n = await withdrawUploads({ ids, reason, me, practice: OFFICE.practiceMode, requestId: ctx.requestId });
  if (n === 0) throw new ApiError(409, 'already');
  return { withdrawn: n };
});
