// 급여명세서 엑셀 올리기 — 칸 짐작 · 금액 읽기 · 합계 맞추기 · 직원 찾기 (2026-10-16)
import { describe, expect, it } from 'vitest';
import { findHeader, guessKind, parseCsv, readColumns, readSlipRows, toWon } from '@/lib/payroll/slip-upload';

const people = [
  { id: 'a', employeeNo: '1001', name: '김철수' },
  { id: 'b', employeeNo: '1002', name: '이영희' },
  { id: 'c', employeeNo: '1003', name: '박민수' },
  { id: 'd', employeeNo: '1004', name: '박민수' },
];

describe('칸 짐작', () => {
  it('머리 글자로 칸 종류를 고른다', () => {
    expect(guessKind('사번')).toBe('ID');
    expect(guessKind('성 명')).toBe('NAME');
    expect(guessKind('기본급')).toBe('PAYMENT');
    expect(guessKind('시간외수당')).toBe('PAYMENT');
    expect(guessKind('국민연금')).toBe('DEDUCTION');
    expect(guessKind('지방소득세')).toBe('DEDUCTION');
    expect(guessKind('공제합계')).toBe('TOTAL_DED');
    expect(guessKind('지급합계')).toBe('TOTAL_PAY');
    expect(guessKind('차인지급액')).toBe('NET');
    expect(guessKind('직급')).toBe('SKIP');
    expect(guessKind('지급일')).toBe('SKIP');
    expect(guessKind('근무일수')).toBe('SKIP');
    expect(guessKind('특근비')).toBeNull();
  });
  it('금액: 쉼표 · 원 · 괄호 음수 · 빈칸 0 · 글자는 null', () => {
    expect(toWon('2,500,000')).toBe(2500000);
    expect(toWon('12,345원')).toBe(12345);
    expect(toWon('(30,000)')).toBe(-30000);
    expect(toWon('-500')).toBe(-500);
    expect(toWon('')).toBe(0);
    expect(toWon(1234.4)).toBe(1234);
    expect(toWon({ result: 900 })).toBe(900);
    expect(toWon('없음')).toBeNull();
  });
});

describe('명세서 줄 읽기', () => {
  const rows = [
    ['2026년 8월 급여대장'],
    [],
    ['사번', '성명', '부서', '기본급', '식대', '특근비', '국민연금', '소득세', '지급합계', '공제합계', '차인지급액'],
    ['1001', '김철수', '생산', '2,500,000', '200,000', '50,000', '112,500', '30,000', '2,750,000', '142,500', '2,607,500'],
    ['1002', '이영희', '관리', '3000000', '200000', '', '135000', '60000', '3200000', '195000', '3005000'],
    ['', '합계', '', '5500000', '', '', '', '', '', '', ''],
  ];
  it('머리 행을 찾고, 모르는 숫자 칸(특근비)은 지급으로 짐작한다', () => {
    const h = findHeader(rows);
    expect(h).toBe(2);
    const cols = readColumns(rows, h);
    expect(cols.find((c) => c.header === '특근비')).toMatchObject({ kind: 'PAYMENT', guessed: true });
    expect(cols.find((c) => c.header === '부서')?.kind).toBe('SKIP');
  });
  it('지급 · 공제 · 실지급을 계산하고 파일의 합계와 맞춘다 · 합계 줄은 건너뛴다', () => {
    const h = findHeader(rows);
    const out = readSlipRows(rows, h, readColumns(rows, h), people);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ employeeId: 'a', pay: 2750000, deduction: 142500, net: 2607500, errors: [] });
    expect(out[0].lines).toContainEqual({ kind: 'PAYMENT', label: '특근비', amount: 50000 });
    expect(out[1].lines.some((l) => l.label === '특근비')).toBe(false); // 빈칸은 줄을 만들지 않는다
    expect(out[1].errors).toEqual([]);
  });
  it('칸 종류를 바꾸면(특근비 → 안 씀) 합계가 달라져 막힌다', () => {
    const h = findHeader(rows);
    const cols = readColumns(rows, h, { 5: 'SKIP' });
    const out = readSlipRows(rows, h, cols, people);
    expect(out[0].errors).toEqual(expect.arrayContaining(['total_mismatch', 'net_mismatch']));
  });
  it('모르는 사번 · 같은 이름 두 명 · 한 파일에 두 번 · 숫자가 아닌 금액', () => {
    const r = [
      ['사번', '이름', '기본급', '소득세'],
      ['9999', '없는사람', '100', '0'],
      ['', '박민수', '100', '0'],
      ['1001', '김철수', '100', '0'],
      ['', '김철수', '200', '0'],
      ['1002', '이영희', '백만원', '0'],
    ];
    const out = readSlipRows(r, 0, readColumns(r, 0), people);
    expect(out[0].errors).toContain('unknown_employee');
    expect(out[1].errors).toContain('unknown_employee'); // 동명이인은 사번이 있어야 한다
    expect(out[2].errors).toContain('duplicate_employee');
    expect(out[3].errors).toContain('duplicate_employee');
    expect(out[4].errors).toContain('bad_amount');
  });
  it('CSV — 따옴표 안 쉼표 · BOM', () => {
    expect(parseCsv('﻿사번,성명,기본급\r\n1001,김철수,"2,500,000"\n')).toEqual([['사번', '성명', '기본급'], ['1001', '김철수', '2,500,000']]);
  });
});
