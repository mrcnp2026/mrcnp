// 정정 승인·거부 (7-10). 원본(punch_events)은 절대 고치지 않는다 — punch_corrections.status만 바뀐다 (4-1).
// 같은 날·같은 종류 빠진 기록 추가가 이미 승인돼 있으면 'conflict' (부분 유일 인덱스, R-4)
import { syncOvertimeFor } from '@/lib/period-data';
import { after } from 'next/server';
import { api, ApiError, readJson } from '@/lib/api';
import { rejectReasonOf } from '@/lib/reject-reason';
import { notifyDecision } from '@/lib/push-events';
import { assertNotConfirmed } from '@/lib/confirm-data';
import { isPeriodLocked } from '@/lib/punch';
import { requireApprover, requireStaffViewer } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.corrections.decide', async (req, ctx) => {
  // 관리자 · 지점관리자. 누구의 요청인지 읽은 뒤 requireApprover가 다시 본다(지점관리자는 맡은 지점 직원의 요청만, 자기 요청은 못 한다)
  const viewer = await requireStaffViewer();
  if (!viewer) throw new ApiError(403, 'forbidden');
  const me = viewer.me;
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: c } = await db.from('punch_corrections').select('employee_id, work_date').eq('id', id).maybeSingle();
  if (!c) throw new ApiError(404, 'not_found');
  await requireApprover(c.employee_id); // 자기 요청은 다른 관리자가 처리한다 · 지점관리자는 맡은 지점만
  if (await isPeriodLocked(c.employee_id, c.work_date)) throw new ApiError(409, 'period_locked');
  await assertNotConfirmed(c.employee_id, c.work_date); // 확정된 날의 기록은 바뀌지 않는다 — 먼저 확정을 푼다
  const { data, error } = await db.rpc('decide_correction', {
    p_id: id,
    p_decision: b.decision,
    p_decided_by: me.id,
    p_reason: rejectReasonOf(b), // 거절 사유 (2026-10-21, 선택)
    p_request_id: ctx.requestId,
  });
  if (error) throw new Error(`decide_correction: ${error.code}`);
  // 승인 뒤 그 주 재계산은 화면을 열 때 일어난다 (calcWeek가 월요일부터, 연장 요청은 needs_review로) — B-25
  // 기록이 바뀐 날의 연장근로 확인을 바로 맞춘다 (2026-10-19 — 화면을 열 때 하던 계산을 옮김)
  syncOvertimeFor(c.employee_id, [c.work_date]);
  after(() => notifyDecision('punch_corrections', id)); // 결과를 요청한 직원 폰으로 (2026-10-21 의뢰인, 알림-12) — 실제로 바뀐 것만 보낸다
  return { result: data };
});
