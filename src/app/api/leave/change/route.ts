// 직원의 「휴가 삭제 요청」 (의뢰인 2026-10-11: 시프티의 요청 › 휴가 삭제) · 「휴가 정정 요청」 (2026-10-23: 승인된 휴가의 종류 · 날짜 · 시작 시각을 바꿔 달라).
// 승인된 자기 휴가만 — 대기 중인 휴가는 그냥 취소하면 된다. 같은 휴가에 대기 중인 요청이 있으면 막는다.
// 삭제: 관리자가 승인하면 그 휴가가 취소되고 잔여가 돌아온다. 정정: 승인하면 기존 휴가를 취소하고 새 내용의 휴가가 승인으로 만들어진다(decide 길).
// 정정의 새 내용은 지금 보낼 때 신청과 같은 검사(planLeave)를 먼저 통과해야 한다 — 안 되는 날짜는 요청 자체가 안 간다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { assertAttendanceEditable } from '@/lib/confirm-data';
import { planLeave } from '@/lib/leave-request';
import { requireSwitch } from '@/lib/switches';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';

export const POST = api('leave.change.create', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  await requireSwitch('request.leaveDelete'); // 통합설정 › 요청 스위치 (2026-10-19) — 삭제 · 정정 요청을 같이 켜고 끈다
  const b = await readJson(req);
  if (typeof b.leaveId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.leaveId)) throw new ApiError(400, 'invalid_input');
  const reason = cleanText(b.reason);
  if (reason.length < 1 || reason.length > 200) throw new ApiError(400, 'reason_required');
  const db = createAdminClient();
  const { data: lv } = await db.from('leave_requests').select('id, employee_id, status, start_date, end_date, is_test').eq('id', b.leaveId).maybeSingle();
  if (!lv || lv.employee_id !== me.id) throw new ApiError(404, 'not_found');
  if (lv.status !== 'approved') throw new ApiError(409, 'not_approved');

  let fields: Record<string, unknown> = { kind: 'delete' };
  if (b.kind === 'change') {
    const plan = await planLeave(me.id, b, { ignoreId: lv.id }); // 새 내용 검사 — 자기 휴가는 겹침에서 뺀다
    await assertAttendanceEditable(me.id, lv.start_date, lv.end_date, OFFICE.practiceMode);
    await assertAttendanceEditable(me.id, plan.start, plan.end, OFFICE.practiceMode);
    fields = { kind: 'change', new_type_code: plan.typeCode, new_start_date: plan.start, new_end_date: plan.end, new_start_time: plan.startTime };
  }
  const { data, error } = await db.from('leave_change_requests').insert({ leave_id: lv.id, employee_id: me.id, reason, is_test: lv.is_test, ...fields }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'duplicate_request');
  if (error) throw new Error(`leave.change.create: ${error.code}`);
  return { id: data.id };
});
