// 직원 관리 규칙 (부록 R-2, ②-2 7-2, ②-3 7-12) — 해도 되는지 판단. 순수함수.
// ★ 자기 자신의 재직 상태·권한은 스스로 바꾸지 못하고, 로그인 초기화도 스스로 못 한다 (자기 잠금·자기 승격을 막는다).
// ★ 활성 관리자가 MIN_ADMINS명 미만이 되는 변경은 차단한다 (퇴사·관리자 해제).
// ★ 급여 담당자는 급여 담당자만 지정·해제하고, 0명이 되는 변경은 차단한다 (R-2의 7).
// ★ 권한 변경은 두 번째 관리자가 확인해야 반영된다 (R-2의 8) — 확인해 줄 다른 관리자가 있을 때만. 혼자면 바로 반영한다.
// ★ 오너(owner, 2026-10-06 의뢰인): 다른 관리자의 확인 없이 권한을 바꾸고, 자기 요청을 직접 처리하고, 자기 출퇴근 기기를 직접 해제한다.
//   다른 관리자는 오너의 권한·재직 상태·로그인을 바꾸지 못한다 (owner_only). 오너라도 자기 권한 내리기·자기 퇴사·자기 로그인 초기화는 못 한다 — 스스로 잠기는 것을 막는다.

export const MIN_ADMINS = 2;
export const REASON_MIN = 2;
export const REASON_MAX = 200;

// 권한 5단계 (2026-10-15 의뢰인, 결정 사항 개발-39 · DB 묶음 11): 관리자 안의 구분 level — super 최고관리자 · ceo 대표자 · general 총괄관리자.
//   owner = 최고관리자 또는 대표자(「최상위」) — 모든 승인 · 수정, 본인 것도. 각 1명.
export type AdminLevel = 'super' | 'ceo' | 'general';
export type Staff = { id: string; role: 'admin' | 'manager' | 'employee'; active: boolean; canViewPayroll: boolean; owner?: boolean; level?: AdminLevel | null };
export type StaffRuleCode =
  | 'self_change' // 본인 것은 스스로 못 바꾼다
  | 'already' // 이미 그 상태
  | 'employee_inactive' // 비활성 직원에게는 권한을 줄 수 없다
  | 'min_admins' // 관리자가 2명 미만이 된다
  | 'min_payroll' // 급여 담당자가 0명이 된다
  | 'payroll_only_grant' // 급여 담당자만 급여 담당을 지정·해제한다
  | 'payroll_needs_admin' // 급여 담당은 관리자여야 한다
  | 'owner_only' // 최고관리자 · 대표자 계정은 최고관리자 · 대표자만 바꾼다
  | 'rank'; // 내 등급으로 처리할 수 없는 사람의 요청

const isOwner = (all: Staff[], id: string) => all.some((s) => s.id === id && s.owner && s.active);

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
  if (target.owner && !isOwner(all, actorId)) return 'owner_only';
  if (!target.active) return 'already';
  return floors(all, target, { ...target, active: false });
}

export function checkReinstate(actorId: string, target: Staff): StaffRuleCode | null {
  if (target.id === actorId) return 'self_change';
  return target.active ? 'already' : null;
}

/** 관리자 지정·해제, 급여 담당 지정·해제. 바꾸지 않는 값은 undefined */
export function checkRoleChange(args: { actor: Staff; target: Staff; all: Staff[]; role?: 'admin' | 'manager' | 'employee'; canViewPayroll?: boolean }): { code: StaffRuleCode } | { next: Staff } {
  const { actor, target, all } = args;
  if (target.id === actor.id) return { code: 'self_change' };
  if (target.owner && !actor.owner) return { code: 'owner_only' };
  if (!target.active) return { code: 'employee_inactive' };
  const role = args.role ?? target.role;
  // 관리자에서 내려오면 급여 담당도 함께 내려온다
  const canViewPayroll = role === 'admin' ? (args.canViewPayroll ?? target.canViewPayroll) : false;
  if (args.canViewPayroll === true && role !== 'admin') return { code: 'payroll_needs_admin' };
  if (role === target.role && canViewPayroll === target.canViewPayroll) return { code: 'already' };
  if (canViewPayroll !== target.canViewPayroll && !actor.canViewPayroll && !actor.owner) return { code: 'payroll_only_grant' };
  const next = { ...target, role, canViewPayroll };
  const floor = floors(all, target, next);
  return floor ? { code: floor } : { next };
}

