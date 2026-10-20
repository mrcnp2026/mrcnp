// 최고관리자 직권 휴가 — 추가하거나(replaceId 없음) 이미 있는 휴가를 고친다(replaceId = 고칠 휴가). (2026-10-15 의뢰인: 최고관리자는 연차나 직원이 잘못 넣은 것을 직권으로 추가 · 수정 · 삭제)
// 삭제는 기존 「휴가 취소」(api/admin/leave/[id]/decide, cancelled)를 쓴다.
// ★ 직권: 지난 날 한도 · 종류별 신청 규칙 · 잔여 검사를 건너뛴다(lib/leave-request.ts direct). 겹침 · 확정된 날 · 마감은 그대로 막는다.
//   고치기 = 기존 휴가를 취소하고 새 휴가를 만들어 바로 승인한다 — 두 기록 모두 남고, 결정 기록에 누가 · 왜가 남는다.
//   새 휴가 검사를 먼저 끝낸 뒤에 기존 것을 취소한다(검사에서 막히면 아무것도 바뀌지 않는다).
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { atomicRpc } from '@/lib/atomic-rpc';
import { requireAdmin } from '@/lib/auth';
import { assertAttendanceEditable } from '@/lib/confirm-data';
import { insertApprovedLeave } from '@/lib/leave-direct';
import { planLeave } from '@/lib/leave-request';
import { assertStaffTarget } from '@/lib/staff-data';
import { cleanReason } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.leave.direct', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  if (!me.top) throw new ApiError(403, 'top_only');
  const b = await readJson(req);
  const employeeId = typeof b.employeeId === 'string' && UUID.test(b.employeeId) ? b.employeeId : null;
  if (!employeeId) throw new ApiError(400, 'invalid_input');
  const why = cleanReason(b.adminReason);
  if (!why) throw new ApiError(400, 'reason_required');
  await assertStaffTarget(me.id, employeeId, 'approve');
  const practice = OFFICE.practiceMode;
  const db = createAdminClient();

  let replaceId: string | null = null;
  let replaceStatus: 'approved' | 'pending' = 'approved';
  if (b.replaceId !== undefined && b.replaceId !== null) {
    if (typeof b.replaceId !== 'string' || !UUID.test(b.replaceId)) throw new ApiError(400, 'invalid_input');
    const { data: old } = await db.from('leave_requests').select('id, employee_id, start_date, end_date, status, is_test').eq('id', b.replaceId).maybeSingle();
    if (!old || old.employee_id !== employeeId || old.is_test !== practice) throw new ApiError(404, 'not_found');
    if (old.status !== 'approved' && old.status !== 'pending') throw new ApiError(409, 'already');
    await assertAttendanceEditable(employeeId, old.start_date, old.end_date, practice);
    replaceId = old.id;
    replaceStatus = old.status;
  }

  const plan = await planLeave(employeeId, b, { direct: true, ignoreId: replaceId ?? undefined });
  await assertAttendanceEditable(employeeId, plan.start, plan.end, practice);

  // 승인된 것은 취소, 대기 중인 것은 거절로 닫는다(DB 규칙: 대기 → 승인 · 거절, 승인 → 취소)
  if (replaceId) {
    const closed = await atomicRpc<string>('decide_leave_atomic', { p_id: replaceId, p_decision: replaceStatus === 'pending' ? 'rejected' : 'cancelled', p_decided_by: me.id, p_reason: why, p_request_id: ctx.requestId });
    if (closed !== 'ok') throw new ApiError(409, 'already');
  }

  const { id, result } = await insertApprovedLeave({ employeeId, plan, why, me, requestId: ctx.requestId, practice });
  return { id, days: plan.days, result };
});
