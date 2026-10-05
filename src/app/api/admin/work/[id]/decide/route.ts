// 외근 승인·거부 (대기 건), 승인 취소. ★ 승인해도 출퇴근 기록의 ip_verified는 바꾸지 않는다 (B-21).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { isPeriodLocked } from '@/lib/punch';
import { assertNotOwnRequest } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.work.decide', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected' && b.decision !== 'cancelled') throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: r } = await db.from('work_requests').select('employee_id, start_date').eq('id', id).maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  await assertNotOwnRequest(me.id, r.employee_id); // 자기 요청은 다른 관리자가 처리한다
  if (await isPeriodLocked(r.employee_id, r.start_date)) throw new ApiError(409, 'period_locked');
  const { data, error } = await db.rpc('decide_work', { p_id: id, p_decision: b.decision, p_decided_by: me.id, p_reason: null, p_request_id: ctx.requestId });
  if (error) throw new Error(`decide_work: ${error.code}`);
  return { result: data };
});
