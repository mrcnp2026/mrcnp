// 직원 관리 규칙 (부록 R-2): 퇴사·복직·권한·폰 해제
import { describe, expect, it } from 'vitest';
import { checkDeviceRevoke, checkPhoneRevoke, checkReinstate, checkResign, checkRoleChange, cleanReason, needsSecondAdmin, selfDecisionBlocked, type Staff } from '@/lib/staff-rules';

const s = (id: string, role: 'admin' | 'employee' = 'employee', canViewPayroll = false, active = true): Staff => ({ id, role, active, canViewPayroll });
const A = s('a', 'admin', true);
const B = s('b', 'admin', false);
const C = s('c', 'admin', true);
const E = s('e');
const GONE = s('x', 'employee', false, false);

describe('퇴사 처리·복직', () => {
  it('본인은 스스로 퇴사 처리하지 못한다', () => {
    expect(checkResign('a', A, [A, B, C])).toBe('self_change');
  });
  it('일반 직원은 관리자 수와 상관없이 퇴사 처리된다', () => {
    expect(checkResign('a', E, [A, E])).toBeNull();
  });
  it('관리자가 2명 미만이 되는 퇴사는 차단 ← R-2의 1', () => {
    expect(checkResign('a', B, [A, B, E])).toBe('min_admins');
    expect(checkResign('a', B, [A, B, C])).toBeNull();
  });
  it('급여 담당자가 0명이 되는 퇴사는 차단', () => {
    expect(checkResign('b', A, [A, B, s('d', 'admin')])).toBe('min_payroll');
    expect(checkResign('b', A, [A, B, C])).toBeNull();
  });
  it('이미 퇴사한 사람은 다시 처리하지 않고, 복직은 비활성인 사람만', () => {
    expect(checkResign('a', GONE, [A, B, GONE])).toBe('already');
    expect(checkReinstate('a', GONE)).toBeNull();
    expect(checkReinstate('a', E)).toBe('already');
    expect(checkReinstate('x', GONE)).toBe('self_change');
  });
});

describe('관리자·급여 담당 지정', () => {
  it('자기 권한은 스스로 못 바꾼다 (자기에게 급여 담당을 켜는 것 포함)', () => {
    expect(checkRoleChange({ actor: B, target: B, all: [A, B, C], canViewPayroll: true })).toEqual({ code: 'self_change' });
    expect(checkRoleChange({ actor: A, target: A, all: [A, B, C], role: 'employee' })).toEqual({ code: 'self_change' });
  });
  it('관리자가 한 명뿐이어도 다른 직원을 관리자로 지정할 수 있다 (첫 두 번째 관리자)', () => {
    expect(checkRoleChange({ actor: A, target: E, all: [A, E], role: 'admin' })).toEqual({ next: { ...E, role: 'admin' } });
  });
  it('관리자가 2명 미만이 되는 해제는 차단', () => {
    expect(checkRoleChange({ actor: A, target: B, all: [A, B, E], role: 'employee' })).toEqual({ code: 'min_admins' });
    expect(checkRoleChange({ actor: A, target: B, all: [A, B, C], role: 'employee' })).toEqual({ next: { ...B, role: 'employee' } });
  });
  it('급여 담당은 급여 담당자만 지정·해제한다', () => {
    expect(checkRoleChange({ actor: B, target: s('d', 'admin'), all: [A, B, s('d', 'admin')], canViewPayroll: true })).toEqual({ code: 'payroll_only_grant' });
    expect(checkRoleChange({ actor: A, target: B, all: [A, B], canViewPayroll: true })).toEqual({ next: { ...B, canViewPayroll: true } });
  });
  it('급여 담당은 관리자만 될 수 있다', () => {
    expect(checkRoleChange({ actor: A, target: E, all: [A, B, E], canViewPayroll: true })).toEqual({ code: 'payroll_needs_admin' });
  });
  it('관리자에서 내려오면 급여 담당도 함께 내려오고, 그래서 0명이 되면 차단', () => {
    const r = checkRoleChange({ actor: A, target: C, all: [A, B, C], role: 'employee' });
    expect(r).toEqual({ next: { ...C, role: 'employee', canViewPayroll: false } });
    // B(급여 담당 아님)는 급여 담당 C를 내릴 수 없다 — 급여 권한이 바뀌는 일이라
    expect(checkRoleChange({ actor: B, target: C, all: [A, B, C], role: 'employee' })).toEqual({ code: 'payroll_only_grant' });
    // 마지막 급여 담당이 관리자에서 내려오면 급여 담당이 0명 → 차단
    const last = s('p', 'admin', true);
    expect(checkRoleChange({ actor: { ...B, canViewPayroll: true, active: false }, target: last, all: [B, s('d', 'admin'), last], role: 'employee' })).toEqual({ code: 'min_payroll' });
  });
  it('급여 담당자가 0명이 되는 해제는 차단', () => {
    const a = s('a', 'admin', true);
    const b = s('b', 'admin', true);
    expect(checkRoleChange({ actor: a, target: b, all: [a, b], canViewPayroll: false })).toEqual({ next: { ...b, canViewPayroll: false } });
    // 혼자 남은 급여 담당은 해제할 수 없다 (해제하는 사람이 급여 담당이어도, 그 사람이 비활성이면 세지 않는다)
    const lone = s('z', 'admin', true);
    expect(checkRoleChange({ actor: s('q', 'admin', true, false), target: lone, all: [lone, B, s('q', 'admin', true, false)], canViewPayroll: false })).toEqual({ code: 'min_payroll' });
  });
  it('비활성 직원·이미 같은 상태는 거절', () => {
    expect(checkRoleChange({ actor: A, target: GONE, all: [A, B, GONE], role: 'admin' })).toEqual({ code: 'employee_inactive' });
    expect(checkRoleChange({ actor: A, target: B, all: [A, B], role: 'admin' })).toEqual({ code: 'already' });
  });
});

