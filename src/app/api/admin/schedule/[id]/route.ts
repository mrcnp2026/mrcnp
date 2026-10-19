// 날짜별 근무일정 취소 · 수정.
//   취소({ active: false }): 지우지 않고 active=false (4-6, 변경 기록에 남는다). 취소하면 그날은 평소 템플릿·회사 규칙으로 돌아간다.
//   수정({ startTime, endTime, kind, note }): 그 일정의 시각·유형·일정노트를 바꾼다 (의뢰인 2026-10-11). 직원·날짜는 바꾸지 않는다 — 바뀐 내용은 변경 기록에 남는다.
import { syncOvertimeFor } from '@/lib/period-data';
import { api, ApiError, readJson } from '@/lib/api';
import { rethrowDbRule } from '@/lib/atomic-rpc';
import { assertAttendanceEditable } from '@/lib/confirm-data';
import { assertStaffTarget } from '@/lib/staff-data';
import { requireAdmin } from '@/lib/auth';
import { validateShift } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.schedule.change', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  const db = createAdminClient();
  const { data: cur } = await db.from('shifts').select('id, employee_id, work_date').eq('id', id).eq('active', true).maybeSingle();
  if (!cur) throw new ApiError(404, 'not_found');
  await assertStaffTarget(me.id, cur.employee_id, 'approve');
  await assertAttendanceEditable(cur.employee_id, cur.work_date, cur.work_date, 'both');
  if (b.active === false) {
    const { data, error } = await db.from('shifts').update({ active: false, updated_by: me.id }).eq('id', id).eq('active', true).select('id');
    rethrowDbRule(error); // 확정한 날 · 마감 기간은 DB도 막는다(묶음 12) — 409로 알린다
    if (error) throw new Error(`schedule.cancel: ${error.code}`);
    if (!data?.length) throw new ApiError(404, 'not_found');
    syncOvertimeFor(cur.employee_id, [cur.work_date]);
    return { ok: true };
  }
  const v = validateShift({ date: cur.work_date, startTime: b.startTime, endTime: b.endTime, kind: b.kind, note: b.note, employeeIds: [cur.employee_id] });
  if (!v.ok) throw new ApiError(400, v.code);
  const { error } = await db.from('shifts').update({ start_time: v.value.startTime, end_time: v.value.endTime, kind: v.value.kind, note: v.value.note, updated_by: me.id }).eq('id', id).eq('active', true);
  rethrowDbRule(error); // 확정한 날 · 마감 기간은 DB도 막는다(묶음 12) — 409로 알린다
  if (error) throw new Error(`schedule.update: ${error.code}`);
  // 일정이 바뀐 날의 연장근로 확인을 바로 맞춘다 (2026-10-19)
  syncOvertimeFor(cur.employee_id, [cur.work_date]);
  return { ok: true };
});
