// 요청 상태·프로필·감사기록을 같은 DB 트랜잭션으로 반영한다. 현재 자격도 DB 잠금 안에서 재검사한다.
import { saveManagerScope } from '@/lib/manager-scope-save';
import { createAdminClient } from '@/lib/supabase/admin';
import { api, ApiError, readJson } from '@/lib/api';
import { atomicRpc } from '@/lib/atomic-rpc';
import { requireAdmin } from '@/lib/auth';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.roleRequests.decide', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const { decision } = await readJson(req);
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'cancelled') throw new ApiError(400, 'invalid_input');
  const out = await atomicRpc<Record<string, unknown>>('decide_staff_role_atomic', { p_actor: me.id, p_id: id, p_decision: decision, p_request_id: ctx.requestId });
  // 지점관리자 지정 요청이 승인되면, 요청할 때 고른 지점을 그대로 맡긴다 (2026-11-03, 0086)
  if (decision === 'approved') {
    const db = createAdminClient();
    const [{ data: rq }, { data: sc }] = await Promise.all([db.from('role_change_requests').select('target_id, new_role, status').eq('id', id).maybeSingle(), db.from('role_request_scopes').select('group_ids').eq('request_id', id).maybeSingle()]);
    if (rq?.status === 'approved' && rq.new_role === 'manager' && sc?.group_ids?.length) await saveManagerScope(rq.target_id as string, sc.group_ids as string[], me.id);
  }
  return out;
});
