// 연차 데이터 읽기. 서버 전용. 쓰기는 API 라우트가 service_role로만 (4-11).
import 'server-only';
import { cache } from 'react';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { loadHolidays, loadRuleVersions } from '@/lib/attendance-data';
import type { LeaveGrant, LeaveRequest, LeaveType } from '@/lib/leave';
import { ruleAt } from '@/lib/rule-at';
import { createAdminClient } from '@/lib/supabase/admin';
import type { DayType } from '@/lib/types';

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);
/** 휴가 종류 전부 (꺼 둔 것 포함) — 지난 신청의 이름·단위를 계속 보여 주려면 꺼 둔 종류도 필요하다 */
export const loadAllLeaveTypes = cache(async (): Promise<LeaveType[]> => {
  const { data } = await createAdminClient().from('leave_types').select('code, name, is_paid, deducts_balance, day_unit, hours, start_time, end_time, group_name, builtin, active').order('sort').order('name');
  return (data ?? []).map((t) => ({
    code: t.code, name: t.name, isPaid: t.is_paid, deductsBalance: t.deducts_balance, dayUnit: Number(t.day_unit), hours: Number(t.hours),
    startTime: hm(t.start_time), endTime: hm(t.end_time), groupName: t.group_name, builtin: t.builtin, active: t.active,
  }));
});
/** 지금 신청할 수 있는 종류 (켜 둔 것) */
export const loadLeaveTypes = cache(async (): Promise<LeaveType[]> => (await loadAllLeaveTypes()).filter((t) => t.active));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase 행 모양 그대로
export const toRequest = (r: any): LeaveRequest => ({
  id: r.id, employeeId: r.employee_id, typeCode: r.type_code, startDate: r.start_date, endDate: r.end_date, days: Number(r.days),
  reason: r.reason, status: r.status, startTime: hm(r.start_time), endTime: hm(r.end_time), createdAt: r.created_at, decidedAt: r.decided_at, approvedBy: r.approved_by,
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
  const { data } = await q.order('start_date', { ascending: false });
  return (data ?? []).map(toRequest);
}

export async function loadLeaveGrants(employeeId?: string): Promise<LeaveGrant[]> {
  let q = createAdminClient().from('leave_grants').select('*');
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data } = await q.order('effective_from', { ascending: false });
  return (data ?? []).map(toGrant);
}

/** 날짜 → 근무일/휴일 (그날 근무규칙 + 공휴일). 규칙이 없으면 null — 추측하지 않는다 */
export async function dayTypeResolver(from: string, to: string): Promise<((d: string) => DayType) | null> {
  const [versions, holidays] = await Promise.all([loadRuleVersions(), loadHolidays(from, to)]);
  if (!ruleAt(versions, to) && !ruleAt(versions, from)) return null;
  return (d: string) => {
    const r = ruleAt(versions, d) ?? ruleAt(versions, to);
    return r ? resolveDayType(d, r, holidays) : 'workday';
  };
}
