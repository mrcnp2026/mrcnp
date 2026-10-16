// 지금 보는 사람이 볼 수 있는 직원 범위. 서버 전용.
// 관리자 · 직원 · 로그인 없는 작업(정기 수집 등) = null(범위 제한 없음 — 직원 화면은 원래 자기 것만 읽는다).
// 지점관리자 = 맡은 지점의 직원 + 자기 자신.
// ★ 자료를 읽는 함수(loadPeriod · loadRequests · loadLeaveRequests · loadLeaveGrants · loadWorkRequests · pendingCounts)가 이 범위를 스스로 건다.
//   화면마다 따로 거르지 않게 해서, 한 화면에서 빠뜨려 다른 지점이 보이는 일을 막는다. 화면이 표를 직접 읽을 때는 inScope로 거른다.
import 'server-only';
import { cache } from 'react';
import { ApiError } from '@/lib/api';
import { getMe, type Me } from '@/lib/auth';
import { scopeIds } from '@/lib/manager-rules';
import { loadStaff } from '@/lib/staff-data';
import { approvalBlocked } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

/** 그 지점관리자가 맡은 지점 */
export async function loadManagedGroups(managerId: string): Promise<string[]> {
  const { data, error } = await createAdminClient().from('staff_manager_scopes').select('group_id').eq('manager_id', managerId).eq('active', true);
  if (error) throw new Error(`loadManagedGroups: ${error.code}`);
  return (data ?? []).map((r) => r.group_id as string);
}

async function managerScope(managerId: string): Promise<Set<string>> {
  const db = createAdminClient();
  const [managed, { data: groups }, { data: people }] = await Promise.all([loadManagedGroups(managerId), db.from('org_groups').select('id, parent_id'), db.from('profiles').select('id, group_id')]);
  return scopeIds({
    managerId,
    managed,
    groups: (groups ?? []).map((g) => ({ id: g.id as string, parentId: g.parent_id as string | null })),
    people: (people ?? []).map((p) => ({ id: p.id as string, groupId: p.group_id as string | null })),
  });
}

/** 지금 요청한 사람의 범위. null = 제한 없음 */
export const viewerScope = cache(async (): Promise<Set<string> | null> => {
  const me = await getMe();
  return me?.role === 'manager' ? managerScope(me.id) : null;
});

/** 표를 직접 읽은 화면이 줄을 거를 때 */
export async function scopeFilter(): Promise<(employeeId: string) => boolean> {
  const s = await viewerScope();
  return (id) => !s || s.has(id);
}
export const within = <T>(rows: T[], scope: Set<string> | null, idOf: (r: T) => string): T[] => (scope ? rows.filter((r) => scope.has(idOf(r))) : rows);

/**
 * 그 직원의 요청을 승인할 수 있는 사람 전원 — requireApprover와 같은 규칙 (폰 알림 받는 사람, 2026-10-16).
 * 본인은 빠진다(자기 요청 알림은 받지 않는다).
 */
export async function approverIdsFor(employeeId: string): Promise<string[]> {
  const all = await loadStaff();
  const target = all.find((s) => s.id === employeeId);
  if (!target) return [];
  const out: string[] = [];
  for (const actor of all) {
    if (actor.id === employeeId || !actor.active || (actor.role !== 'admin' && actor.role !== 'manager')) continue;
    if (approvalBlocked(actor, target, all)) continue;
    if (actor.role === 'manager' && !(await managerScope(actor.id)).has(employeeId)) continue;
    out.push(actor.id);
  }
  return out;
}

/** 관리 화면에 들어올 수 있는 사람 (관리자 · 지점관리자). 화면에서 고치는 버튼을 숨길지는 readOnly로 */
export async function requireStaffViewer(): Promise<{ me: Me; readOnly: boolean } | null> {
  const me = await getMe();
  if (!me || (me.role !== 'admin' && me.role !== 'manager')) return null;
  return { me, readOnly: me.role === 'manager' };
}

/**
 * 요청을 승인 · 거절할 수 있는 사람인가.
 *   관리자: 자기 요청은 다른 관리자가 있으면 못 한다(기존 규칙).
 *   지점관리자: 맡은 지점 직원의 요청만. 자기 요청은 못 한다(관리자가 처리한다).
 */
export async function requireApprover(employeeId: string): Promise<Me> {
  const me = await getMe();
  if (!me) throw new ApiError(403, 'forbidden');
  if (me.role !== 'admin' && me.role !== 'manager') throw new ApiError(403, 'forbidden');
  // 등급별 승인 규칙 (개발-39): 최고관리자 · 대표자 = 누구든 / 총괄관리자 = 최고 · 대표 것 못 함, 본인 것은 다른 관리자가 / 지점관리자 = 일반직원만
  const all = await loadStaff();
  const actor = all.find((s) => s.id === me.id);
  const target = all.find((s) => s.id === employeeId);
  if (!actor || !target) throw new ApiError(404, 'not_found');
  const blocked = approvalBlocked(actor, target, all);
  if (blocked) throw new ApiError(403, blocked);
  if (me.role === 'manager' && !(await managerScope(me.id)).has(employeeId)) throw new ApiError(403, 'out_of_scope');
  return me;
}
