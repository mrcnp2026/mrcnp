// 휴가 엑셀 일괄 입력 (2026-10-20) — 읽기
import { describe, expect, it } from 'vitest';
import { readLeaves, type LeaveLabels } from '@/lib/leave-bulk';

const L: LeaveLabels = { sheet: '휴가', guide: '안내', typesSheet: '종류', cols: { employeeNo: '사번', name: '이름', type: '종류', start: '시작일', end: '끝날', time: '시작 시각', reason: '사유' } };
const members = [{ id: 'a', employeeNo: 'M001', name: '김가' }];
const types = [{ code: 'ANNUAL', name: '연차8H', dayUnit: 1 }, { code: 'HALF', name: '반차4H', dayUnit: 0.5 }];

describe('휴가 일괄 입력', () => {
  it('끝날이 비면 시작일 하루 · 종류는 이름 또는 코드 · 시각', () => {
    const rows = [['안내'], ['사번', '이름', '종류', '시작일', '끝날', '시작 시각', '사유'], ['M001', '', '연차8H', '2026-10-05', '2026-10-06', '', '여행'], ['M001', '', 'half', '2026.10.7', '', '13:00', ''], ['M001', '', '없는종류', '2026-10-08'], ['M002', '', '연차8H', '2026-10-08'], ['M001', '', '연차8H', '2026-10-09', '2026-10-08'], ['', '', '', '']];
    expect(readLeaves(rows, members, types, L)!.map((l) => [l.error, l.typeCode, l.startDate, l.endDate, l.startTime])).toEqual([
      [null, 'ANNUAL', '2026-10-05', '2026-10-06', null],
      [null, 'HALF', '2026-10-07', '2026-10-07', '13:00'],
      ['unknown_type', null, '2026-10-08', '2026-10-08', null],
      ['unknown_employee', 'ANNUAL', '2026-10-08', '2026-10-08', null],
      ['bad_date', 'ANNUAL', '2026-10-09', '2026-10-08', null],
    ]);
  });
});
