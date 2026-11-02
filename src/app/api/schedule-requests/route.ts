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
  // 2026-11-03 의뢰인: dates(여러 날짜, 최대 62일)를 주면 날짜마다 요청 한 건씩 — 달력에서 시작 · 끝을 눌러 기간으로. 같은 날 대기 중인 같은 요청은 건너뛴다
  const dates: unknown[] = Array.isArray(b.dates) && b.dates.length ? [...new Set(b.dates as unknown[])] : [b.date];
  if (dates.length > 62) throw new ApiError(400, 'invalid_input');
  const checked = dates.map((d) => validateShift({ date: d, startTime: b.startTime, endTime: b.endTime, kind: b.kind, note: '', employeeIds: [me.id] }));
  for (const v of checked) if (!v.ok) throw new ApiError(400, v.code);
  const items = checked.map((v) => (v as Extract<typeof v, { ok: true }>).value).sort((x, y) => x.date.localeCompare(y.date));
  if (items[0].kind === 'deemed') throw new ApiError(400, 'invalid_input'); // 간주 근무는 관리자가 템플릿으로 정한다
  if (items[0].date < toKstDate(new Date())) throw new ApiError(400, 'past_date');
  const reason = cleanText(b.reason);
  if (reason.length < 1 || reason.length > 200) throw new ApiError(400, 'reason_required');
  const db = createAdminClient();
  let lastId: string | null = null;
  let anyDirect = false;
  let made = 0;
  for (const v of items) {
    const { data: dup } = await db.from('shift_requests').select('id').eq('employee_id', me.id).eq('work_date', v.date).eq('start_time', v.startTime).eq('end_time', v.endTime).eq('status', 'pending').eq('is_test', OFFICE.practiceMode).limit(1);
    if (dup?.length) {
      if (items.length === 1) throw new ApiError(409, 'duplicate_request');
      continue;
    }
    // 직접 확정 방식(통합설정 › 요청 설정)이면 승인 없이 일정을 만들고 요청은 「승인」으로 남긴다 — 누가 언제 만들었는지는 그대로 기록된다
    const direct = (await getSettingAt('schedule.request_mode', v.date)) === 'direct';
    if (direct && (await isPeriodLocked(me.id, v.date))) throw new ApiError(409, 'period_locked');
    let shiftId: string | null = null;
    if (direct) {
      const { data: had } = await db.from('shifts').select('id').eq('employee_id', me.id).eq('work_date', v.date).eq('start_time', v.startTime).eq('end_time', v.endTime).eq('active', true).limit(1);
      if (had?.length) shiftId = had[0].id as string;
      else {
        const { data: sh, error: e0 } = await db.from('shifts').insert({ employee_id: me.id, work_date: v.date, start_time: v.startTime, end_time: v.endTime, kind: v.kind, template_id: null, note: reason, created_by: me.id, updated_by: me.id }).select('id').single();
        rethrowDbRule(e0);
        if (e0) throw new Error(`scheduleRequests.direct: ${e0.code}`);
        shiftId = sh.id as string;
      }
    }
    const { data, error } = await db
      .from('shift_requests')
      .insert({ employee_id: me.id, work_date: v.date, start_time: v.startTime, end_time: v.endTime, kind: v.kind, reason, is_test: OFFICE.practiceMode, ...(direct ? { status: 'approved', approved_by: me.id, decided_at: new Date().toISOString(), shift_id: shiftId } : {}) })
      .select('id')
      .single();
    if (error) throw new Error(`scheduleRequests.create: ${error.code}`);
    if (direct) await db.from('decision_log').insert({ subject_table: 'shift_requests', subject_id: data.id, decision: 'approved', reason: 'direct', decided_by: me.id, request_id: null });
    if (direct) anyDirect = true;
    lastId = data.id as string;
    made++;
  }
  if (made === 0) throw new ApiError(409, 'duplicate_request');
  if (anyDirect) syncOvertimeFor(me.id, items.map((v) => v.date)); // 바로 반영 방식이면 일정이 생겼다
  return { id: lastId, direct: anyDirect, created: made };
});
