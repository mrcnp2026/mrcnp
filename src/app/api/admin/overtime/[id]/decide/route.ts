// 연장 승인·부분 승인·거부 (7-7). 관리자만. 집계분(사실)은 건드리지 않고 인정분만 정한다.
// 동시에 두 관리자가 눌러도 DB 함수가 pending일 때만 반영한다 → 나중 사람은 'already' (R-4, R-2의 6)
import { after } from 'next/server';
import { api, ApiError, readJson } from '@/lib/api';
import { rejectReasonOf } from '@/lib/reject-reason';
import { notifyDecision } from '@/lib/push-events';
import { requireApprover, requireStaffViewer } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

const minutes = (v: unknown) => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 0 ? (v as number) : NaN);

export const POST = api<{ params: Promise<{ id: string }> }>('admin.overtime.decide', async (req, ctx) => {
  // 관리자 · 지점관리자. 누구의 요청인지 읽은 뒤 requireApprover가 다시 본다(최고관리자는 본인 것도 · 지점관리자는 맡은 지점 직원 것만, 권한-10)
  const viewer = await requireStaffViewer();
  if (!viewer) throw new ApiError(403, 'forbidden');
  const me = viewer.me;
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');
  const [o, n, h] = [minutes(b.approvedMinutes), minutes(b.approvedNightMinutes), minutes(b.approvedHolidayMinutes)];
  if ([o, n, h].some((x) => Number.isNaN(x))) throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: row } = await db.from('overtime_requests').select('employee_id').eq('id', id).maybeSingle();
  if (!row) throw new ApiError(404, 'not_found');
  await requireApprover(row.employee_id); // 최고관리자는 본인 요청도 처리한다(권한-10) · 지점관리자는 맡은 지점 직원만, 자기 것은 못 한다
  const { data, error } = await db.rpc('decide_overtime', {
    p_id: id,
    p_decision: b.decision,
    p_approved_minutes: o,
    p_approved_night: n,
    p_approved_holiday: h,
    p_decided_by: me.id,
    p_reason: rejectReasonOf(b), // 거절 사유 (2026-10-21, 선택)
    p_request_id: ctx.requestId,
  });
  if (error) {
    // 인정분 > 집계분은 DB check가 막는다 (6장)
    if (error.code === '23514') throw new ApiError(400, 'over_fact');
    throw new Error(`decide_overtime: ${error.code}`);
  }
  if (data === 'not_found') throw new ApiError(404, 'not_found');
  after(() => notifyDecision('overtime_requests', id)); // 결과를 요청한 직원 폰으로 (2026-10-21 의뢰인, 알림-12) — 실제로 바뀐 것만 보낸다
  return { result: data };
});
