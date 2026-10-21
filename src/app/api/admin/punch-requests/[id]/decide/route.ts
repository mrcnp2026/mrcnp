// 반경 밖 「출근/퇴근 요청」 승인·거절 (의뢰인 2026-10-10: 시프티 방식).
// 승인: 요청한 시각 그대로 출퇴근 기록을 만든다 (사무실 확인은 안 된 기록으로 — ip_verified=false). 거절: 기록이 생기지 않는다.
// 같은 요청을 두 번 승인해도 기록은 하나다 — record_punch가 같은 시각·같은 종류를 한 건으로 본다 (중복 방지).
import { syncOvertimeFor } from '@/lib/period-data';
import { OFFICE } from '@/config/office';
import { after } from 'next/server';
import { api, ApiError, readJson } from '@/lib/api';
import { rejectReasonOf } from '@/lib/reject-reason';
import { notifyDecision, notifyLateEarly } from '@/lib/push-events';
import { isPeriodLocked, recordPunch } from '@/lib/punch';
import { requireApprover, requireStaffViewer } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.punchRequests.decide', async (req, ctx) => {
  // 관리자 · 지점관리자. 누구의 요청인지 읽은 뒤 requireApprover가 다시 본다(최고관리자는 본인 것도 · 지점관리자는 맡은 지점 직원 것만, 권한-10)
  const viewer = await requireStaffViewer();
  if (!viewer) throw new ApiError(403, 'forbidden');
  const me = viewer.me;
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: r } = await db.from('punch_requests').select('id, employee_id, kind, requested_at, work_date, client_ip, passkey_id, status, is_test').eq('id', id).maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  if (r.status !== 'pending') return { result: 'already' };
  await requireApprover(r.employee_id); // 최고관리자는 본인 요청도 처리한다(권한-10) · 지점관리자는 맡은 지점 직원만, 자기 것은 못 한다
  if (await isPeriodLocked(r.employee_id, r.work_date)) throw new ApiError(409, 'period_locked');

  let eventId: string | null = null;
  if (b.decision === 'approved') {
    const { event } = await recordPunch({
      employeeId: r.employee_id, kind: r.kind, now: new Date(r.requested_at), clientIp: r.client_ip, ipVerified: false, verifiedBy: null, geo: null,
      source: 'web', isTest: r.is_test ?? OFFICE.practiceMode, passkeyId: r.passkey_id,
    });
    eventId = event.id;
  }
  const { data: done, error } = await db
    .from('punch_requests')
    .update({ status: b.decision, approved_by: me.id, decided_at: new Date().toISOString(), event_id: eventId })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw new Error(`punchRequests.decide: ${error.code}`);
  if (!done?.length) return { result: 'already' };
  const { error: e2 } = await db.from('decision_log').insert({ subject_table: 'punch_requests', subject_id: id, decision: b.decision, reason: rejectReasonOf(b), decided_by: me.id, request_id: ctx.requestId });
  if (e2) throw new Error(`punchRequests.log: ${e2.code}`);
  // 기록이 바뀐 날의 연장근로 확인을 바로 맞춘다 (2026-10-19 — 화면을 열 때 하던 계산을 옮김)
  syncOvertimeFor(r.employee_id, [r.work_date]);
  after(() => notifyDecision('punch_requests', id)); // 결과를 요청한 직원 폰으로 (2026-10-21 의뢰인, 알림-12) — 실제로 바뀐 것만 보낸다
  if (b.decision === 'approved') after(() => notifyLateEarly(r.employee_id, r.work_date, r.kind)); // 승인으로 생긴 기록도 지각 · 조퇴를 본다 (알림-11)
  return { result: 'ok' };
});
