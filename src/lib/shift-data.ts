// 근무일정 틀 읽기. 서버 전용.
import 'server-only';
import type { DayShift, ShiftTemplate } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';

export async function loadShiftTemplates(includeOff = false): Promise<ShiftTemplate[]> {
  let q = createAdminClient().from('shift_templates').select('id, name, start_time, end_time, kind, color, memo, active').order('start_time').order('name');
  if (!includeOff) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`loadShiftTemplates: ${error.code}`);
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, startTime: t.start_time.slice(0, 5), endTime: t.end_time.slice(0, 5), kind: t.kind, color: t.color, memo: t.memo, active: t.active }));
}

/** 한 직원에게 적용된 틀 (꺼 둔 틀은 적용되지 않은 것으로 본다). 없으면 null */
export async function loadTemplateOf(employeeId: string): Promise<ShiftTemplate | null> {
  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('shift_template_id').eq('id', employeeId).maybeSingle();
  if (!p?.shift_template_id) return null;
  return (await loadShiftTemplates()).find((t) => t.id === p.shift_template_id) ?? null;
}

/** 날짜별 일정 (취소한 것 제외). employeeId를 주면 그 사람 것만 */
export async function loadShifts(from: string, to: string, employeeId?: string): Promise<DayShift[]> {
  let q = createAdminClient().from('shifts').select('id, employee_id, work_date, start_time, end_time, kind, template_id, note').eq('active', true).gte('work_date', from).lte('work_date', to).order('start_time');
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q;
  if (error) throw new Error(`loadShifts: ${error.code}`);
  return (data ?? []).map((s) => ({ id: s.id, employeeId: s.employee_id, workDate: s.work_date, startTime: s.start_time.slice(0, 5), endTime: s.end_time.slice(0, 5), kind: s.kind, templateId: s.template_id, note: s.note }));
}
