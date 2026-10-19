// 직원 한 명의 근무일정 틀 바꾸기 (2026-10-19 의뢰인: 직원 화면에서 근무 방식(일반 · 간주)을 바로 고른다).
// 틀을 만들고 시각을 고치는 것은 그대로 통합설정 › 근무일정 템플릿. { templateId: 틀 id | null(틀 없음 = 회사 근무규칙) }
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { assertStaffTarget } from '@/lib/staff-data';
import { syncStaffHistorySafe } from '@/lib/staff-history';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.shift', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  await assertStaffTarget(me.id, id);
  const b = await readJson(req);
  const templateId = b.templateId === null || b.templateId === '' ? null : typeof b.templateId === 'string' && UUID.test(b.templateId) ? b.templateId : undefined;
  if (templateId === undefined) throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  if (templateId) {
    const { data: tpl } = await db.from('shift_templates').select('active').eq('id', templateId).maybeSingle();
    if (!tpl) throw new ApiError(404, 'not_found');
    if (!tpl.active) throw new ApiError(409, 'template_off');
  }
  const { data, error } = await db.from('profiles').update({ shift_template_id: templateId, updated_by: me.id }).eq('id', id).eq('active', true).select('id');
  if (error) throw new Error(`profiles.shift_template_id: ${error.code}`);
  if (!data?.length) throw new ApiError(404, 'not_found');
  await syncStaffHistorySafe(id, me.id);
  return { ok: true };
});
