// 직원의 「휴가 삭제 요청」 (의뢰인 2026-10-11: 시프티의 요청 › 휴가 삭제). 승인된 자기 휴가만 — 대기 중인 휴가는 그냥 취소하면 된다.
// 같은 휴가에 대기 중인 삭제 요청이 있으면 막는다. 관리자가 승인하면 그 휴가가 취소되고 잔여가 돌아온다.
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';

export const POST = api('leave.change.create', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  if (typeof b.leaveId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.leaveId)) throw new ApiError(400, 'invalid_input');
  const reason = cleanText(b.reason);
  if (reason.length < 1 || reason.length > 200) throw new ApiError(400, 'reason_required');
  const db = createAdminClient();
  const { data: lv } = await db.from('leave_requests').select('id, employee_id, status, is_test').eq('id', b.leaveId).maybeSingle();
  if (!lv || lv.employee_id !== me.id) throw new ApiError(404, 'not_found');
  if (lv.status !== 'approved') throw new ApiError(409, 'not_approved');
  const { data, error } = await db.from('leave_change_requests').insert({ leave_id: lv.id, employee_id: me.id, kind: 'delete', reason, is_test: lv.is_test }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'duplicate_request');
  if (error) throw new Error(`leave.change.create: ${error.code}`);
  return { id: data.id };
});
