// 지점관리자 (의뢰인 2026-10-13, 결정 사항 개발-19). 순수함수.
// 지점관리자는 맡은 지점 직원의 기록 · 근무일정 · 휴가를 보고 요청을 승인/거절한다. 그 밖의 일(추가 · 수정 · 확정 · 마감 · 급여 · 설정)은 못 한다.
// ★ 기본은 「거부」다 — 아래 목록에 있는 화면만 열 수 있고, 서버 처리는 요청 결정 7개만 열려 있다(requireApprover).
export type Role = 'admin' | 'manager' | 'employee';
export const isRole = (v: unknown): v is Role => v === 'admin' || v === 'manager' || v === 'employee';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const OPEN = [/^\/admin\/search$/, /^\/admin\/inbox$/, /^\/admin\/records$/, /^\/admin\/records\/list$/, /^\/admin\/records\/calendar$/, new RegExp(`^/admin/records/${UUID}$`, 'i'), new RegExp(`^/admin/records/${UUID}/\\d{4}-\\d{2}-\\d{2}$`, 'i'), /^\/admin\/schedule$/, new RegExp(`^/admin/schedule/${UUID}/\\d{4}-\\d{2}-\\d{2}$`, 'i'), /^\/admin\/leave$/, new RegExp(`^/admin/leave/req/${UUID}$`, 'i'), new RegExp(`^/admin/leave/emp/${UUID}$`, 'i'), /^\/admin\/missing$/];
export const MANAGER_HOME = '/admin/inbox';

/** 지점관리자가 열 수 있는 관리 화면인가 */
export function managerCanOpen(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return OPEN.some((r) => r.test(p));
}

/** 맡은 지점 → 그 밑의 팀까지 (부서를 맡기면 소속 팀도 포함) */
export function expandGroups(groups: readonly { id: string; parentId: string | null }[], ids: readonly string[]): Set<string> {
  const out = new Set(ids);
  for (const g of groups) if (g.parentId && out.has(g.parentId)) out.add(g.id);
  return out;
}

/** 맡은 지점에 속한 직원 + 자기 자신(자기 기록은 늘 본다). 지점이 없는 직원은 누구의 범위에도 들지 않는다 */
export function scopeIds(args: { managerId: string; people: readonly { id: string; groupId: string | null }[]; groups: readonly { id: string; parentId: string | null }[]; managed: readonly string[] }): Set<string> {
  const g = expandGroups(args.groups, args.managed);
  return new Set([args.managerId, ...args.people.filter((p) => p.groupId && g.has(p.groupId)).map((p) => p.id)]);
}
