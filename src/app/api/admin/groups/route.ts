// 조직도 그룹 만들기 (맨 위 조직 또는 어느 조직의 하위 조직). 관리자만. 3단계 제한·같은 이름 중복은 DB가 막는다 (0013 · 0076).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { cleanGroupName } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = api('admin.groups.create', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const name = cleanGroupName(b.name);
  if (!name) throw new ApiError(400, 'invalid_group_name');
  const parentId = b.parentId === undefined || b.parentId === null || b.parentId === '' ? null : b.parentId;
  if (parentId !== null && (typeof parentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId))) throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  if (parentId) {
    // 최대 3단계: 맨 위(1) › 그 밑(2) › 그 밑(3). 3단계 조직 밑에는 더 만들 수 없다 (DB 트리거 org_groups_max_depth도 같은 규칙)
    const { data: parent } = await db.from('org_groups').select('id, parent_id, active').eq('id', parentId).maybeSingle();
    if (!parent || !parent.active) throw new ApiError(400, 'invalid_group');
    if (parent.parent_id) {
      const { data: up } = await db.from('org_groups').select('parent_id').eq('id', parent.parent_id).maybeSingle();
      if (up?.parent_id) throw new ApiError(400, 'too_deep');
    }
  }
  let q = db.from('org_groups').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null);
  const { data: last } = await q;
  const { data, error } = await db
    .from('org_groups')
    .insert({ name, parent_id: parentId, sort_order: (last?.[0]?.sort_order ?? 0) + 1, created_by: me.id, updated_by: me.id })
    .select('id')
    .single();
  if (error?.code === '23505') throw new ApiError(409, 'duplicate_group');
  if (error) throw new Error(`groups.create: ${error.code}`);
  return { id: data.id };
});
