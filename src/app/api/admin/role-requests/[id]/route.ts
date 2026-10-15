// 요청 상태·프로필·감사기록을 같은 DB 트랜잭션으로 반영한다. 현재 자격도 DB 잠금 안에서 재검사한다.
import { api, ApiError, readJson } from '@/lib/api';
import { atomicRpc } from '@/lib/atomic-rpc';
import { requireAdmin } from '@/lib/auth';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.roleRequests.decide', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const { decision } = await readJson(req);
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'cancelled') throw new ApiError(400, 'invalid_input');
  return atomicRpc('decide_staff_role_atomic', { p_actor: me.id, p_id: id, p_decision: decision, p_request_id: ctx.requestId });
});
