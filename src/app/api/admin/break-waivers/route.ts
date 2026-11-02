// 휴게 안 함 표시 · 거두기 (결정 사항 급여-60, 2026-11-02 의뢰인: 휴게시간에 쉬지 않고 일한 날은 그 휴게를 빼지 않는다).
// 관리자가 한 직원의 하루에서 휴게시간대 하나를 골라 사유와 함께 표시한다. 계산은 period-data(waiveBreaks)가 한다.
// 확정한 날 · 마감한 달은 바꾸지 못한다(먼저 확정을 푼다). 바꾼 뒤 그날 연장을 다시 맞춘다 — 늘어난 연장은 「다시 확인」으로 올라온다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { confirmKey, loadConfirms } from '@/lib/confirm-data';
import { loadPeriod, syncOvertimeFor } from '@/lib/period-data';
import { isPeriodLocked } from '@/lib/punch';
import { loadStaff } from '@/lib/staff-data';
import { approvalBlocked } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { hhmm, toKstDate } from '@/lib/time';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^\d{2}:\d{2}$/;

export const POST = api('admin.breakWaivers', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const practice = OFFICE.practiceMode;
  const db = createAdminClient();

  // 대상 직원 · 날짜 확인 (표시 · 거두기 공통)
  const guard = async (employeeId: string, date: string) => {
    const staff = await loadStaff();
    const actor = staff.find((s) => s.id === me.id);
    const target = staff.find((s) => s.id === employeeId);
    if (!actor || !target) throw new ApiError(404, 'not_found');
    const blocked = approvalBlocked(actor, target, staff); // 자기 근로시간을 혼자 바꾸지 않는다 (권한-12)
    if (blocked) throw new ApiError(403, blocked);
    if ((await loadConfirms(date, date, practice)).has(confirmKey(employeeId, date))) throw new ApiError(409, 'day_confirmed');
    if (await isPeriodLocked(employeeId, date)) throw new ApiError(409, 'period_locked');
  };

  if (b.action === 'release') {
    if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new ApiError(400, 'invalid_input');
    const { data: row } = await db.from('break_waivers').select('id, employee_id, work_date').eq('id', b.id).eq('is_test', practice).eq('active', true).maybeSingle();
    if (!row) throw new ApiError(404, 'not_found');
    await guard(row.employee_id as string, row.work_date as string);
    const { error } = await db.from('break_waivers').update({ active: false, released_by: me.id, released_at: new Date().toISOString() }).eq('id', b.id).eq('active', true);
    if (error) throw new Error(`breakWaivers.release: ${error.code}`);
    syncOvertimeFor(row.employee_id as string, [row.work_date as string]);
    return { ok: true };
  }

  if (b.action !== 'add') throw new ApiError(400, 'invalid_input');
  const { employeeId, date, start, end } = b as Record<string, unknown>;
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (typeof employeeId !== 'string' || !UUID.test(employeeId) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'invalid_input');
  if (typeof start !== 'string' || typeof end !== 'string' || !TIME.test(start) || !TIME.test(end) || start >= end) throw new ApiError(400, 'invalid_input');
  if (!reason || reason.length > 200) throw new ApiError(400, 'reason_required');
  if (date > toKstDate(new Date())) throw new ApiError(400, 'invalid_input');
  await guard(employeeId, date);
  // 그날 규칙에 실제로 있는 휴게시간대만 표시할 수 있다
  const rule = (await loadPeriod(date, date, practice)).ruleFor(employeeId, date);
  const windows = rule ? [...(rule.breakStart && rule.breakEnd ? [{ start: hhmm(rule.breakStart), end: hhmm(rule.breakEnd) }] : []), ...(rule.extraBreaks ?? []).map((x) => ({ start: hhmm(x.start), end: hhmm(x.end) }))] : [];
  if (!windows.some((w) => w.start === start && w.end === end)) throw new ApiError(400, 'invalid_input');
  const { error } = await db.from('break_waivers').insert({ employee_id: employeeId, work_date: date, break_start: start, break_end: end, reason, is_test: practice, created_by: me.id });
  if (error?.code === '23505') throw new ApiError(409, 'already_waived');
  if (error) throw new Error(`breakWaivers.add: ${error.code}`);
  syncOvertimeFor(employeeId, [date]);
  return { ok: true };
});
