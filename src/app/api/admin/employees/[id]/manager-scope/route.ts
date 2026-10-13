// 지점관리자가 맡는 지점 지정 (의뢰인 2026-10-13, 결정 사항 개발-19). 관리자만.
// 보낸 목록이 곧 맡는 지점 전부다 — 빠진 지점은 끄고(지우지 않는다) 새 지점은 넣는다. 누가 바꿨는지는 변경 기록에 남는다.
// 부서를 맡기면 그 밑의 팀도 포함된다(펼치는 것은 읽을 때 한다 — manager-rules.ts).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f-]{36}$/i;

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.managerScope', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (!UUID.test(id) || !Array.isArray(b.groupIds) || b.groupIds.length > 200 || !b.groupIds.every((x) => typeof x === 'string' && UUID.test(x))) throw new ApiError(400, 'invalid_input');
  const want = [...new Set(b.groupIds as string[])];
  const db = createAdminClient();
  const [{ data: p }, { data: groups }, { data: cur, error }] = await Promise.all([
    db.from('profiles').select('id, role').eq('id', id).maybeSingle(),
    db.from('org_groups').select('id').eq('active', true),
    db.from('staff_manager_scopes').select('id, group_id').eq('manager_id', id).eq('active', true),
  ]);
  if (error) throw new Error(`managerScope.load: ${error.code}`);
  if (!p) throw new ApiError(404, 'not_found');
  if (p.role !== 'manager') throw new ApiError(409, 'not_manager'); // 지점관리자로 지정된 뒤에 지점을 고른다
  const known = new Set((groups ?? []).map((g) => g.id as string));
  if (!want.every((g) => known.has(g))) throw new ApiError(400, 'invalid_input');
  const have = new Map((cur ?? []).map((r) => [r.group_id as string, r.id as string]));
  const off = [...have].filter(([g]) => !want.includes(g)).map(([, rowId]) => rowId);
  const add = want.filter((g) => !have.has(g));
  if (off.length) {
    const r = await db.from('staff_manager_scopes').update({ active: false, updated_by: me.id }).in('id', off);
    if (r.error) throw new Error(`managerScope.off: ${r.error.code}`);
  }
  if (add.length) {
    const r = await db.from('staff_manager_scopes').insert(add.map((g) => ({ manager_id: id, group_id: g, created_by: me.id })));
    if (r.error && r.error.code !== '23505') throw new Error(`managerScope.add: ${r.error.code}`);
  }
  return { ok: true, groupIds: want };
});
