// 퇴직연금 DC (묶음 32, 2026-10-20 노프로 비교) — 가입 넣기 · 고치기 · 빼기, 그 달 부담금 다시 만들기, 손으로 넣기, 은행에 낸 날 표시. 급여 담당 관리자만.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { requirePayroll } from '@/lib/payroll/data';
import { cleanMember } from '@/lib/payroll/pension';
import { markPaid, removeMember, saveManualContribution, saveMember, syncMonth } from '@/lib/payroll/pension-data';
import { assertStaffTarget } from '@/lib/staff-data';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const POST = api('admin.payroll.pension', async (req) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  const isTest = OFFICE.practiceMode;
  if (b.action === 'member.save') {
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
    await assertStaffTarget(me.id, b.employeeId);
    const input = cleanMember(b);
    if ('error' in input) throw new ApiError(400, input.error);
    await saveMember({ employeeId: b.employeeId, input, isTest, me });
    return { ok: true };
  }
  if (b.action === 'member.remove') {
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
    await removeMember({ employeeId: b.employeeId, isTest, me });
    return { ok: true };
  }
  if (b.action === 'sync') {
    if (typeof b.month !== 'string' || !MONTH.test(b.month)) throw new ApiError(400, 'invalid_input');
    return syncMonth({ month: b.month, isTest, me });
  }
  if (b.action === 'manual') {
    const wage = typeof b.wageTotal === 'number' ? b.wageTotal : typeof b.wageTotal === 'string' ? Number(b.wageTotal.replace(/,/g, '').trim()) : NaN;
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || typeof b.month !== 'string' || !MONTH.test(b.month) || !Number.isSafeInteger(wage) || wage < 0) throw new ApiError(400, 'invalid_input');
    await saveManualContribution({ employeeId: b.employeeId, month: b.month, wageTotal: wage, note, isTest, me });
    return { ok: true };
  }
  if (b.action === 'paid') {
    const ids = Array.isArray(b.employeeIds) ? (b.employeeIds as unknown[]).filter((v): v is string => typeof v === 'string' && UUID.test(v)) : [];
    const paidOn = b.paidOn === null || b.paidOn === '' ? null : typeof b.paidOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.paidOn) ? b.paidOn : undefined;
    if (typeof b.month !== 'string' || !MONTH.test(b.month) || !ids.length || paidOn === undefined) throw new ApiError(400, 'invalid_input');
    return { marked: await markPaid({ month: b.month, employeeIds: ids, paidOn, isTest, me }) };
  }
  throw new ApiError(400, 'invalid_input');
});
