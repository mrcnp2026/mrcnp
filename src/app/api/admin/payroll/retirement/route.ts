// 퇴직급여 건 — 만들기 · 초안 고치기 · 확정 · 거두기 · 새 판 (PRD v1.3 18.6 W08). 급여 담당 관리자만. 연습/운영은 서버가 정한다.
import { api, ApiError, readJson } from '@/lib/api';
import { OFFICE } from '@/config/office';
import { requirePayroll } from '@/lib/payroll/data';
import { toRetirementInput } from '@/lib/payroll/retirement';
import { createCase, finalizeCase, reviseCase, suggestInput, updateCase, withdrawCase } from '@/lib/payroll/retirement-data';

export const maxDuration = 60;
const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');

export const POST = api('admin.payroll.retirement', async (req, ctx) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  if (b.action === 'create') {
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || (b.kind !== 'ESTIMATE' && b.kind !== 'FINAL' && b.kind !== 'INTERIM')) throw new ApiError(400, 'invalid_input');
    const input = toRetirementInput(b.input);
    if (!input.periodTo) throw new ApiError(400, 'retirement_period');
    const practice = OFFICE.practiceMode && b.live !== true;
    // 어디서 채운 값인지는 서버가 다시 확인해 남긴다(화면이 보낸 것을 믿지 않는다)
    const { sources } = await suggestInput({ employeeId: b.employeeId, lastDay: input.periodTo, practice });
    return createCase({ employeeId: b.employeeId, kind: b.kind, input, sources, practice, me, requestId: ctx.requestId });
  }
  if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new ApiError(400, 'invalid_input');
  if (b.action === 'update') {
    const tax = b.taxAmount === null || b.taxAmount === undefined || b.taxAmount === '' ? null : Number(String(b.taxAmount).replace(/,/g, ''));
    if (tax !== null && !(Number.isFinite(tax) && tax >= 0 && tax <= 1e12)) throw new ApiError(400, 'invalid_input');
    await updateCase({ id: b.id, input: toRetirementInput(b.input), taxAmount: tax === null ? null : Math.round(tax), taxBasis: clean(b.taxBasis, 300) || null, me, requestId: ctx.requestId });
    return { ok: true };
  }
  if (b.action === 'finalize') {
    await finalizeCase({ id: b.id, me, requestId: ctx.requestId });
    return { ok: true };
  }
  if (b.action === 'withdraw') {
    const reason = clean(b.reason, 500);
    if (reason.length < 2) throw new ApiError(400, 'retirement_reason');
    await withdrawCase({ id: b.id, reason, me, requestId: ctx.requestId });
    return { ok: true };
  }
  if (b.action === 'revise') return reviseCase({ id: b.id, me, requestId: ctx.requestId });
  throw new ApiError(400, 'invalid_input');
});
