// 날짜별 근무일정 취소 — 지우지 않고 active=false (4-6, 변경 기록에 남는다). 취소하면 그날은 평소 틀·회사 규칙으로 돌아간다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.schedule.cancel', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  if (b.active !== false) throw new ApiError(400, 'invalid_input');
  const { data, error } = await createAdminClient().from('shifts').update({ active: false, updated_by: me.id }).eq('id', id).eq('active', true).select('id');
  if (error) throw new Error(`schedule.cancel: ${error.code}`);
  if (!data?.length) throw new ApiError(404, 'not_found');
  return { ok: true };
});
