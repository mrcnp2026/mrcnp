// 날짜별 근무일정 넣기 (의뢰인 2026-10-10 2단계) — 여러 직원에게 같은 날 같은 일정을 한 번에. 관리자만.
// 같은 직원·날짜·시작·끝이 이미 있으면 다시 만들지 않는다 (두 번 눌러도 한 건).
import { syncOvertimeFor } from '@/lib/period-data';
import { api, ApiError, readJson } from '@/lib/api';
import { rethrowDbRule } from '@/lib/atomic-rpc';
import { assertAttendanceEditable } from '@/lib/confirm-data';
import { loadStaff } from '@/lib/staff-data';
import { approvalBlocked } from '@/lib/staff-rules';
import { requireAdmin } from '@/lib/auth';
import { validateShift } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('admin.schedule.create', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const v = validateShift(await readJson(req));
  if (!v.ok) throw new ApiError(400, v.code);
  const s = v.value;
  // 등급 규칙(개발-39): 처리할 수 없는 사람(본인 · 상위 등급)은 빼고 나머지만 넣는다 — 한 명 때문에 전체가 막히지 않게. 직원 목록은 한 번만 읽는다
  const all = await loadStaff();
  const actor = all.find((x) => x.id === me.id);
  if (!actor) throw new ApiError(403, 'forbidden');
  const blocked = s.employeeIds.filter((id) => {
    const target = all.find((x) => x.id === id);
    return !target || !!approvalBlocked(actor, target, all);
  });
  const allowedIds = s.employeeIds.filter((id) => !blocked.includes(id));
  if (allowedIds.length === 0) throw new ApiError(403, blocked.includes(me.id) ? 'self_decision' : 'rank');
  for (const id of allowedIds) await assertAttendanceEditable(id, s.date, s.date, 'both');
  s.employeeIds = allowedIds;
  const db = createAdminClient();
  const { data: people } = await db.from('profiles').select('id').in('id', s.employeeIds).eq('active', true);
  if ((people?.length ?? 0) !== s.employeeIds.length) throw new ApiError(400, 'invalid_input');
  if (s.templateId) {
    const { data: t } = await db.from('shift_templates').select('id').eq('id', s.templateId).maybeSingle();
    if (!t) throw new ApiError(400, 'invalid_input');
  }
  const { data: had } = await db.from('shifts').select('employee_id').eq('work_date', s.date).eq('active', true).eq('start_time', s.startTime).eq('end_time', s.endTime).in('employee_id', s.employeeIds);
  const skip = new Set((had ?? []).map((x) => x.employee_id as string));
  const rows = s.employeeIds.filter((id) => !skip.has(id)).map((employee_id) => ({ employee_id, work_date: s.date, start_time: s.startTime, end_time: s.endTime, kind: s.kind, template_id: s.templateId, note: s.note, created_by: me.id, updated_by: me.id }));
  if (rows.length) {
    const { error } = await db.from('shifts').insert(rows);
    rethrowDbRule(error); // 확정한 날 · 마감 기간은 DB도 막는다(묶음 12) — 409로 알린다
    if (error) throw new Error(`schedule.create: ${error.code}`);
  }
  // 기록이 바뀐 날의 연장근로 확인을 바로 맞춘다 (2026-10-19 — 화면을 열 때 하던 계산을 옮김)
  syncOvertimeFor(rows.map((r) => r.employee_id), [s.date]);
  return { created: rows.length, skipped: skip.size, notAllowed: blocked.length };
});
