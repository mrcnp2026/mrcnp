// 직원이 대기 중인 자기 근무일정 요청을 취소한다 — 지우지 않고 status='cancelled'.
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('scheduleRequests.cancel', async (req, ctx) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  if (b.cancel !== true) throw new ApiError(400, 'invalid_input');
  const { data, error } = await createAdminClient().from('shift_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', id).eq('employee_id', me.id).eq('status', 'pending').select('id');
  if (error) throw new Error(`scheduleRequests.cancel: ${error.code}`);
  if (!data?.length) return { result: 'already' };
  return { result: 'ok' };
});
