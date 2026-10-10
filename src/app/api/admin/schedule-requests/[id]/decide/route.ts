// 근무일정 생성 요청 승인·거절 (의뢰인 2026-10-11). 승인: 그 날짜에 날짜별 일정을 한 건 만든다 (같은 직원·날짜·시각의 일정이 이미 있으면 그것을 쓴다). 거절: 만들지 않는다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { assertNotOwnRequest } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.scheduleRequests.decide', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  if (b.decision !== 'approved' && b.decision !== 'rejected') throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: r } = await db.from('shift_requests').select('id, employee_id, work_date, start_time, end_time, kind, reason, status').eq('id', id).maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  if (r.status !== 'pending') return { result: 'already' };
  await assertNotOwnRequest(me.id, r.employee_id); // 자기 요청은 다른 관리자가 처리한다

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
  const { error: e2 } = await db.from('decision_log').insert({ subject_table: 'shift_requests', subject_id: id, decision: b.decision, reason: null, decided_by: me.id, request_id: ctx.requestId });
  if (e2) throw new Error(`scheduleRequests.log: ${e2.code}`);
  return { result: 'ok' };
});
