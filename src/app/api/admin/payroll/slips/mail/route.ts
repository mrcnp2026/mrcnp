// 급여명세서 메일 발송 (2026-10-19 의뢰인). 최고관리자만. 공개 중인 명세서만 보낸다 — 계산한 대장의 명세서와 올린 명세서 둘 다.
//   POST { items: [{ employeeId, slipId }] } (한 번에 10장까지 — 화면이 나눠 부른다) → { sent, failed, noEmail, skipped }
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { requirePayroll } from '@/lib/payroll/data';
import { mailSlips, MAX_PER_CALL } from '@/lib/payroll/slip-mail';

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.payroll.slips.mail', async (req, ctx) => {
  const me = await requirePayroll();
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
