// 근무일정 틀 만들기 (의뢰인 2026-10-10). 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { validateTemplate } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('admin.shifts.create', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const v = validateTemplate(await readJson(req));
  if (!v.ok) throw new ApiError(400, v.code);
  const t = v.value;
  const { data, error } = await createAdminClient()
    .from('shift_templates')
    .insert({ name: t.name, start_time: t.startTime, end_time: t.endTime, kind: t.kind, color: t.color, memo: t.memo, created_by: me.id, updated_by: me.id })
    .select('id')
    .single();
  if (error?.code === '23505') throw new ApiError(409, 'duplicate_template');
  if (error) throw new Error(`shifts.create: ${error.code}`);
  return { id: data.id };
});
