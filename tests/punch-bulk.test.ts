// 출퇴근 기록 엑셀 일괄 입력 (2026-10-20) — 시각 · 날짜 읽기 · 직원 맞추기
import { describe, expect, it } from 'vitest';
import { punchTemplate, readPunches, toTime, type PunchLabels } from '@/lib/punch-bulk';

const L: PunchLabels = { sheet: '출퇴근', guide: '안내', cols: { employeeNo: '사번', name: '이름', date: '날짜', in: '출근', out: '퇴근', reason: '사유' } };
const members = [{ id: 'a', employeeNo: 'M001', name: '김가' }];

describe('출퇴근 일괄 입력', () => {
  it('시각 여러 모양', () => {
    expect([toTime('9:00'), toTime('0900'), toTime('930'), toTime(0.375), toTime('25:00'), toTime('')]).toEqual(['09:00', '09:00', '09:30', '09:00', undefined, null]);
  });
  it('양식: 사람마다 한 줄, 날짜 채움', () => {
    const ws = punchTemplate(members, '2026-10-20', L).worksheets[0];
    expect(ws.getRow(3).values).toEqual([undefined, 'M001', '김가', '2026-10-20', '', '', '']);
  });
  it('읽기: 빈 줄 건너뜀 · 자정 넘김 · 사유 기본값 · 모르는 사번', () => {
    const rows = [['안내'], ['사번', '이름', '날짜', '출근', '퇴근', '사유'], ['M001', '김가', '2026-10-20', '', '', ''], ['M001', '김가', '2026.10.19', '22:00', '06:00', ''], ['M009', '', '2026-10-19', '9:00', '', '야간'], ['M001', '', '2026-13-01', '9:00', '18:00', '']];
    expect(readPunches(rows, members, L, '엑셀 일괄 입력')).toEqual([
      { row: 4, employeeNo: 'M001', name: '김가', employeeId: 'a', workDate: '2026-10-19', in: '22:00', out: '06:00', nextDay: true, reason: '엑셀 일괄 입력', error: null },
      { row: 5, employeeNo: 'M009', name: '', employeeId: null, workDate: '2026-10-19', in: '09:00', out: null, nextDay: false, reason: '야간', error: 'unknown_employee' },
      { row: 6, employeeNo: 'M001', name: '김가', employeeId: 'a', workDate: null, in: '09:00', out: '18:00', nextDay: false, reason: '엑셀 일괄 입력', error: 'bad_date' },
    ]);
  });
});
