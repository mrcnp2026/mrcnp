// 직무 만들기 (의뢰인 2026-10-10). 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { validateJob } from '@/lib/jobs';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('admin.jobs.create', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const v = validateJob(await readJson(req));
  if (!v.ok) throw new ApiError(400, v.code);
  const { data, error } = await createAdminClient().from('jobs').insert({ name: v.value.name, color: v.value.color, created_by: me.id, updated_by: me.id }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'duplicate_job');
  if (error) throw new Error(`jobs.create: ${error.code}`);
  return { id: data.id };
});
