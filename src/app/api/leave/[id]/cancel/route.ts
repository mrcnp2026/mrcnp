// 직원 본인 휴가 신청 취소 — 대기 중인 것만. 승인된 휴가는 관리자가 취소한다 (4-6).
import { api, ApiError } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('leave.cancel', async (_req, ctx) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const { id } = await ctx.params;
  const { data, error } = await createAdminClient().rpc('cancel_leave', { p_id: id, p_employee: me.id });
  if (error) throw new Error(`cancel_leave: ${error.code}`);
  if (data === 'not_found') throw new ApiError(404, 'not_found');
  return { result: data };
});
