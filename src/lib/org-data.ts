// 조직도 읽기. 서버 전용.
import 'server-only';
import type { OrgGroup } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';

export async function loadOrgGroups(): Promise<OrgGroup[]> {
  const { data, error } = await createAdminClient().from('org_groups').select('id, name, parent_id, sort_order, active').order('sort_order').order('name');
  if (error) throw new Error(`loadOrgGroups: ${error.code}`);
  return (data ?? []).map((g) => ({ id: g.id, name: g.name, parentId: g.parent_id, sortOrder: g.sort_order, active: g.active }));
}

/** 직원에게 줄 수 있는 그룹인가 (있는 그룹이고 숨기지 않았다). null은 미배정 */
export async function assignableGroup(id: unknown): Promise<string | null | undefined> {
  if (id === undefined || id === null || id === '') return null;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const { data } = await createAdminClient().from('org_groups').select('id, active').eq('id', id).maybeSingle();
  return data?.active ? data.id : undefined;
}
