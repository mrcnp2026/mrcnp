// 「지금 계산대로 승인」 (2026-11-03 의뢰인: 승인 뒤 시간이 늘어난 건을 인정할 방법) — 재확인 건만.
// 승인한 뒤 정정 · 휴게 안 함 · 일정 등록으로 다시 계산한 시간이 바뀌면, 승인은 처음 집계분을 넘을 수 없어 늘어난 몫을 줄 수 없었다.
// 0077의 resync_overtime으로 집계분을 지금 계산(recomputed_*)으로 바꾸고 전액 인정한다 — 전 · 후 값은 decision_log에 남는다.
// 대기 건이면 바꾼 뒤 평소 승인(decide_overtime)을 이어서 한다. 거부된 건 · 재확인이 아닌 건은 받지 않는다. 마감된 기간은 DB가 막는다
import { after } from 'next/server';
import { api, ApiError } from '@/lib/api';
import { rethrowDbRule } from '@/lib/atomic-rpc';
import { notifyDecision } from '@/lib/push-events';
import { requireApprover, requireStaffViewer } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.overtime.accept', async (_req, ctx) => {
  const viewer = await requireStaffViewer();
  if (!viewer) throw new ApiError(403, 'forbidden');
  const me = viewer.me;
  const { id } = await ctx.params;
  const db = createAdminClient();
  const { data: row } = await db
    .from('overtime_requests')
    .select('employee_id, status, needs_review, overtime_minutes, night_minutes, holiday_minutes, recomputed_overtime_minutes, recomputed_night_minutes, recomputed_holiday_minutes')
    .eq('id', id)
    .maybeSingle();
  if (!row) throw new ApiError(404, 'not_found');
  await requireApprover(row.employee_id);
  if (!row.needs_review || row.status === 'rejected') return { result: 'already' }; // 그사이 누가 처리했다
  const { data, error } = await db.rpc('resync_overtime', {
    p_id: id,
    p_overtime: row.recomputed_overtime_minutes ?? row.overtime_minutes,
    p_night: row.recomputed_night_minutes ?? row.night_minutes,
    p_holiday: row.recomputed_holiday_minutes ?? row.holiday_minutes,
    p_actor: me.id,
    p_reason: 'accept_recomputed',
    p_request_id: ctx.requestId,
  });
  rethrowDbRule(error);
  if (error) throw new Error(`resync_overtime: ${error.code}`);
  if (data === 'not_found') throw new ApiError(404, 'not_found');
  if (data === 'rejected') return { result: 'already' };
  if (row.status === 'pending') {
    const r = await db.rpc('decide_overtime', { p_id: id, p_decision: 'approved', p_approved_minutes: null, p_approved_night: null, p_approved_holiday: null, p_decided_by: me.id, p_reason: null, p_request_id: ctx.requestId });
    rethrowDbRule(r.error);
    if (r.error) throw new Error(`decide_overtime: ${r.error.code}`);
    after(() => notifyDecision('overtime_requests', id));
  }
  return { result: 'ok' };
});
