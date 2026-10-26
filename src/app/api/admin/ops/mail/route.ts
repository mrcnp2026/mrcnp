// 명세서 메일 다시 보내기 (2026-10-24 의뢰인: 발송 현황은 시스템관리자 운영 화면에서만 보고 · 다시 보낸다). 시스템관리자(사번 admin)만.
//   POST { items: [{ employeeId, slipId }] } (한 번에 10장까지 — 화면이 나눠 부른다) → { sent, failed, noEmail, noBirth, skipped }
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { mailSlips, MAX_PER_CALL } from '@/lib/payroll/slip-mail';
import { isSystemAdminNo } from '@/lib/system-admin';

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.ops.mail', async (req, ctx) => {
  const me = await getMe();
  if (!me || !isSystemAdminNo(me.employeeNo)) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const items = Array.isArray(b.items)
    ? b.items.flatMap((x) => {
        const o = x as { employeeId?: unknown; slipId?: unknown };
        return typeof o?.employeeId === 'string' && typeof o?.slipId === 'string' && UUID.test(o.employeeId) && UUID.test(o.slipId) ? [{ employeeId: o.employeeId, slipId: o.slipId }] : [];
      })
    : [];
  if (items.length === 0 || items.length > MAX_PER_CALL || items.length !== (b.items as unknown[]).length) throw new ApiError(400, 'invalid_input');
  return mailSlips({ me, items, practice: OFFICE.practiceMode, origin: req.nextUrl.origin, requestId: ctx.requestId });
});
