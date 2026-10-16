// 이메일 가입 · 로그인 규칙 (lib/email-rules.ts, lib/login-rules.ts — 2026-10-16 권한-6)
import { describe, expect, it } from 'vitest';
import { cleanEmail, suggestEmployeeNo } from '@/lib/email-rules';
import { resolveLoginId } from '@/lib/login-rules';

describe('cleanEmail', () => {
  it('소문자 · 공백 정리', () => {
    expect(cleanEmail('  Hong.GilDong@Naver.com ')).toBe('hong.gildong@naver.com');
  });
  it('틀린 주소 · 앱 안쪽 주소는 거절', () => {
    for (const v of ['', 'abc', 'a@b', 'a@@b.com', 'a b@c.com', 'a..b@c.com', '1001@staff.invalid', 123]) expect(cleanEmail(v)).toBeNull();
  });
});

describe('suggestEmployeeNo', () => {
  it('숫자 사번의 다음 번호 · 자릿수 유지', () => {
    expect(suggestEmployeeNo(['0007', '0012', 'admin', null])).toBe('0013');
    expect(suggestEmployeeNo(['99'])).toBe('100');
    expect(suggestEmployeeNo(['admin', 'e2e-a'])).toBeNull();
  });
});

describe('resolveLoginId — 이메일', () => {
  const people = [
    { id: 'a', employeeNo: '1001', phone: '010-1111-2222', active: true, email: 'kim@naver.com' },
    { id: 'b', employeeNo: '1002', phone: null, active: false, email: 'lee@gmail.com' },
  ];
  it('@가 있으면 이메일로 찾는다(대소문자 무시)', () => {
    expect(resolveLoginId(' KIM@naver.com ', people)?.id).toBe('a');
  });
  it('퇴사자 · 없는 이메일은 못 찾는다', () => {
    expect(resolveLoginId('lee@gmail.com', people)).toBeNull();
    expect(resolveLoginId('park@naver.com', people)).toBeNull();
  });
  it('사번 · 전화는 그대로', () => {
    expect(resolveLoginId('1001', people)?.id).toBe('a');
    expect(resolveLoginId('01011112222', people)?.id).toBe('a');
  });
});
