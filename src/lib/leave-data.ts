// 연차 데이터 읽기. 서버 전용. 쓰기는 API 라우트가 service_role로만 (4-11).
import 'server-only';
import { readAll } from '@/lib/read-all';
import { addDays } from '@/lib/calendar';
import { cache } from 'react';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { loadHolidays, loadRuleVersions } from '@/lib/attendance-data';
import { loadShifts, loadTemplateOf } from '@/lib/shift-data';
import { planDay, type DayPlan } from '@/lib/shifts';
import type { LeaveGrant, LeaveRequest, LeaveType } from '@/lib/leave';
import { ruleAt } from '@/lib/rule-at';
import { viewerScope, within } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import type { DayType } from '@/lib/types';

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);
/** 휴가 종류 전부 (꺼 둔 것 포함) — 지난 신청의 이름·단위를 계속 보여 주려면 꺼 둔 종류도 필요하다 */
export const loadAllLeaveTypes = cache(async (): Promise<LeaveType[]> => {
  const db = createAdminClient();
  const [{ data, error: typeError }, { data: rules, error: ruleError }] = await Promise.all([
    db.from('leave_types').select('code, name, is_paid, deducts_balance, day_unit, hours, start_time, end_time, group_name, builtin, active').order('sort').order('name'),
    db.from('leave_type_policy_versions').select('type_code, payload').eq('status', 'active').is('valid_to', null),
  ]);
  if (typeError || ruleError) throw new Error(`leaveTypes: ${(typeError ?? ruleError)!.code}`);
  const en = new Map((rules ?? []).map((r) => [r.type_code as string, ((r.payload as { nameEn?: unknown } | null)?.nameEn as string | undefined) ?? null]));
  return (data ?? []).map((t) => ({
    code: t.code, name: t.name, nameEn: en.get(t.code) ?? null, isPaid: t.is_paid, deductsBalance: t.deducts_balance, dayUnit: Number(t.day_unit), hours: Number(t.hours),
    startTime: hm(t.start_time), endTime: hm(t.end_time), groupName: t.group_name, builtin: t.builtin, active: t.active,
  }));
});
/** 지금 신청할 수 있는 종류 (켜 둔 것) */
export const loadLeaveTypes = cache(async (): Promise<LeaveType[]> => (await loadAllLeaveTypes()).filter((t) => t.active));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase 행 모양 그대로
export const toRequest = (r: any): LeaveRequest => ({
  id: r.id, employeeId: r.employee_id, typeCode: r.type_code, startDate: r.start_date, endDate: r.end_date, days: Number(r.days),
  typeSnapshot: r.type_snapshot ?? null, workDates: r.work_dates ?? null, reason: r.reason, status: r.status, startTime: hm(r.start_time), endTime: hm(r.end_time), createdAt: r.created_at, decidedAt: r.decided_at, approvedBy: r.approved_by,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toGrant = (g: any): LeaveGrant => ({
  id: g.id, employeeId: g.employee_id, periodLabel: g.period_label, grantedDays: Number(g.granted_days), carriedDays: Number(g.carried_days),
  basis: g.basis, effectiveFrom: g.effective_from, note: g.note,
});

/** 기간과 겹치는 휴가 신청 (from~to). employeeId를 주면 그 직원 것만 */
export async function loadLeaveRequests(opts: { from?: string; to?: string; employeeId?: string; practice?: boolean } = {}): Promise<LeaveRequest[]> {
  let q = createAdminClient().from('leave_requests').select('*').eq('is_test', opts.practice ?? OFFICE.practiceMode);
  if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts.from) q = q.gte('end_date', opts.from);
  if (opts.to) q = q.lte('start_date', opts.to);
  const { data } = await readAll((from, to) => q.order('start_date', { ascending: false }).order('id').range(from, to));
  return within((data ?? []).map(toRequest), await viewerScope(), (r) => r.employeeId); // 지점관리자면 맡은 지점 직원 것만
}

export async function loadLeaveGrants(employeeId?: string): Promise<LeaveGrant[]> {
  let q = createAdminClient().from('leave_grants').select('*');
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data } = await readAll((from, to) => q.order('effective_from', { ascending: false }).order('id').range(from, to));
  return within((data ?? []).map(toGrant), await viewerScope(), (g) => g.employeeId);
}

/** 날짜 → 근무일/휴일 (그날 근무규칙 + 공휴일). 규칙이 없으면 null — 추측하지 않는다 */
export async function loadLeaveCalendar(from: string, to: string, employeeId?: string): Promise<{ dayTypeOf: (d: string) => DayType; planOf: (d: string) => DayPlan } | null> {
  const [versions, holidays, shifts, tpl] = await Promise.all([loadRuleVersions(), loadHolidays(from, to), employeeId ? loadShifts(from, to, employeeId) : [], employeeId ? loadTemplateOf(employeeId) : null]);
  for (let date = from; date <= to; date = addDays(date, 1)) if (!ruleAt(versions, date)) return null;
  const planOf = (d: string) => {
    const r = ruleAt(versions, d);
    if (!r) throw new Error('leave day: no effective rule');
    const company = resolveDayType(d, r, holidays);
    const plan = planDay({ rule: r, tpl, shifts: shifts.filter((s) => s.workDate === d), isWorkday: company === 'workday' });
    return plan;
  };
  const dayTypeOf = (d: string): DayType => {
    const plan = planOf(d);
    const company = resolveDayType(d, ruleAt(versions, d)!, holidays);
    const assigned = plan.items.filter((s) => s.source === 'shift' && s.kind !== 'extra');
    return assigned.length ? assigned.every((s) => s.kind === 'holiday') ? 'holiday' : 'workday' : company;
  };
  return { dayTypeOf, planOf };
}

export async function dayTypeResolver(from: string,to: string,employeeId?: string): Promise<((d: string)=>DayType)|null> {
  return (await loadLeaveCalendar(from,to,employeeId))?.dayTypeOf ?? null;
}
