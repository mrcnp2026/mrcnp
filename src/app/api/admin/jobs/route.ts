// 직무 만들기 (의뢰인 2026-10-10). 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { requireAdmin } from '@/lib/auth';
import { validateJob } from '@/lib/jobs';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('admin.jobs.create', async (req) => {
  await requireConsole(); // 통합설정 잠금 — 숫자 4자리로 연 관리자만 (2026-10-14 결정 사항 개발-29)
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const v = validateJob(await readJson(req));
  if (!v.ok) throw new ApiError(400, v.code);
  const { data, error } = await createAdminClient().from('jobs').insert({ name: v.value.name, color: v.value.color, created_by: me.id, updated_by: me.id }).select('id').single();
  if (error?.code === '23505') throw new ApiError(409, 'duplicate_job');
  if (error) throw new Error(`jobs.create: ${error.code}`);
  return { id: data.id };
});
