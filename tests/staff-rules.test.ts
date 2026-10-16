// 직원 관리 규칙: 퇴사·복직·권한·폰 해제.
// 권한 (2026-10-16 의뢰인 권한-10): 관리자 = 최고관리자(대표자 포함 최대 3명) — 전부 보고 · 고치고 · 모든 요청(본인 것도). 지점관리자 · 일반직원.
import { describe, expect, it } from 'vitest';
import { checkDeviceRevoke, checkPhoneRevoke, checkReinstate, checkResign, checkRoleChange, approvalBlocked, checkLevelChange, cleanReason, gradeOf, needsSecondAdmin, selfDecisionBlocked, SHOWN_GRADES, type Staff } from '@/lib/staff-rules';

// loadStaff()와 같은 모양: 관리자이면 owner · canViewPayroll이 참
const s = (id: string, role: Staff['role'] = 'employee', active = true, level: Staff['level'] = null): Staff => ({ id, role, active, canViewPayroll: role === 'admin', owner: role === 'admin', level: role === 'admin' ? (level ?? 'super') : null });
const A = s('a', 'admin');
const B = s('b', 'admin');
const C = s('c', 'admin', true, 'ceo');
const E = s('e');
const M = s('m', 'manager');
const M2 = s('m2', 'manager');
const GONE = s('x', 'employee', false);

describe('등급', () => {
  it('화면에서 고르는 등급은 최고관리자 · 대표자 · 지점관리자 · 일반직원 — 총괄관리자 · 급여 담당은 없다', () => {
    expect([...SHOWN_GRADES]).toEqual(['super', 'ceo', 'manager', 'employee']);
  });
  it('관리자는 최고관리자, 대표자 표시가 있으면 대표자 — 예전 값(general)이 남아 있어도 최고관리자', () => {
    expect(gradeOf(A)).toBe('super');
    expect(gradeOf(C)).toBe('ceo');
    expect(gradeOf({ role: 'admin', level: 'general' as never })).toBe('super');
    expect(gradeOf(M)).toBe('manager');
    expect(gradeOf(E)).toBe('employee');
  });
});

describe('퇴사 처리·복직', () => {
  it('본인은 스스로 퇴사 처리하지 못한다', () => {
    expect(checkResign('a', A, [A, B, C])).toBe('self_change');
  });
  it('일반 직원은 관리자 수와 상관없이 퇴사 처리된다', () => {
    expect(checkResign('a', E, [A, E])).toBeNull();
  });
  it('관리자가 2명 미만이 되는 퇴사는 차단', () => {
    expect(checkResign('a', B, [A, B, E])).toBe('min_admins');
    expect(checkResign('a', B, [A, B, C])).toBeNull();
  });
  it('이미 퇴사한 사람은 다시 처리하지 않고, 복직은 비활성인 사람만', () => {
    expect(checkResign('a', GONE, [A, B, GONE])).toBe('already');
    expect(checkReinstate('a', GONE)).toBeNull();
    expect(checkReinstate('a', E)).toBe('already');
    expect(checkReinstate('x', GONE)).toBe('self_change');
  });
  it('관리자는 다른 최고관리자 · 대표자도 퇴사 처리할 수 있다', () => {
    expect(checkResign('a', C, [A, B, C])).toBeNull();
  });
});

