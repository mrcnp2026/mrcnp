// 연장근로 → 보상휴가 (2026-10-19 의뢰인, 묶음 29). 최고관리자만. 규칙은 lib/payroll/overtime-comp.ts
//   { action: 'room', employeeId, month } → 승인 연장 · 돌린 분 · 남은 분 · 확정 여부
//   { action: 'create', employeeId, month, minutes, rate, usableTo, note } → 기록 + 보상휴가 지급
//   { action: 'cancel', id, reason } → 지급 건을 거두고 취소 기록
import { api, ApiError, readJson } from '@/lib/api';
import { OFFICE } from '@/config/office';
import { requirePayroll } from '@/lib/payroll/data';
import { cancelComp, compRoom, createComp } from '@/lib/payroll/overtime-comp';
import { cleanReason } from '@/lib/staff-rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const POST = api('admin.payroll.overtimeComp', async (req) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  if (b.action === 'cancel') {
    if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new ApiError(400, 'invalid_input');
    const reason = cleanReason(b.reason);
    if (!reason) throw new ApiError(400, 'reason_required');
    await cancelComp({ me, id: b.id, reason });
    return { ok: true };
  }
  if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || typeof b.month !== 'string' || !MONTH.test(b.month)) throw new ApiError(400, 'invalid_input');
  if (b.action === 'room') return compRoom(b.employeeId, b.month, OFFICE.practiceMode);
  if (b.action !== 'create') throw new ApiError(400, 'invalid_input');
  const minutes = typeof b.minutes === 'number' ? b.minutes : NaN;
  const rate = typeof b.rate === 'number' ? b.rate : NaN;
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24000 || minutes % 15 !== 0) throw new ApiError(400, 'invalid_minutes'); // 15분 단위
  if (!Number.isFinite(rate) || rate < 1 || rate > 3 || !Number.isInteger(rate * 100)) throw new ApiError(400, 'invalid_rate');
  const usableTo = b.usableTo === null || b.usableTo === undefined || b.usableTo === '' ? null : typeof b.usableTo === 'string' && DAY.test(b.usableTo) ? b.usableTo : undefined;
  if (usableTo === undefined) throw new ApiError(400, 'invalid_input');
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 300) : null;
  return createComp({ me, employeeId: b.employeeId, month: b.month, minutes, rate, usableTo, note });
});
