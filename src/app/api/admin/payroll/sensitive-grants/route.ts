// 민감정보 원문 보기 허락 주기 · 거두기 (급여-36). 다른 관리자에게만 줄 수 있고 기한이 있다.
import { api, ApiError, readJson } from '@/lib/api';
import { requirePayroll } from '@/lib/payroll/data';
import { cleanText } from '@/lib/payroll/settings';
import { grantSensitive, revokeGrant } from '@/lib/payroll/sensitive';
import { GRANT_DAYS } from '@/lib/payroll/sensitive-core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.payroll.sensitive-grants', async (req) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  if (b.action === 'grant') {
    const reason = cleanText(b.reason, 300);
    if (typeof b.adminId !== 'string' || !UUID.test(b.adminId) || !reason || reason.length < 2 || !GRANT_DAYS.includes(b.days as number)) throw new ApiError(400, 'invalid_input');
    await grantSensitive({ adminId: b.adminId, reason, days: b.days as number, me });
    return { ok: true };
  }
  if (b.action === 'revoke') {
    if (typeof b.grantId !== 'string' || !UUID.test(b.grantId)) throw new ApiError(400, 'invalid_input');
    await revokeGrant({ grantId: b.grantId, me });
    return { ok: true };
  }
  throw new ApiError(400, 'invalid_input');
});
