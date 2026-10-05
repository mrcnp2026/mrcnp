// 로그인 규칙 (2026-10-05 의뢰인: 아이디 + 비밀번호 로그인): 아이디 찾기 · 비밀번호 규칙 · 세션 무효화
import { describe, expect, it } from 'vitest';
import { authTimeOf, checkPassword, normalizeLoginId, resolveLoginId, sessionRevoked, type LoginCandidate } from '@/lib/login-rules';

const p = (id: string, employeeNo: string | null, phone: string | null = null, active = true): LoginCandidate => ({ id, employeeNo, phone, active });
const PEOPLE = [p('a', 'A001', '010-1111-2222'), p('b', 'b002', '01033334444'), p('c', 'C003', '010-5555-6666'), p('d', 'D004', '010-5555-6666'), p('x', 'X999', '010-7777-8888', false)];

describe('아이디 찾기', () => {
  it('사번은 대소문자·앞뒤 공백을 가리지 않는다', () => {
    expect(resolveLoginId(' a001 ', PEOPLE)?.id).toBe('a');
    expect(resolveLoginId('B002', PEOPLE)?.id).toBe('b');
    expect(normalizeLoginId('  Ab-1 ')).toBe('ab-1');
  });
  it('휴대폰 번호는 숫자만 비교한다 (하이픈·공백 무시)', () => {
    expect(resolveLoginId('01011112222', PEOPLE)?.id).toBe('a');
    expect(resolveLoginId('010-3333-4444', PEOPLE)?.id).toBe('b');
    expect(resolveLoginId('010 1111 2222', PEOPLE)?.id).toBe('a');
  });
  it('같은 번호의 재직자가 둘이면 누구인지 알 수 없으므로 찾지 못한다', () => {
    expect(resolveLoginId('010-5555-6666', PEOPLE)).toBeNull();
  });
  it('퇴사자는 사번으로도 휴대폰 번호로도 찾지 못한다', () => {
    expect(resolveLoginId('X999', PEOPLE)).toBeNull();
    expect(resolveLoginId('010-7777-8888', PEOPLE)).toBeNull();
  });
  it('없는 아이디·빈 값·짧은 숫자는 찾지 못한다', () => {
    expect(resolveLoginId('nobody', PEOPLE)).toBeNull();
    expect(resolveLoginId('', PEOPLE)).toBeNull();
    expect(resolveLoginId(undefined, PEOPLE)).toBeNull();
    expect(resolveLoginId('2222', PEOPLE)).toBeNull();
  });
  it('숫자로 된 사번이 휴대폰 번호보다 먼저다', () => {
    const people = [p('n', '01011112222'), p('a', 'A001', '010-1111-2222')];
    expect(resolveLoginId('01011112222', people)?.id).toBe('n');
  });
});

describe('비밀번호 규칙', () => {
  it('8자 이상이어야 한다', () => {
    expect(checkPassword('1234567', 'A001')).toBe('password_short');
    expect(checkPassword('12345678', 'A001')).toBeNull();
    expect(checkPassword(undefined, 'A001')).toBe('password_short');
  });
  it('72바이트를 넘으면 거절한다 (인증 서버가 뒤를 잘라 버린다)', () => {
    expect(checkPassword('a'.repeat(72), 'A001')).toBeNull();
    expect(checkPassword('a'.repeat(73), 'A001')).toBe('password_long');
    expect(checkPassword('가'.repeat(25), 'A001')).toBe('password_long'); // 한글은 글자당 3바이트
  });
  it('사번과 같으면 안 된다 (대소문자 무시)', () => {
    expect(checkPassword('emp-00001', 'EMP-00001')).toBe('password_same_as_id');
  });
});

describe('세션 무효화', () => {
  it('처음 로그인한 시각은 토큰을 갱신해도 바뀌지 않는다 (갱신 표시는 뺀다)', () => {
    expect(authTimeOf({ amr: [{ method: 'password', timestamp: 1000 }], iat: 5000 })).toBe(1000);
    expect(authTimeOf({ amr: [{ method: 'token_refresh', timestamp: 4000 }, { method: 'otp', timestamp: 1000 }], iat: 5000 })).toBe(1000);
  });
  it('amr에 시각이 없으면 발급 시각으로 대신한다', () => {
    expect(authTimeOf({ amr: ['password'], iat: 5000 })).toBe(5000);
    expect(authTimeOf({ iat: 5000 })).toBe(5000);
    expect(authTimeOf(null)).toBeNull();
  });
  it('무효화 시각보다 먼저 로그인한 세션은 끊긴다', () => {
    const at = new Date(2000 * 1000).toISOString();
    expect(sessionRevoked(1999, at)).toBe(true);
    expect(sessionRevoked(2000, at)).toBe(false); // 비밀번호를 바꾸며 방금 받은 세션
    expect(sessionRevoked(2001, at)).toBe(false);
  });
  it('무효화한 적이 없으면 모두 유효하고, 로그인 시각을 모르는 세션은 무효화 뒤 끊긴다', () => {
    expect(sessionRevoked(1, null)).toBe(false);
    expect(sessionRevoked(null, null)).toBe(false);
    expect(sessionRevoked(null, new Date().toISOString())).toBe(true);
  });
});
