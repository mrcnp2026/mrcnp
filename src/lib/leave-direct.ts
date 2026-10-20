// 직권 휴가 넣기의 저장 길 — 휴가를 만들고 바로 승인한다. 직권 추가 · 고치기(api/admin/leave/direct)와 엑셀 일괄 입력(2026-10-20)이 같이 쓴다. 서버 전용.
// 부르는 쪽이 먼저: 최고관리자인지 · 본인이 아닌지(assertStaffTarget) · planLeave(direct) · assertAttendanceEditable.
import 'server-only';
import type { Me } from '@/lib/auth';
import { atomicRpc, rethrowDbRule } from '@/lib/atomic-rpc';
import type { LeavePlan } from '@/lib/leave-request';
import { syncOvertimeFor } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';

export async function insertApprovedLeave(args: { employeeId: string; plan: LeavePlan; why: string; me: Me; requestId?: string; practice: boolean }): Promise<{ id: string; result: string }> {
  const { plan } = args;
  const { data, error } = await createAdminClient()
    .from('leave_requests')
    .insert({
      employee_id: args.employeeId, type_code: plan.typeCode, work_dates: plan.workDates, start_date: plan.start, end_date: plan.end, days: plan.days,
      reason: plan.reason || args.why, start_time: plan.startTime, end_time: plan.endTime, status: 'pending', requested_by: args.me.id, is_test: args.practice,
    })
    .select('id')
    .single();
  if (error) rethrowDbRule(error);
  if (error || !data) throw new Error(`leave.direct.insert: ${error?.code}`);
  const result = await atomicRpc<string>('decide_leave_atomic', { p_id: data.id, p_decision: 'approved', p_decided_by: args.me.id, p_reason: args.why, p_request_id: args.requestId ?? null });
  syncOvertimeFor(args.employeeId, [plan.start, plan.end]); // 직권 휴가로 그날 근무 시간 기준이 바뀐다 (2026-10-19)
  return { id: data.id as string, result };
}
