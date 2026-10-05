// 직원 관리 규칙 (부록 R-2, ②-2 7-2, ②-3 7-12) — 해도 되는지 판단. 순수함수.
// ★ 자기 자신의 재직 상태·권한·폰 등록은 스스로 바꾸지 못한다 (자기 잠금·자기 승격을 막는다).
// ★ 활성 관리자가 MIN_ADMINS명 미만이 되는 변경은 차단한다 (퇴사·관리자 해제).
// ★ 급여 담당자는 급여 담당자만 지정·해제하고, 0명이 되는 변경은 차단한다 (R-2의 7).
// ⚠️ "두 번째 관리자 확인"(R-2의 8)은 아직 없다 — 관리자가 2명 이상이 된 뒤 따로 붙인다.

export const MIN_ADMINS = 2;
export const REASON_MIN = 2;
export const REASON_MAX = 200;

export type Staff = { id: string; role: 'admin' | 'employee'; active: boolean; canViewPayroll: boolean };
export type StaffRuleCode =
  | 'self_change' // 본인 것은 스스로 못 바꾼다
  | 'already' // 이미 그 상태
  | 'employee_inactive' // 비활성 직원에게는 권한을 줄 수 없다
  | 'min_admins' // 관리자가 2명 미만이 된다
  | 'min_payroll' // 급여 담당자가 0명이 된다
  | 'payroll_only_grant' // 급여 담당자만 급여 담당을 지정·해제한다
  | 'payroll_needs_admin'; // 급여 담당은 관리자여야 한다

const admins = (all: Staff[]) => all.filter((s) => s.active && s.role === 'admin');
const viewers = (all: Staff[]) => admins(all).filter((s) => s.canViewPayroll);

/** target을 next 상태로 바꾼 뒤에도 관리자·급여 담당자 하한이 지켜지는가 */
function floors(all: Staff[], target: Staff, next: Staff): StaffRuleCode | null {
  const after = all.map((s) => (s.id === target.id ? next : s));
  const wasAdmin = target.active && target.role === 'admin';
  const isAdmin = next.active && next.role === 'admin';
  if (wasAdmin && !isAdmin && admins(after).length < MIN_ADMINS) return 'min_admins';
  const wasViewer = wasAdmin && target.canViewPayroll;
  const isViewer = isAdmin && next.canViewPayroll;
  if (wasViewer && !isViewer && viewers(after).length < 1) return 'min_payroll';
  return null;
}

export function checkResign(actorId: string, target: Staff, all: Staff[]): StaffRuleCode | null {
  if (target.id === actorId) return 'self_change';
  if (!target.active) return 'already';
  return floors(all, target, { ...target, active: false });
}

export function checkReinstate(actorId: string, target: Staff): StaffRuleCode | null {
  if (target.id === actorId) return 'self_change';
  return target.active ? 'already' : null;
}

/** 관리자 지정·해제, 급여 담당 지정·해제. 바꾸지 않는 값은 undefined */
export function checkRoleChange(args: { actor: Staff; target: Staff; all: Staff[]; role?: 'admin' | 'employee'; canViewPayroll?: boolean }): { code: StaffRuleCode } | { next: Staff } {
  const { actor, target, all } = args;
  if (target.id === actor.id) return { code: 'self_change' };
  if (!target.active) return { code: 'employee_inactive' };
  const role = args.role ?? target.role;
  // 관리자에서 내려오면 급여 담당도 함께 내려온다
  const canViewPayroll = role === 'admin' ? (args.canViewPayroll ?? target.canViewPayroll) : false;
  if (args.canViewPayroll === true && role !== 'admin') return { code: 'payroll_needs_admin' };
  if (role === target.role && canViewPayroll === target.canViewPayroll) return { code: 'already' };
  if (canViewPayroll !== target.canViewPayroll && !actor.canViewPayroll) return { code: 'payroll_only_grant' };
  const next = { ...target, role, canViewPayroll };
  const floor = floors(all, target, next);
  return floor ? { code: floor } : { next };
}

/** 폰 등록 해제: 자기 폰은 스스로 해제하지 못한다 (R-2의 2). 다른 관리자가 한다 */
export function checkPhoneRevoke(actorId: string, targetId: string): StaffRuleCode | null {
  return actorId === targetId ? 'self_change' : null;
}

export function cleanReason(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  return s.length >= REASON_MIN && s.length <= REASON_MAX ? s : null;
}
