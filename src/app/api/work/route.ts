// 직원의 외근·출장·재택 신청 (②-3 7-11). 사후 신청도 받는다(한 달 안) — 잠긴 달은 불가.
// 장소 필수, 사유 선택 (요점 5). 상태·작성자는 서버가 정한다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { isPeriodLocked } from '@/lib/punch';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';
import { toKstDate } from '@/lib/time';
import { loadWorkRequests } from '@/lib/work-data';
import { WORK_KINDS, type WorkKind } from '@/lib/work-requests';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export const POST = api('work.create', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  if (!WORK_KINDS.includes(b.kind as WorkKind)) throw new ApiError(400, 'invalid_input');
  const kind = b.kind as WorkKind;
  const start = typeof b.startDate === 'string' && DATE.test(b.startDate) ? b.startDate : null;
  const end = typeof b.endDate === 'string' && DATE.test(b.endDate) ? b.endDate : start;
  if (!start || !end || end < start) throw new ApiError(400, 'invalid_input');
  if (end > addDays(start, 30)) throw new ApiError(400, 'range_too_long');
  const today = toKstDate(new Date());
  if (start < addDays(today, -31)) throw new ApiError(400, 'too_old');
  // 반나절: 하루짜리만, 시작 < 끝
  const st = typeof b.startTime === 'string' && TIME.test(b.startTime) ? b.startTime : null;
  const et = typeof b.endTime === 'string' && TIME.test(b.endTime) ? b.endTime : null;
  if (!!st !== !!et || (st && et && (st >= et || start !== end))) throw new ApiError(400, 'invalid_time');
  const place = cleanText(b.place);
  if (place.length < 1 || place.length > 100) throw new ApiError(400, 'place_required');
  const reason = cleanText(b.reason);
  if (reason.length > 200) throw new ApiError(400, 'invalid_input');
  if (await isPeriodLocked(me.id, start)) throw new ApiError(409, 'period_locked');

  const mine = await loadWorkRequests({ employeeId: me.id, from: start, to: end });
  if (mine.some((r) => r.status === 'pending' || r.status === 'approved')) throw new ApiError(409, 'duplicate_request');

  const { data, error } = await createAdminClient()
    .from('work_requests')
    .insert({
      employee_id: me.id, kind, start_date: start, end_date: end, start_time: st, end_time: et, place, reason: reason || null,
      status: 'pending', requested_by: me.id, is_test: OFFICE.practiceMode,
    })
    .select('id')
    .single();
  if (error) throw new Error(`work.insert: ${error.code}`);
  return { id: data.id };
});
