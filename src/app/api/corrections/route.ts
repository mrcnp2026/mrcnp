// 직원의 정정 요청 (7-10, 4-8). 원본은 그대로, 정정 레코드만 pending으로 쌓는다.
// - add_missing: 찍지 않은 출근·퇴근 (예: 14일 퇴근을 21:40에 찍지 못함)
// - modify: 찍은 기록의 시각 수정 / void: 잘못 찍은 기록 무효
// 작성자·상태는 서버가 정한다 (요청 본문의 status·requested_by 무시). 같은 날·같은 대상의 대기 중 요청이 있으면 막는다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { assertNotConfirmed } from '@/lib/confirm-data';
import { isPeriodLocked } from '@/lib/punch';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';
import { kstDateTime, toKstDate } from '@/lib/time';

export const POST = api('corrections.create', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  const type = b.type;
  if (type !== 'add_missing' && type !== 'modify' && type !== 'void') throw new ApiError(400, 'invalid_input');
  const reason = cleanText(b.reason);
  if (reason.length < 1 || reason.length > 200) throw new ApiError(400, 'reason_required');
  const db = createAdminClient();
  const now = new Date();

  let workDate: string;
  let kind: 'in' | 'out';
  let targetId: string | null = null;

  if (type === 'add_missing') {
    if (typeof b.workDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.workDate)) throw new ApiError(400, 'invalid_input');
    if (b.kind !== 'in' && b.kind !== 'out') throw new ApiError(400, 'invalid_input');
    workDate = b.workDate;
    kind = b.kind;
  } else {
    if (typeof b.targetId !== 'string') throw new ApiError(400, 'invalid_input');
    const { data: ev } = await db.from('punch_events').select('id, employee_id, work_date, kind, is_test').eq('id', b.targetId).maybeSingle();
    if (!ev || ev.employee_id !== me.id || ev.is_test !== OFFICE.practiceMode) throw new ApiError(404, 'not_found');
    workDate = ev.work_date;
    kind = ev.kind;
    targetId = ev.id;
  }

  let newAt: Date | null = null;
  if (type !== 'void') {
    // 시각은 'HH:MM' (사무실 시간대). 자정 넘긴 퇴근이면 nextDay=true → 근무일 다음 날의 그 시각
    if (typeof b.time !== 'string' || !/^\d{2}:\d{2}$/.test(b.time)) throw new ApiError(400, 'invalid_input');
    newAt = kstDateTime(b.nextDay === true ? addDays(workDate, 1) : workDate, b.time);
    if (newAt > now) throw new ApiError(400, 'future_time');
  }
  if (workDate > toKstDate(now)) throw new ApiError(400, 'future_time');
  if (await isPeriodLocked(me.id, workDate)) throw new ApiError(409, 'period_locked');
  await assertNotConfirmed(me.id, workDate); // 확정된 날은 정정 요청을 받지 않는다 (의뢰인 2026-10-11)

  let dup = db
    .from('punch_corrections')
    .select('id')
    .eq('employee_id', me.id)
    .eq('work_date', workDate)
    .eq('status', 'pending')
    .eq('is_test', OFFICE.practiceMode);
  dup = targetId ? dup.eq('target_id', targetId) : dup.eq('kind', kind).is('target_id', null);
  const { data: existing } = await dup;
  if (existing?.length) throw new ApiError(409, 'duplicate_request');

  const { data, error } = await db
    .from('punch_corrections')
    .insert({
      correction_type: type,
      target_id: targetId,
      employee_id: me.id,
      work_date: workDate,
      kind,
      new_punched_at: newAt?.toISOString() ?? null,
      reason,
      requested_by: me.id,
      status: 'pending',
      is_test: OFFICE.practiceMode,
    })
    .select('id')
    .single();
  if (error) throw new Error(`corrections.insert: ${error.code}`);
  return { id: data.id };
});
