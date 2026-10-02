// 직원이 자기 연장 확인 요청에 사유를 적는다 (6장: 사유 입력은 서버 API로만). 결정 전(pending)만.
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';

export const POST = api<{ params: Promise<{ id: string }> }>('overtime.reason', async (req, ctx) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const { id } = await ctx.params;
  const { reason } = await readJson(req);
  const text = cleanText(reason);
  if (text.length < 1 || text.length > 200) throw new ApiError(400, 'note_length');
  const { data, error } = await createAdminClient()
    .from('overtime_requests')
    .update({ reason: text })
    .eq('id', id)
    .eq('employee_id', me.id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw new Error(`overtime.reason: ${error.code}`);
  if (!data?.length) throw new ApiError(409, 'already');
  return { ok: true };
});
