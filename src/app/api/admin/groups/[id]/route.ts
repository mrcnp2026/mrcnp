// 조직도 그룹 고치기: 이름 바꾸기 · 숨기기/다시 쓰기. 지우지 않는다 (4-6).
// 직원이 속해 있거나 쓰는 팀이 남은 그룹은 숨길 수 없다 — 먼저 직원 소속을 옮긴다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { cleanGroupName } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.groups.update', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  const db = createAdminClient();
  const { data: g } = await db.from('org_groups').select('id, parent_id, active').eq('id', id).maybeSingle();
  if (!g) throw new ApiError(404, 'not_found');

  const patch: Record<string, unknown> = { updated_by: me.id };
  if (b.name !== undefined) {
    const name = cleanGroupName(b.name);
    if (!name) throw new ApiError(400, 'invalid_group_name');
    patch.name = name;
  }
  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') throw new ApiError(400, 'invalid_input');
    if (!b.active) {
      const [{ count: members }, { count: teams }] = await Promise.all([
        db.from('profiles').select('id', { count: 'exact', head: true }).eq('group_id', id).eq('active', true),
        db.from('org_groups').select('id', { count: 'exact', head: true }).eq('parent_id', id).eq('active', true),
      ]);
      if ((members ?? 0) > 0 || (teams ?? 0) > 0) throw new ApiError(409, 'group_in_use');
    } else if (g.parent_id) {
      const { data: parent } = await db.from('org_groups').select('active').eq('id', g.parent_id).maybeSingle();
      if (!parent?.active) throw new ApiError(409, 'parent_hidden');
    }
    patch.active = b.active;
  }
  if (Object.keys(patch).length === 1) throw new ApiError(400, 'invalid_input');
  const { error } = await db.from('org_groups').update(patch).eq('id', id);
  if (error?.code === '23505') throw new ApiError(409, 'duplicate_group');
  if (error) throw new Error(`groups.update: ${error.code}`);
  return { ok: true };
});
