// 지점관리자가 맡는 지점 저장 (개발-19) — 보낸 목록이 곧 맡는 지점 전부. 빠진 지점은 끄고(지우지 않는다) 새 지점은 넣는다.
// 지점 고르기 칸(manager-scope) · 등급 저장(grade, 2026-11-03: 지점관리자를 고르면 지점까지 한 번에)이 같이 쓴다. 서버 전용.
import 'server-only';
import { ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

export async function saveManagerScope(id: string, groupIds: string[], actorId: string): Promise<string[]> {
  const want = [...new Set(groupIds)];
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
    const r = await db.from('staff_manager_scopes').update({ active: false, updated_by: actorId }).in('id', off);
    if (r.error) throw new Error(`managerScope.off: ${r.error.code}`);
  }
  if (add.length) {
    const r = await db.from('staff_manager_scopes').insert(add.map((g) => ({ manager_id: id, group_id: g, created_by: actorId })));
    if (r.error && r.error.code !== '23505') throw new Error(`managerScope.add: ${r.error.code}`);
  }
  return want;
}
