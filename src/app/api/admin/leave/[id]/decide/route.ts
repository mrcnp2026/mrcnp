// 휴가 승인·거부 (대기 건), 승인된 휴가 취소 (4-6: 출근 기록과 충돌하면 관리자가 판단 — 자동으로 한쪽을 지우지 않는다).
import { syncOvertimeFor } from '@/lib/period-data';
import { atomicRpc } from '@/lib/atomic-rpc';
import { after } from 'next/server';
import { api, ApiError, readJson } from '@/lib/api';
import { rejectReasonOf } from '@/lib/reject-reason';
import { notifyDecision } from '@/lib/push-events';
import { assertAttendanceEditable } from '@/lib/confirm-data';
import { assertEvidence } from '@/lib/leave-evidence';
import { requireApprover, requireStaffViewer } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.leave.decide', async (req, ctx) => {
  // 관리자 · 지점관리자. 누구의 요청인지 읽은 뒤 requireApprover가 다시 본다(최고관리자는 본인 것도 · 지점관리자는 맡은 지점 직원 것만, 권한-10)
  const viewer = await requireStaffViewer();
  if (!viewer) throw new ApiError(403, 'forbidden');
  const me = viewer.me;
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected' && b.decision !== 'cancelled') throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: r } = await db.from('leave_requests').select('employee_id, start_date, end_date, is_test').eq('id', id).maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  if (b.decision === 'cancelled' && viewer.readOnly) throw new ApiError(403, 'forbidden'); // 승인된 휴가를 취소하는 것은 관리자만 (지점관리자는 승인 · 거절만)
  await requireApprover(r.employee_id); // 최고관리자는 본인 요청도 처리한다(권한-10) · 지점관리자는 맡은 지점 직원만, 자기 것은 못 한다
  if (b.decision === 'approved') await assertEvidence(id); // 종류 규칙이 「증빙 필수」면 파일이 있어야 승인 (묶음 9)
  if (b.decision !== 'rejected') await assertAttendanceEditable(r.employee_id, r.start_date, r.end_date, r.is_test);
  const data = await atomicRpc<string>('decide_leave_atomic', { p_id: id, p_decision: b.decision, p_decided_by: me.id, p_reason: rejectReasonOf(b), // 거절 사유 (2026-10-21, 선택)
    p_request_id: ctx.requestId });
  if (b.decision !== 'rejected') syncOvertimeFor(r.employee_id, [r.start_date, r.end_date]); // 휴가가 그날 근무 시간 기준을 바꾼다 (2026-10-19)
  after(() => notifyDecision('leave_requests', id)); // 결과를 요청한 직원 폰으로 (2026-10-21 의뢰인, 알림-12) — 실제로 바뀐 것만 보낸다
  return { result: data };
});
