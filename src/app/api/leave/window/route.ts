// 시간 휴가(반차 · 반반차처럼 시작 시각을 직원이 고르는 종류) 미리 보기 — 신청 전에 끝나는 시각, 안 되면 가장 늦은 시작 시각을 알려 준다.
// 읽기만 한다. 실제 검사는 신청할 때 lib/leave-request.ts가 같은 계산으로 다시 한다. employeeId는 최고관리자 직권 양식에서만 받는다.
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { loadLeaveCalendar, loadLeaveTypes } from '@/lib/leave-data';
import { latestLeaveStart, leaveWindowForPlan } from '@/lib/payroll/engine/scheduled-attendance';
import { assertStaffTarget } from '@/lib/staff-data';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('leave.window', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  let employeeId = me.id;
  if (typeof b.employeeId === 'string' && b.employeeId !== me.id) {
    if (!me.top || !UUID.test(b.employeeId)) throw new ApiError(403, 'forbidden');
    await assertStaffTarget(me.id, b.employeeId, 'approve');
    employeeId = b.employeeId;
  }
  const type = (await loadLeaveTypes()).find((t) => t.code === b.typeCode);
  const date = typeof b.date === 'string' && DATE.test(b.date) ? b.date : null;
  if (!type || !date || type.dayUnit >= 1 || type.startTime) throw new ApiError(400, 'invalid_input');
  const calendar = await loadLeaveCalendar(date, date, employeeId);
  if (!calendar) throw new ApiError(409, 'no_rule');
  const plan = calendar.planOf(date);
  const hours = type.hours ?? type.dayUnit * 8;
  const window = typeof b.startTime === 'string' ? leaveWindowForPlan(plan, date, hours, b.startTime) : null;
  return { endTime: window?.endTime ?? null, latest: window ? null : latestLeaveStart(plan, date, hours) };
});
