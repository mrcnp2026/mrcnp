// 공단 고지서 엑셀 올리기 (2026-10-20) — 머리 줄 찾기 · 열 짐작 · 직원 맞추기
import { describe, expect, it } from 'vitest';
import { guessMapping, matchNotice, noticeSheet } from '@/lib/payroll/notice-upload';

const people = [{ id: 'a', name: '김가', employeeNo: 'M001' }, { id: 'b', name: '이나', employeeNo: 'M002' }, { id: 'c', name: '박다', employeeNo: null }, { id: 'd', name: '박다', employeeNo: 'M004' }];

describe('고지서 엑셀', () => {
  it('제목 줄을 건너뛰고 「성명」 줄을 머리로', () => {
    const s = noticeSheet([['2026년 10월 건강보험 고지내역'], [], ['순번', '성 명', '산출보험료', '요양산출보험료'], [1, '김가', '141,800', { result: 18160 }], [2, '이나', 100000, 13140], ['합계', '', 241800, 31300]])!;
    expect(s.headers).toEqual(['순번', '성 명', '산출보험료', '요양산출보험료']);
    expect(s.rows.length).toBe(3);
    const m = guessMapping('HI', s.headers);
    expect(m).toEqual({ name: 1, employeeNo: null, employee: 2, employer: null, extra: 3 });
    expect(matchNotice(s, m, people)).toEqual([
      { row: 1, label: '김가', employeeId: 'a', employee: 159960, employer: null, problem: null },
      { row: 2, label: '이나', employeeId: 'b', employee: 113140, employer: null, problem: null },
      { row: 3, label: '합계', employeeId: null, employee: 273100, employer: null, problem: 'no_person' },
    ]);
  });
  it('국민연금: 근로자 · 사용자 열, 사번 우선, 같은 이름은 사번 없으면 못 찾음', () => {
    const s = noticeSheet([['사번', '성명', '근로자기여금', '사용자부담금'], ['M004', '박다', '180000', '180000'], ['', '박다', '1', '1'], ['M002', '이나', '', ''], ['M002', '이나', '5', '5']])!;
    const m = guessMapping('NP', s.headers);
    expect(m).toEqual({ name: 1, employeeNo: 0, employee: 2, employer: 3, extra: null });
    expect(matchNotice(s, m, people).map((x) => [x.employeeId, x.problem])).toEqual([['d', null], [null, 'same_name'], ['b', 'no_amount'], ['b', null]]);
  });
});
