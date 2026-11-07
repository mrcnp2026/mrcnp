// 민감정보 암호화 · 모양 확인 (급여-36 · 37). 가짜 번호만 쓴다.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { keysOf, lookupOf, open, parseSensitive, seal } from '@/lib/payroll/sensitive-core';

const keyA = keysOf(randomBytes(32).toString('base64'));
const keyB = keysOf(randomBytes(32).toString('base64'));
const ME = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

describe('모양 확인 · 가리기', () => {
  it('주민번호: 하이픈 · 공백을 빼고 날짜 · 성별 숫자를 본다', () => {
    expect(parseSensitive('RRN', '900101-1234567')).toEqual({ ok: true, value: '9001011234567', masked: '900101-1******' });
    expect(parseSensitive('RRN', '050229 3000000').ok).toBe(false); // 2005년 2월 29일은 없다
    expect(parseSensitive('RRN', '040229-3000000').ok).toBe(true); // 2004년은 윤년
    expect(parseSensitive('RRN', '900101-5234567').ok).toBe(false); // 5~8은 외국인
    expect(parseSensitive('RRN', '9001011234').ok).toBe(false);
  });
  it('외국인등록번호는 성별 숫자 5~8만', () => {
    expect(parseSensitive('FOREIGN_NO', '950315-5123456')).toMatchObject({ ok: true, masked: '950315-5******' });
    expect(parseSensitive('FOREIGN_NO', '950315-1123456').ok).toBe(false);
  });
  it('여권번호: 영문 · 숫자 6~12자, 소문자는 대문자로', () => {
    expect(parseSensitive('PASSPORT', 'm1234567 8')).toEqual({ ok: true, value: 'M12345678', masked: 'M******78' });
    expect(parseSensitive('PASSPORT', 'ABCDEFG').ok).toBe(false); // 숫자가 없다
    expect(parseSensitive('PASSPORT', 'M1-2').ok).toBe(false);
  });
  it('계좌: 은행 이름 + 숫자 8~20자리, 끝 4자리만 보인다', () => {
    expect(parseSensitive('BANK', '123-456-789012', ' 국민  은행 ')).toEqual({ ok: true, value: '123456789012', masked: '국민 은행 ****9012' });
    expect(parseSensitive('BANK', '123456789012', '').ok).toBe(false);
    expect(parseSensitive('BANK', '1234567', '국민').ok).toBe(false);
  });
  it('문자열이 아니거나 너무 길면 거절', () => {
    expect(parseSensitive('RRN', 9001011234567).ok).toBe(false);
    expect(parseSensitive('PASSPORT', 'A1'.repeat(40)).ok).toBe(false);
  });
});

describe('잠그기 · 풀기', () => {
  it('같은 열쇠 · 같은 주인이면 풀리고, 잠글 때마다 암호문이 다르다', () => {
    const a = seal(keyA, 'RRN', ME, '9001011234567');
    const b = seal(keyA, 'RRN', ME, '9001011234567');
    expect(a).not.toBe(b);
    expect(a).not.toContain('9001011234567');
    expect(open(keyA, 'RRN', ME, a)).toBe('9001011234567');
    expect(a.length).toBeGreaterThanOrEqual(20); // DB 칸 검사(20~4000자)
  });
  it('열쇠가 다르거나 · 다른 사람 · 다른 종류로 옮기거나 · 한 글자 바꾸면 안 풀린다', () => {
    const a = seal(keyA, 'BANK', ME, '123456789012');
    expect(() => open(keyB, 'BANK', ME, a)).toThrow();
    expect(() => open(keyA, 'BANK', OTHER, a)).toThrow();
    expect(() => open(keyA, 'RRN', ME, a)).toThrow();
    const raw = Buffer.from(a, 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => open(keyA, 'BANK', ME, raw.toString('base64'))).toThrow();
  });
  it('찾기 값은 같은 번호면 같고, 열쇠가 다르면 다르다(DB 칸: 64자리 16진수)', () => {
    const x = lookupOf(keyA, 'RRN', '9001011234567');
    expect(x).toMatch(/^[0-9a-f]{64}$/);
    expect(lookupOf(keyA, 'RRN', '9001011234567')).toBe(x);
    expect(lookupOf(keyB, 'RRN', '9001011234567')).not.toBe(x);
    expect(lookupOf(keyA, 'FOREIGN_NO', '9001011234567')).not.toBe(x);
  });
  it('열쇠가 32바이트가 아니면 거절하고, 오류에 열쇠 값을 넣지 않는다', () => {
    const short = Buffer.from('short-key').toString('base64');
    expect(() => keysOf(short)).toThrow('payroll_secret_key_invalid');
    try { keysOf(short); } catch (e) { expect(String((e as Error).message)).not.toContain(short); }
  });
});
