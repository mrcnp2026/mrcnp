// 삭제 요청 결정·원래 휴가 취소·원장 되돌림·감사기록을 한 트랜잭션으로 처리한다.
// 정정 요청(kind 'change', 2026-10-23)은 승인할 때 새 내용을 먼저 검사하고(안 되면 아무것도 바뀌지 않는다) → 기존 휴가 취소 + 요청 승인(같은 함수) → 새 휴가를 만들어 바로 승인한다.
//   직권 고치기(api/admin/leave/direct)와 같은 순서다. 요청 때 이미 직원 규칙으로 검사했으므로 여기서는 직권 검사(지난 날 한도 · 종류 규칙 · 잔여 생략, 겹침 · 확정 · 마감은 그대로).
import { after } from 'next/server';
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { rejectReasonOf } from '@/lib/reject-reason';
import { notifyDecision } from '@/lib/push-events';
import { atomicRpc } from '@/lib/atomic-rpc';
import { assertAttendanceEditable } from '@/lib/confirm-data';
import { insertApprovedLeave } from '@/lib/leave-direct';
import { planLeave, type LeavePlan } from '@/lib/leave-request';
import { requireStaffViewer } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.leaveChanges.decide', async (req, ctx) => {
  const viewer = await requireStaffViewer();
  if (!viewer) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');

  // 정정 요청을 승인하려면 새 휴가를 먼저 계획한다 — 여기서 막히면 기존 휴가는 그대로다
  let change: { employeeId: string; plan: LeavePlan; why: string } | null = null;
  if (b.decision === 'approved') {
    const { data: r } = await createAdminClient().from('leave_change_requests').select('employee_id, leave_id, kind, status, reason, new_type_code, new_start_date, new_end_date, new_start_time, leave_requests(start_date, end_date)').eq('id', id).maybeSingle();
    if (r && r.status === 'pending' && r.kind === 'change') {
      const old = (r as unknown as { leave_requests: { start_date: string; end_date: string } | null }).leave_requests;
      if (!old) throw new ApiError(404, 'not_found');
      const plan = await planLeave(r.employee_id as string, { typeCode: r.new_type_code, startDate: r.new_start_date, endDate: r.new_end_date, startTime: r.new_start_time ? String(r.new_start_time).slice(0, 5) : null, reason: r.reason }, { direct: true, ignoreId: r.leave_id as string });
      await assertAttendanceEditable(r.employee_id as string, old.start_date, old.end_date, OFFICE.practiceMode);
      await assertAttendanceEditable(r.employee_id as string, plan.start, plan.end, OFFICE.practiceMode);
      change = { employeeId: r.employee_id as string, plan, why: String(r.reason ?? '') };
    }
  }

  const result = await atomicRpc<string>('decide_leave_change_atomic', { p_id: id, p_decision: b.decision, p_decided_by: viewer.me.id, p_request_id: ctx.requestId });
  if (change && result === 'ok') await insertApprovedLeave({ employeeId: change.employeeId, plan: change.plan, why: change.why, me: viewer.me, requestId: ctx.requestId, practice: OFFICE.practiceMode });
  // 거절 사유 (2026-10-21) — 이 결정 함수는 사유를 받지 않아 결정 기록에 사유 한 줄을 더 남긴다 (결정 기록은 고칠 수 없다)
  const why = rejectReasonOf(b);
  if (why && result === 'ok') {
    const { error } = await createAdminClient().from('decision_log').insert({ subject_table: 'leave_change_requests', subject_id: id, decision: 'rejected', reason: why, decided_by: viewer.me.id, request_id: ctx.requestId });
    if (error) console.error(JSON.stringify({ route: 'admin.leaveChanges.decide', code: 'reason_log', detail: error.code }));
  }
  after(() => notifyDecision('leave_change_requests', id)); // 결과를 요청한 직원 폰으로 (2026-10-21 의뢰인, 알림-12) — 실제로 바뀐 것만 보낸다
  return { result };
});
