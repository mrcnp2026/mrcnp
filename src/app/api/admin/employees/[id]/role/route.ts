// 관리자 지정·해제, 급여 담당 지정·해제 (부록 R-2). 사유 필수, 변경 기록에 남는다.
// - 자기 권한은 스스로 못 바꾼다 (자기에게 급여 담당을 켜는 것 포함)
// - 관리자가 2명 미만이 되는 해제는 차단 / 급여 담당은 급여 담당자만 지정·해제하고 0명이 되면 차단
// - 관리자에서 내려오면 급여 담당도 함께 내려온다
// ⚠️ "두 번째 관리자 확인"(R-2의 8)은 아직 붙이지 않았다 (staff-rules.ts 머리말)
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditStaffAction, loadStaff } from '@/lib/staff-data';
import { checkRoleChange, cleanReason } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.role', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  const role = b.role === undefined ? undefined : b.role === 'admin' || b.role === 'employee' ? b.role : null;
  const canViewPayroll = b.canViewPayroll === undefined ? undefined : typeof b.canViewPayroll === 'boolean' ? b.canViewPayroll : null;
  if (role === null || canViewPayroll === null || (role === undefined && canViewPayroll === undefined)) throw new ApiError(400, 'invalid_input');
  const reason = cleanReason(b.reason);
  if (!reason) throw new ApiError(400, 'reason_required');

  const all = await loadStaff();
  const actor = all.find((s) => s.id === me.id);
  const target = all.find((s) => s.id === id);
  if (!actor || !target) throw new ApiError(404, 'not_found');
  const r = checkRoleChange({ actor, target, all, role, canViewPayroll });
  if ('code' in r) throw new ApiError(r.code === 'self_change' || r.code === 'payroll_only_grant' ? 403 : 409, r.code);

  const { error } = await createAdminClient().from('profiles').update({ role: r.next.role, can_view_payroll: r.next.canViewPayroll, updated_by: me.id }).eq('id', id);
  if (error) throw new Error(`role.update: ${error.code}`);
  await auditStaffAction({
    actorId: me.id, targetId: id, event: 'role_changed', reason,
    detail: { from: { role: target.role, canViewPayroll: target.canViewPayroll }, to: { role: r.next.role, canViewPayroll: r.next.canViewPayroll }, requestId: ctx.requestId },
  });
  return { ok: true, role: r.next.role, canViewPayroll: r.next.canViewPayroll };
});
