// 권한 변경 요청의 확인·거부·취소 (부록 R-2의 8: 두 번째 관리자 확인).
// - 확인·거부: 요청한 관리자와 **다른 관리자**만. 확인하는 순간 규칙(관리자 2명 하한·급여 담당 0명 등)을 다시 본다 — 요청 뒤 상황이 바뀌었을 수 있다
// - 취소: 요청한 본인만
// 두 관리자가 동시에 눌러도 대기 상태일 때만 반영된다 (나중 사람은 'already', R-4). 요청자·확인자 모두 변경 기록에 남는다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditStaffAction, loadStaff } from '@/lib/staff-data';
import { checkRoleChange } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.roleRequests.decide', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const { decision } = await readJson(req);
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'cancelled') throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: r } = await db.from('role_change_requests').select('id, target_id, new_role, new_can_view_payroll, reason, requested_by, status').eq('id', id).maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  if (r.status !== 'pending') throw new ApiError(409, 'already');
  if (decision === 'cancelled' ? r.requested_by !== me.id : r.requested_by === me.id) throw new ApiError(403, decision === 'cancelled' ? 'forbidden' : 'self_decision');

  if (decision === 'approved') {
    const all = await loadStaff();
    const requester = all.find((s) => s.id === r.requested_by);
    const target = all.find((s) => s.id === r.target_id);
    if (!requester || !target) throw new ApiError(404, 'not_found');
    const check = checkRoleChange({ actor: requester, target, all, role: r.new_role, canViewPayroll: r.new_can_view_payroll });
    if ('code' in check) throw new ApiError(409, check.code);
  }

  const { data: done, error } = await db.from('role_change_requests').update({ status: decision, decided_by: me.id, decided_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending').select('id');
  if (error) throw new Error(`roleRequests.decide: ${error.code}`);
  if (!done?.length) throw new ApiError(409, 'already');

  if (decision === 'approved') {
    const { error: e2 } = await db.from('profiles').update({ role: r.new_role, can_view_payroll: r.new_can_view_payroll, updated_by: me.id }).eq('id', r.target_id);
    if (e2) throw new Error(`roleRequests.apply: ${e2.code}`);
    await auditStaffAction({
      actorId: me.id, targetId: r.target_id, event: 'role_changed', reason: r.reason,
      detail: { to: { role: r.new_role, canViewPayroll: r.new_can_view_payroll }, requestedBy: r.requested_by, confirmedBy: me.id, roleRequestId: id, requestId: ctx.requestId },
    });
  }
  return { ok: true };
});