describe('폰 해제·사유', () => {
  it('자기 폰은 스스로 해제하지 못한다 ← R-2의 2', () => {
    expect(checkPhoneRevoke('a', 'a')).toBe('self_change');
    expect(checkPhoneRevoke('a', 'b')).toBeNull();
  });
  it('출퇴근 기기 해제: 본인 것은 다른 관리자가 있으면 못 하고, 혼자면 할 수 있다', () => {
    expect(checkDeviceRevoke('a', 'a', [A, B, E])).toBe('self_change');
    expect(checkDeviceRevoke('a', 'a', [A, E])).toBeNull(); // 관리자가 혼자 — 아니면 폰을 바꿀 길이 없다
    expect(checkDeviceRevoke('a', 'a', [A, s('b', 'admin', false, false)])).toBeNull(); // 퇴사한 관리자는 세지 않는다
    expect(checkDeviceRevoke('a', 'e', [A, B, E])).toBeNull();
  });
  it('사유는 2~200자', () => {
    expect(cleanReason('.')).toBeNull();
    expect(cleanReason('  폰 분실 ')).toBe('폰 분실');
    expect(cleanReason('x'.repeat(201))).toBeNull();
    expect(cleanReason(undefined)).toBeNull();
  });
});

describe('본인 요청 본인 승인', () => {
  it('다른 관리자가 있으면 자기 요청을 스스로 결정하지 못한다', () => {
    expect(selfDecisionBlocked('a', 'a', [A, B])).toBe(true);
  });
  it('관리자가 혼자면 허용한다 (처리할 사람이 없다) — 비활성·일반 직원은 세지 않는다', () => {
    expect(selfDecisionBlocked('a', 'a', [A, E, s('z', 'admin', false, false)])).toBe(false);
  });
  it('남의 요청은 언제나 결정할 수 있다', () => {
    expect(selfDecisionBlocked('a', 'e', [A, B, E])).toBe(false);
  });
});

describe('두 번째 관리자 확인 ← R-2의 8', () => {
  it('요청자 말고 다른 활성 관리자가 있으면 확인이 필요하다', () => {
    expect(needsSecondAdmin('a', [A, B, E])).toBe(true);
  });
  it('관리자가 혼자면 바로 반영한다 (첫 두 번째 관리자를 지정할 수 있어야 한다)', () => {
    expect(needsSecondAdmin('a', [A, E, s('z', 'admin', false, false)])).toBe(false);
  });
});
