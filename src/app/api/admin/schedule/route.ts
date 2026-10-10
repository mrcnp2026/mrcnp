// 날짜별 근무일정 넣기 (의뢰인 2026-10-10 2단계) — 여러 직원에게 같은 날 같은 일정을 한 번에. 관리자만.
// 같은 직원·날짜·시작·끝이 이미 있으면 다시 만들지 않는다 (두 번 눌러도 한 건).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { validateShift } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('admin.schedule.create', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const v = validateShift(await readJson(req));
  if (!v.ok) throw new ApiError(400, v.code);
  const s = v.value;
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
    if (error) throw new Error(`schedule.create: ${error.code}`);
  }
  return { created: rows.length, skipped: skip.size };
});
