// 휴가 승인·거부 (대기 건), 승인된 휴가 취소 (4-6: 출근 기록과 충돌하면 관리자가 판단 — 자동으로 한쪽을 지우지 않는다).
import { syncOvertimeFor } from '@/lib/period-data';
import { atomicRpc } from '@/lib/atomic-rpc';
import { api, ApiError, readJson } from '@/lib/api';
import { assertAttendanceEditable } from '@/lib/confirm-data';
import { requireApprover, requireStaffViewer } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.leave.decide', async (req, ctx) => {
  // 관리자 · 지점관리자. 누구의 요청인지 읽은 뒤 requireApprover가 다시 본다(지점관리자는 맡은 지점 직원의 요청만, 자기 요청은 못 한다)
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
  await requireApprover(r.employee_id); // 자기 요청은 다른 관리자가 처리한다 · 지점관리자는 맡은 지점만
  if (b.decision !== 'rejected') await assertAttendanceEditable(r.employee_id, r.start_date, r.end_date, r.is_test);
  const data = await atomicRpc<string>('decide_leave_atomic', { p_id: id, p_decision: b.decision, p_decided_by: me.id, p_reason: null, p_request_id: ctx.requestId });
  if (b.decision !== 'rejected') syncOvertimeFor(r.employee_id, [r.start_date, r.end_date]); // 휴가가 그날 근무 시간 기준을 바꾼다 (2026-10-19)
  return { result: data };
});
