// 정정 승인·거부 (7-10). 원본(punch_events)은 절대 고치지 않는다 — punch_corrections.status만 바뀐다 (4-1).
// 같은 날·같은 종류 빠진 기록 추가가 이미 승인돼 있으면 'conflict' (부분 유일 인덱스, R-4)
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { assertNotConfirmed } from '@/lib/confirm-data';
import { isPeriodLocked } from '@/lib/punch';
import { assertNotOwnRequest } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.corrections.decide', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: c } = await db.from('punch_corrections').select('employee_id, work_date').eq('id', id).maybeSingle();
  if (!c) throw new ApiError(404, 'not_found');
  await assertNotOwnRequest(me.id, c.employee_id); // 자기 요청은 다른 관리자가 처리한다
  if (await isPeriodLocked(c.employee_id, c.work_date)) throw new ApiError(409, 'period_locked');
  await assertNotConfirmed(c.employee_id, c.work_date); // 확정된 날의 기록은 바뀌지 않는다 — 먼저 확정을 푼다
  const { data, error } = await db.rpc('decide_correction', {
    p_id: id,
    p_decision: b.decision,
    p_decided_by: me.id,
    p_reason: null,
    p_request_id: ctx.requestId,
  });
  if (error) throw new Error(`decide_correction: ${error.code}`);
  // 승인 뒤 그 주 재계산은 화면을 열 때 일어난다 (calcWeek가 월요일부터, 연장 요청은 needs_review로) — B-25
  return { result: data };
});
