// 직원 관리 규칙 (부록 R-2): 퇴사·복직·권한·폰 해제
import { describe, expect, it } from 'vitest';
import { checkDeviceRevoke, checkPhoneRevoke, checkReinstate, checkResign, checkRoleChange, approvalBlocked, checkLevelChange, cleanReason, needsSecondAdmin, selfDecisionBlocked, type Staff } from '@/lib/staff-rules';

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
    expect(checkRoleChange({ actor: { ...B, owner: true }, target: last, all: [B, s('d', 'admin'), last], role: 'employee' })).toEqual({ code: 'min_payroll' });
  });
  it('급여 담당자가 0명이 되는 해제는 차단', () => {
    const a = s('a', 'admin', true);
    const b = s('b', 'admin', true);
    expect(checkRoleChange({ actor: a, target: b, all: [a, b], canViewPayroll: false })).toEqual({ next: { ...b, canViewPayroll: false } });
    // 혼자 남은 급여 담당은 해제할 수 없다 (해제하는 사람이 급여 담당이어도, 그 사람이 비활성이면 세지 않는다)
    const lone = s('z', 'admin', true);
    expect(checkRoleChange({ actor: { ...B, owner: true }, target: lone, all: [lone, B], canViewPayroll: false })).toEqual({ code: 'min_payroll' });
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

describe('오너 계정 (2026-10-06 의뢰인: admin은 오너가 쓴다 — 모든 것을 할 수 있어야 한다)', () => {
  const owner: Staff = { id: 'o', role: 'admin', active: true, canViewPayroll: true, owner: true };
  const other: Staff = { id: 'a', role: 'admin', active: true, canViewPayroll: false };
  const emp: Staff = { id: 'e', role: 'employee', active: true, canViewPayroll: false };
  const all = [owner, other, emp];
  it('오너는 다른 관리자의 확인 없이 권한을 바꾸고, 자기 요청·자기 기기를 직접 처리한다', () => {
    expect(needsSecondAdmin('o', all)).toBe(false);
    expect(needsSecondAdmin('a', all)).toBe(true);
    expect(selfDecisionBlocked('o', 'o', all)).toBe(false);
    expect(selfDecisionBlocked('a', 'a', all)).toBe(true);
    expect(checkDeviceRevoke('o', 'o', all)).toBeNull();
    expect(checkRoleChange({ actor: owner, target: other, all, canViewPayroll: true })).toEqual({ next: { ...other, canViewPayroll: true } });
  });
  it('다른 관리자는 오너의 권한·재직 상태·로그인을 바꾸지 못한다', () => {
    expect(checkRoleChange({ actor: other, target: owner, all, role: 'employee' })).toEqual({ code: 'owner_only' });
    expect(checkResign('a', owner, all)).toBe('owner_only');
    expect(checkPhoneRevoke('a', 'o', all)).toBe('owner_only');
  });
  it('오너라도 자기 권한 내리기·자기 퇴사·자기 로그인 초기화는 못 한다 (스스로 잠기지 않게)', () => {
    expect(checkRoleChange({ actor: owner, target: owner, all, role: 'employee' })).toEqual({ code: 'self_change' });
    expect(checkResign('o', owner, all)).toBe('self_change');
    expect(checkPhoneRevoke('o', 'o', all)).toBe('self_change');
  });
});

// 권한 5단계 승인 규칙 (2026-10-15 의뢰인, 결정 사항 개발-39)
describe('approvalBlocked — 등급별 승인', () => {
  const S = (id: string, role: Staff['role'], level: Staff['level'] = null): Staff => ({ id, role, active: true, canViewPayroll: false, level, owner: level === 'super' || level === 'ceo' });
  const sup = S('sup', 'admin', 'super');
  const ceo = S('ceo', 'admin', 'ceo');
  const g1 = S('g1', 'admin', 'general');
  const g2 = S('g2', 'admin', 'general');
  const mg = S('mg', 'manager');
  const mg2 = S('mg2', 'manager');
  const em = S('em', 'employee');
  const all = [sup, ceo, g1, g2, mg, mg2, em];
  it('최고관리자 · 대표자는 누구 것이든, 본인 것도', () => {
    for (const a of [sup, ceo]) for (const t of all) expect(approvalBlocked(a, t, all)).toBeNull();
  });
  it('총괄관리자: 최고 · 대표 것은 못 함, 다른 총괄 · 지점관리자 · 직원은 됨, 본인 것은 못 함', () => {
    expect(approvalBlocked(g1, sup, all)).toBe('rank');
    expect(approvalBlocked(g1, ceo, all)).toBe('rank');
    expect(approvalBlocked(g1, g2, all)).toBeNull();
    expect(approvalBlocked(g1, mg, all)).toBeNull();
    expect(approvalBlocked(g1, em, all)).toBeNull();
    expect(approvalBlocked(g1, g1, all)).toBe('self_decision');
  });
  it('지점관리자: 일반직원만, 본인 · 다른 지점관리자 · 관리자는 못 함', () => {
    expect(approvalBlocked(mg, em, all)).toBeNull();
    expect(approvalBlocked(mg, mg, all)).toBe('self_decision');
    expect(approvalBlocked(mg, mg2, all)).toBe('rank');
    expect(approvalBlocked(mg, g1, all)).toBe('rank');
  });
  it('일반직원은 승인하지 못함', () => {
    expect(approvalBlocked(em, mg, all)).toBe('rank');
  });
  it('관리자 구분은 최고관리자 · 대표자만, 자기 것은 못 바꿈', () => {
    expect(checkLevelChange(g1, g2, 'ceo')).toBe('owner_only');
    expect(checkLevelChange(ceo, ceo, 'general')).toBe('self_change');
    expect(checkLevelChange(ceo, g1, 'super')).toBeNull();
    expect(checkLevelChange(ceo, mg, 'general')).toBe('rank');
  });
  it('총괄관리자는 최고 · 대표의 권한을 못 바꾸고, 최고관리자는 대표자 것을 바꿀 수 있다', () => {
    expect('code' in checkRoleChange({ actor: g1, target: ceo, all, role: 'employee' }) && (checkRoleChange({ actor: g1, target: ceo, all, role: 'employee' }) as { code: string }).code).toBe('owner_only');
  });
});

describe('검수 R18–R20 권한 회귀', () => {
  const top: Staff = { ...A, id: 'top', owner: true, level: 'ceo' };
  it('총괄관리자는 최상위 계정의 출퇴근 기기를 해제하지 못한다', () => {
    expect(checkDeviceRevoke(B.id, top.id, [B, top])).toBe('owner_only');
  });
  it('퇴사하거나 강등된 요청자의 권한 변경은 거부한다', () => {
    for (const actor of [{ ...A, active: false }, { ...A, role: 'employee' as const }]) {
      expect(checkRoleChange({ actor, target: E, all: [actor, E], role: 'admin' })).toEqual({ code: 'rank' });
      expect(approvalBlocked(actor, E, [actor, E])).toBe('rank');
    }
  });
  it('비활성 최상위 계정도 승인과 등급 변경을 할 수 없다', () => {
    expect(approvalBlocked({ ...top, active: false }, E, [top, E])).toBe('rank');
    expect(checkLevelChange({ ...top, active: false }, B, 'ceo')).toBe('owner_only');
  });
});
