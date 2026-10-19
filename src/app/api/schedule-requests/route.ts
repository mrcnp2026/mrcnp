// 직원의 「근무일정 생성 요청」 (의뢰인 2026-10-11: 시프티의 근무일정 요청 — 특근·잔업·하루만 다른 시각).
// 오늘부터의 날짜만. 작성자·상태는 서버가 정한다. 같은 날·같은 시각의 대기 중 요청이 있으면 막는다. 승인되면 날짜별 일정이 만들어진다.
import { syncOvertimeFor } from '@/lib/period-data';
import { OFFICE } from '@/config/office';
import { rethrowDbRule } from '@/lib/atomic-rpc';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { requireSwitch } from '@/lib/switches';
import { validateShift } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';
import { toKstDate } from '@/lib/time';
import { getSettingAt } from '@/lib/settings';
import { isPeriodLocked } from '@/lib/punch';

export const POST = api('scheduleRequests.create', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  await requireSwitch('request.shift'); // 통합설정 › 요청 스위치 (2026-10-19)
  const b = await readJson(req);
  const v = validateShift({ date: b.date, startTime: b.startTime, endTime: b.endTime, kind: b.kind, note: '', employeeIds: [me.id] });
  if (!v.ok) throw new ApiError(400, v.code);
  if (v.value.kind === 'deemed') throw new ApiError(400, 'invalid_input'); // 간주 근무는 관리자가 템플릿으로 정한다
  if (v.value.date < toKstDate(new Date())) throw new ApiError(400, 'past_date');
  const reason = cleanText(b.reason);
  if (reason.length < 1 || reason.length > 200) throw new ApiError(400, 'reason_required');
  const db = createAdminClient();
  const { data: dup } = await db.from('shift_requests').select('id').eq('employee_id', me.id).eq('work_date', v.value.date).eq('start_time', v.value.startTime).eq('end_time', v.value.endTime).eq('status', 'pending').eq('is_test', OFFICE.practiceMode).limit(1);
  if (dup?.length) throw new ApiError(409, 'duplicate_request');
  // 직접 확정 방식(통합설정 › 요청 설정)이면 승인 없이 일정을 만들고 요청은 「승인」으로 남긴다 — 누가 언제 만들었는지는 그대로 기록된다
  const direct = (await getSettingAt('schedule.request_mode', v.value.date)) === 'direct';
  if (direct && (await isPeriodLocked(me.id, v.value.date))) throw new ApiError(409, 'period_locked');
  let shiftId: string | null = null;
  if (direct) {
    const { data: had } = await db.from('shifts').select('id').eq('employee_id', me.id).eq('work_date', v.value.date).eq('start_time', v.value.startTime).eq('end_time', v.value.endTime).eq('active', true).limit(1);
    if (had?.length) shiftId = had[0].id as string;
    else {
      const { data: made, error: e0 } = await db.from('shifts').insert({ employee_id: me.id, work_date: v.value.date, start_time: v.value.startTime, end_time: v.value.endTime, kind: v.value.kind, template_id: null, note: reason, created_by: me.id, updated_by: me.id }).select('id').single();
      rethrowDbRule(e0);
      if (e0) throw new Error(`scheduleRequests.direct: ${e0.code}`);
      shiftId = made.id as string;
    }
  }
  const { data, error } = await db
    .from('shift_requests')
    .insert({ employee_id: me.id, work_date: v.value.date, start_time: v.value.startTime, end_time: v.value.endTime, kind: v.value.kind, reason, is_test: OFFICE.practiceMode, ...(direct ? { status: 'approved', approved_by: me.id, decided_at: new Date().toISOString(), shift_id: shiftId } : {}) })
    .select('id')
    .single();
  if (error) throw new Error(`scheduleRequests.create: ${error.code}`);
  if (direct) await db.from('decision_log').insert({ subject_table: 'shift_requests', subject_id: data.id, decision: 'approved', reason: 'direct', decided_by: me.id, request_id: null });
  if (direct) syncOvertimeFor(me.id, [v.value.date]); // 바로 반영 방식이면 일정이 생겼다
  return { id: data.id, direct };
});