/** 로그인 초기화(예전의 폰 등록 해제): 자기 것은 스스로 못 한다 (R-2의 2). 다른 관리자가 한다. 비밀번호 변경은 본인이 「내 계정」에서 한다 */
export function checkPhoneRevoke(actorId: string, targetId: string, all: Staff[] = []): StaffRuleCode | null {
  if (actorId === targetId) return 'self_change';
  return isOwner(all, targetId) && !isOwner(all, actorId) ? 'owner_only' : null;
}

/**
 * 출퇴근 기기 해제: 본인 것은 스스로 못 한다 — 다른 관리자가 있을 때만 막는다.
 * 관리자가 혼자면 해 줄 사람이 없어 폰을 바꿀 길이 막히므로 허용한다 (변경 기록에는 본인이 했다고 남는다).
 */
export function checkDeviceRevoke(actorId: string, targetId: string, all: Staff[]): StaffRuleCode | null {
  if (actorId !== targetId) return null;
  if (isOwner(all, actorId)) return null;
  return all.some((s) => s.id !== actorId && s.active && s.role === 'admin') ? 'self_change' : null;
}

/**
 * 자기 요청을 스스로 결정(승인·거부·취소)하지 못한다 — 다른 관리자가 있을 때만 막는다.
 * 관리자가 혼자면 그 사람의 요청을 처리할 사람이 없으므로 허용한다 (화면에는 "본인 요청"으로 표시된다).
 */
export function selfDecisionBlocked(actorId: string, employeeId: string, all: Staff[]): boolean {
  if (actorId !== employeeId) return false;
  if (isOwner(all, actorId)) return false;
  return all.some((s) => s.id !== actorId && s.active && s.role === 'admin');
}

/**
 * 권한 변경에 두 번째 관리자의 확인이 필요한가 (R-2의 8) — 요청자 말고 다른 활성 관리자가 있으면 필요하다.
 * 관리자가 혼자면 확인해 줄 사람이 없으므로 바로 반영한다 (그래야 첫 두 번째 관리자를 지정할 수 있다).
 */
/**
 * 요청 승인 · 거절 · 취소를 이 사람이 할 수 있는가 (개발-39)
 *   최고관리자 · 대표자: 누구 것이든 (본인 것도)
 *   총괄관리자: 최고관리자 · 대표자 것은 못 함. 본인 것은 다른 관리자가 있으면 못 함
 *   지점관리자: 일반직원 것만 (맡은 지점인지는 scope.ts가 본다). 본인 것은 못 함
 */
export function approvalBlocked(actor: Staff, target: Staff, all: Staff[]): 'self_decision' | 'rank' | null {
  if (actor.role === 'admin' && actor.owner) return null;
  if (actor.role === 'admin') {
    if (target.id !== actor.id && target.owner) return 'rank';
    return selfDecisionBlocked(actor.id, target.id, all) ? 'self_decision' : null;
  }
  if (actor.role === 'manager') {
    if (target.id === actor.id) return 'self_decision';
    return target.role === 'employee' ? null : 'rank';
  }
  return 'rank';
}

/** 관리자 구분(최고관리자 · 대표자 · 총괄관리자) 바꾸기 — 최고관리자 · 대표자만, 자기 것은 못 바꾼다(스스로 잠김 방지) */
export function checkLevelChange(actor: Staff, target: Staff, level: AdminLevel): StaffRuleCode | null {
  if (!actor.owner || actor.role !== 'admin') return 'owner_only';
  if (target.id === actor.id) return 'self_change';
  if (!target.active) return 'employee_inactive';
  if (target.role !== 'admin') return 'rank';
  if ((target.level ?? 'general') === level) return 'already';
  return null;
}

export function needsSecondAdmin(actorId: string, all: Staff[]): boolean {
  if (isOwner(all, actorId)) return false;
  return all.some((s) => s.id !== actorId && s.active && s.role === 'admin');
}

export function cleanReason(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  return s.length >= REASON_MIN && s.length <= REASON_MAX ? s : null;
}
