// 권한 요청 생성 또는 즉시 반영을 DB 잠금 안에서 결정한다.
import { api, ApiError, readJson } from '@/lib/api';
import { atomicRpc } from '@/lib/atomic-rpc';
import { requireAdmin } from '@/lib/auth';
import { cleanReason } from '@/lib/staff-rules';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.role', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  const role = b.role === undefined ? undefined : b.role === 'admin' || b.role === 'manager' || b.role === 'employee' ? b.role : null;
  const canViewPayroll = b.canViewPayroll === undefined ? undefined : typeof b.canViewPayroll === 'boolean' ? b.canViewPayroll : null;
  if (role === null || canViewPayroll === null || (role === undefined && canViewPayroll === undefined)) throw new ApiError(400, 'invalid_input');
  const reason = cleanReason(b.reason);
  if (!reason) throw new ApiError(400, 'reason_required');
  return atomicRpc('request_staff_role_atomic', { p_actor: me.id, p_target: id, p_role: role ?? null, p_pay: canViewPayroll ?? null, p_reason: reason, p_request_id: ctx.requestId });
});
