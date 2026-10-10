// 휴가 삭제 요청 승인·거절 (의뢰인 2026-10-11). 승인: 그 휴가를 취소한다 (decide_leave — 승인된 휴가만 취소되고 결정 기록이 남는다). 거절: 휴가는 그대로.
// 휴가가 이미 다른 길로 취소돼 있으면(관리자가 직접 취소) 요청만 승인으로 닫는다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { isPeriodLocked } from '@/lib/punch';
import { assertNotOwnRequest } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.leaveChanges.decide', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: r } = await db.from('leave_change_requests').select('id, leave_id, employee_id, status, leave_requests(start_date)').eq('id', id).maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  if (r.status !== 'pending') return { result: 'already' };
  await assertNotOwnRequest(me.id, r.employee_id); // 자기 요청은 다른 관리자가 처리한다
  const start = (r.leave_requests as unknown as { start_date?: string } | null)?.start_date;
  if (start && (await isPeriodLocked(r.employee_id, start))) throw new ApiError(409, 'period_locked');

  if (b.decision === 'approved') {
    const { data, error } = await db.rpc('decide_leave', { p_id: r.leave_id, p_decision: 'cancelled', p_decided_by: me.id, p_reason: null, p_request_id: ctx.requestId });
    if (error) throw new Error(`leaveChanges.cancelLeave: ${error.code}`);
    if (data === 'not_found') throw new ApiError(404, 'not_found');
  }
  const { data: done, error } = await db.from('leave_change_requests').update({ status: b.decision, approved_by: me.id, decided_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending').select('id');
  if (error) throw new Error(`leaveChanges.decide: ${error.code}`);
  if (!done?.length) return { result: 'already' };
  const { error: e2 } = await db.from('decision_log').insert({ subject_table: 'leave_change_requests', subject_id: id, decision: b.decision, reason: null, decided_by: me.id, request_id: ctx.requestId });
  if (e2) throw new Error(`leaveChanges.log: ${e2.code}`);
  return { result: 'ok' };
});
