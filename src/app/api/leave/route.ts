// 직원의 휴가 신청 (②-2 7-3, 4-7·4-11). 일수·상태·작성자는 서버가 정한다 (요청 본문의 days·status 무시).
// 사유는 선택 (4-7). 차감 대상(연차·반차·반반차)은 잔여 − 대기보다 많이 신청할 수 없다. 검사는 lib/leave-request.ts (최고관리자 직권 추가와 같이 쓴다).
import { after } from 'next/server';
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { planLeave } from '@/lib/leave-request';
import { notifyLeaveRequest } from '@/lib/push-events';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('leave.create', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  const { typeCode, start, end, startTime, endTime, workDates, days, reason } = await planLeave(me.id, b);

  const { data, error } = await createAdminClient()
    .from('leave_requests')
    .insert({
      employee_id: me.id, type_code: typeCode, work_dates: workDates, start_date: start, end_date: end, days, reason: reason || null, start_time: startTime, end_time: endTime,
      status: 'pending', requested_by: me.id, is_test: OFFICE.practiceMode,
    })
    .select('id')
    .single();
  if (error?.code === 'PGRST204' || error?.code === '42703') throw new ApiError(503, 'db_update_required');
  if (error?.code === 'P0001' && ['duplicate_request','day_confirmed','period_locked'].includes(error.message)) throw new ApiError(409, error.message);
  if (error) throw new Error(`leave.insert: ${error.code}`);
  after(() => notifyLeaveRequest(data.id)); // 승인할 관리자 폰 알림 — 응답을 돌려준 뒤에 보낸다
  return { id: data.id, days };
});