describe('관리자 지정 · 해제', () => {
  it('자기 권한은 스스로 못 바꾼다', () => {
    expect(checkRoleChange({ actor: A, target: A, all: [A, B, C], role: 'employee' })).toEqual({ code: 'self_change' });
  });
  it('관리자로 지정하면 급여도 함께 본다 (급여 담당 구분 없음)', () => {
    expect(checkRoleChange({ actor: A, target: E, all: [A, E], role: 'admin' })).toEqual({ next: { ...E, role: 'admin', canViewPayroll: true, owner: true } });
  });
  it('관리자에서 내려오면 급여도 함께 못 본다, 관리자 2명 하한은 지킨다', () => {
    expect(checkRoleChange({ actor: A, target: B, all: [A, B, E], role: 'employee' })).toEqual({ code: 'min_admins' });
    expect(checkRoleChange({ actor: A, target: B, all: [A, B, C], role: 'employee' })).toEqual({ next: { ...B, role: 'employee', canViewPayroll: false, owner: false } });
  });
  it('비활성 직원 · 이미 같은 상태는 거절', () => {
    expect(checkRoleChange({ actor: A, target: GONE, all: [A, B, GONE], role: 'admin' })).toEqual({ code: 'employee_inactive' });
    expect(checkRoleChange({ actor: A, target: B, all: [A, B], role: 'admin' })).toEqual({ code: 'already' });
  });
  it('퇴사하거나 강등된 사람은 권한을 바꾸지 못한다', () => {
    for (const actor of [{ ...A, active: false }, { ...A, role: 'employee' as const, owner: false }]) {
      expect(checkRoleChange({ actor, target: E, all: [actor, E], role: 'admin' })).toEqual({ code: 'rank' });
    }
  });
});

describe('관리자 구분 (최고관리자 ↔ 대표자)', () => {
  it('관리자는 다른 관리자의 구분을 바꾼다, 자기 것은 못 바꾼다', () => {
    expect(checkLevelChange(A, B, 'ceo')).toBeNull();
    expect(checkLevelChange(A, C, 'super')).toBeNull();
    expect(checkLevelChange(A, A, 'ceo')).toBe('self_change');
    expect(checkLevelChange(A, B, 'super')).toBe('already');
    expect(checkLevelChange(A, M, 'super')).toBe('rank');
    expect(checkLevelChange(M, A, 'ceo')).toBe('owner_only');
    expect(checkLevelChange({ ...A, active: false }, B, 'ceo')).toBe('owner_only');
  });
});

describe('요청 승인 (모든 요청은 최고관리자가 받는다)', () => {
  const all = [A, B, C, M, M2, E];
  it('최고관리자 · 대표자는 누구 것이든, 본인 것도', () => {
    for (const a of [A, B, C]) for (const t of all) expect(approvalBlocked(a, t, all)).toBeNull();
    expect(selfDecisionBlocked('a', 'a', all)).toBe(false);
    expect(needsSecondAdmin('a', all)).toBe(false);
  });
  it('지점관리자: 일반직원만, 본인 · 다른 지점관리자 · 관리자는 못 함', () => {
    expect(approvalBlocked(M, E, all)).toBeNull();
    expect(approvalBlocked(M, M, all)).toBe('self_decision');
    expect(approvalBlocked(M, M2, all)).toBe('rank');
    expect(approvalBlocked(M, A, all)).toBe('rank');
  });
  it('일반직원 · 비활성 관리자는 승인하지 못함', () => {
    expect(approvalBlocked(E, M, all)).toBe('rank');
    expect(approvalBlocked({ ...A, active: false }, E, all)).toBe('rank');
  });
});

describe('폰 · 기기 해제 · 사유', () => {
  it('자기 로그인은 스스로 초기화하지 못한다', () => {
    expect(checkPhoneRevoke('a', 'a')).toBe('self_change');
    expect(checkPhoneRevoke('a', 'b', [A, B])).toBeNull();
  });
  it('관리자는 자기 출퇴근 기기도 직접 해제한다, 남의 것도', () => {
    expect(checkDeviceRevoke('a', 'a', [A, B, E])).toBeNull();
    expect(checkDeviceRevoke('a', 'c', [A, C])).toBeNull();
    expect(checkDeviceRevoke('m', 'e', [A, M, E])).toBe('rank');
  });
  it('사유는 2~200자', () => {
    expect(cleanReason('.')).toBeNull();
    expect(cleanReason('  폰 분실 ')).toBe('폰 분실');
    expect(cleanReason('x'.repeat(201))).toBeNull();
    expect(cleanReason(undefined)).toBeNull();
  });
});
