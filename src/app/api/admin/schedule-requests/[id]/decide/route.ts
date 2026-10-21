// 근무일정 생성 요청 승인·거절 (의뢰인 2026-10-11). 승인: 그 날짜에 날짜별 일정을 한 건 만든다 (같은 직원·날짜·시각의 일정이 이미 있으면 그것을 쓴다). 거절: 만들지 않는다.
import { syncOvertimeFor } from '@/lib/period-data';
import { after } from 'next/server';
import { api, ApiError, readJson } from '@/lib/api';
import { rejectReasonOf } from '@/lib/reject-reason';
import { notifyDecision } from '@/lib/push-events';
import { requireApprover, requireStaffViewer } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.scheduleRequests.decide', async (req, ctx) => {
  // 관리자 · 지점관리자. 누구의 요청인지 읽은 뒤 requireApprover가 다시 본다(최고관리자는 본인 것도 · 지점관리자는 맡은 지점 직원 것만, 권한-10)
  const viewer = await requireStaffViewer();
  if (!viewer) throw new ApiError(403, 'forbidden');
  const me = viewer.me;
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: r } = await db.from('shift_requests').select('id, employee_id, work_date, start_time, end_time, kind, reason, status').eq('id', id).maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  if (r.status !== 'pending') return { result: 'already' };
  await requireApprover(r.employee_id); // 최고관리자는 본인 요청도 처리한다(권한-10) · 지점관리자는 맡은 지점 직원만, 자기 것은 못 한다

  let shiftId: string | null = null;
  if (b.decision === 'approved') {
    const { data: had } = await db.from('shifts').select('id').eq('employee_id', r.employee_id).eq('work_date', r.work_date).eq('start_time', r.start_time).eq('end_time', r.end_time).eq('active', true).limit(1);
    if (had?.length) shiftId = had[0].id;
    else {
      const { data: made, error } = await db
        .from('shifts')
        .insert({ employee_id: r.employee_id, work_date: r.work_date, start_time: r.start_time, end_time: r.end_time, kind: r.kind, template_id: null, note: r.reason, created_by: me.id, updated_by: me.id })
        .select('id')
        .single();
      if (error) throw new Error(`scheduleRequests.shift: ${error.code}`);
      shiftId = made.id;
    }
  }
  const { data: done, error } = await db.from('shift_requests').update({ status: b.decision, approved_by: me.id, decided_at: new Date().toISOString(), shift_id: shiftId }).eq('id', id).eq('status', 'pending').select('id');
  if (error) throw new Error(`scheduleRequests.decide: ${error.code}`);
  if (!done?.length) return { result: 'already' };
  const { error: e2 } = await db.from('decision_log').insert({ subject_table: 'shift_requests', subject_id: id, decision: b.decision, reason: rejectReasonOf(b), decided_by: me.id, request_id: ctx.requestId });
  if (e2) throw new Error(`scheduleRequests.log: ${e2.code}`);
  if (b.decision === 'approved') syncOvertimeFor(r.employee_id, [r.work_date]); // 승인으로 일정이 생겼다 (2026-10-19)
  after(() => notifyDecision('shift_requests', id)); // 결과를 요청한 직원 폰으로 (2026-10-21 의뢰인, 알림-12) — 실제로 바뀐 것만 보낸다
  return { result: 'ok' };
});
