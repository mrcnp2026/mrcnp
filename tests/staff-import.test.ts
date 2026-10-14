// 사원별 급여 엑셀 올리기 — 읽기 · 칸별 오류 · 바뀜 판정 (lib/payroll/staff-import.ts)
import { describe, expect, it } from 'vitest';
import { readContractRows, type ImportLabels, type Person } from '@/lib/payroll/staff-import';

const L: ImportLabels = {
  sheet: 's', guide: 'g',
  cols: { employeeNo: '사번', name: '이름', payType: '급여 형태', amount: '금액', timeBasis: '시간 기준', monthlyHours: '월 환산 시간', annualDivisor: '연봉 나누는 수' },
  payType: { MONTHLY: '월급', HOURLY: '시급', ANNUAL: '연봉' },
  timeBasis: { ACTUAL: '실제 찍은 시간', ROUNDED: '끊은 급여용 시간', SCHEDULE: '일정 시간' },
};
const people: Person[] = [
  { id: 'a', employeeNo: '001', name: '가', version: 2, contract: { payType: 'MONTHLY', amount: 3_000_000, timeBasis: 'ROUNDED', monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null, note: null } } },
  { id: 'b', employeeNo: '002', name: '나', version: 0, contract: null },
];

describe('엑셀 올리기 읽기', () => {
  it('같은 값은 「그대로」, 바꾼 값은 「바뀜」, 처음 넣는 사람도 「바뀜」', () => {
    const lines = readContractRows([
      ['001', '가', '월급', '3,000,000', '끊은 급여용 시간', 209, ''],
      ['002', '나', '시급', 10_030, '실제 찍은 시간', '', ''],
    ], people, L);
    expect(lines.map((l) => [l.employeeNo, l.changed, Object.keys(l.errors)])).toEqual([['001', false, []], ['002', true, []]]);
    expect(lines[1].input).toMatchObject({ payType: 'HOURLY', amount: 10030, timeBasis: 'ACTUAL', monthlyHours: null });
    expect(lines[1].expectedVersion).toBe(0);
  });
  it('계약 값을 하나도 적지 않은 줄(계약이 없는 직원 그대로)은 틀린 것이 아니라 「그대로」', () => {
    const [l] = readContractRows([['002', '나', '', '', '', '', '']], people, L);
    expect(l).toMatchObject({ employeeNo: '002', changed: false, errors: {}, input: null });
  });
  it('빠진 칸 · 없는 사번 · 중복 · 규칙 위반은 그 칸에 표시하고 저장 대상에서 뺀다', () => {
    const lines = readContractRows([
      ['001', '가', '월급', '', '끊은 급여용 시간', 209, ''], // 금액 빠짐
      ['999', '?', '월급', 100, '끊은 급여용 시간', 209, ''], // 없는 사번
      ['002', '나', '시급', 10_030, '실제 찍은 시간', 209, ''], // 시급인데 월 환산 시간
      ['002', '나', '주급', 10_030, '실제 찍은 시간', '', ''], // 같은 사번 두 번 + 없는 급여 형태
      ['', '', '', '', '', '', ''], // 빈 줄은 건너뜀
    ], people, L);
    expect(lines).toHaveLength(4);
    expect(lines[0].errors).toEqual({ amount: 'import_required' });
    expect(lines[1].errors.employeeNo).toBe('import_unknown_employee');
    expect(lines[2].errors).toEqual({ monthlyHours: 'contract_monthly_hours' });
    expect(lines[3].errors).toMatchObject({ employeeNo: 'import_duplicate', payType: 'contract_pay_type' });
    expect(lines.every((l) => !l.changed && l.input === null)).toBe(true);
  });
});
