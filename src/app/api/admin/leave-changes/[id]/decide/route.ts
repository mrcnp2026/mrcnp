// 삭제 요청 결정·원래 휴가 취소·원장 되돌림·감사기록을 한 트랜잭션으로 처리한다.
import { api, ApiError, readJson } from '@/lib/api';
import { atomicRpc } from '@/lib/atomic-rpc';
import { requireStaffViewer } from '@/lib/scope';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.leaveChanges.decide', async (req, ctx) => {
  const viewer = await requireStaffViewer();
  if (!viewer) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');
  const result = await atomicRpc<string>('decide_leave_change_atomic', { p_id: id, p_decision: b.decision, p_decided_by: viewer.me.id, p_request_id: ctx.requestId });
  return { result };
});
