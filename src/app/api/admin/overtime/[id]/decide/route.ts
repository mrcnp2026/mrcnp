// 연장 승인·부분 승인·거부 (7-7). 관리자만. 집계분(사실)은 건드리지 않고 인정분만 정한다.
// 동시에 두 관리자가 눌러도 DB 함수가 pending일 때만 반영한다 → 나중 사람은 'already' (R-4, R-2의 6)
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { assertNotOwnRequest } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

const minutes = (v: unknown) => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 0 ? (v as number) : NaN);

export const POST = api<{ params: Promise<{ id: string }> }>('admin.overtime.decide', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');
  const [o, n, h] = [minutes(b.approvedMinutes), minutes(b.approvedNightMinutes), minutes(b.approvedHolidayMinutes)];
  if ([o, n, h].some((x) => Number.isNaN(x))) throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: row } = await db.from('overtime_requests').select('employee_id').eq('id', id).maybeSingle();
  if (!row) throw new ApiError(404, 'not_found');
  await assertNotOwnRequest(me.id, row.employee_id); // 자기 연장은 다른 관리자가 인정한다
  const { data, error } = await db.rpc('decide_overtime', {
    p_id: id,
    p_decision: b.decision,
    p_approved_minutes: o,
    p_approved_night: n,
    p_approved_holiday: h,
    p_decided_by: me.id,
    p_reason: null,
    p_request_id: ctx.requestId,
  });
  if (error) {
    // 인정분 > 집계분은 DB check가 막는다 (6장)
    if (error.code === '23514') throw new ApiError(400, 'over_fact');
    throw new Error(`decide_overtime: ${error.code}`);
  }
  if (data === 'not_found') throw new ApiError(404, 'not_found');
  return { result: data };
});
