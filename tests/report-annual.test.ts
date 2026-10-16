// 연간 리포트의 모으기 (lib/report-annual-core.ts collectAnnual) — 달별 칸, 1년 합계, 달을 넘는 주의 52시간 판정
import { describe, expect, it } from 'vitest';
import { collectAnnual, empMonths, empTotal, mondayOf } from '@/lib/report-annual-core';
import type { AttEmp, AttReport } from '@/lib/report-attendance';

const emp = (o: Partial<AttEmp> & { employeeId: string; name: string }): AttEmp => ({
  people: 1, closed: 0, netMinutes: 0, payableMinutes: 0, regularMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, lateCount: 0, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0,
  anomalyBlock: 0, anomalyCheck: 0, pending: 0, unconfirmedDays: 0, employeeNo: null, groupId: null, isClosed: false, ...o,
});
const rep = (month: string, employees: AttEmp[]): AttReport => ({ month, practice: false, basis: 'at_month_end', groupId: null, employees, groups: [], total: emp({ employeeId: '', name: '' }), generatedAt: '' });
const days = (from: string, n: number, minutes: number) => Array.from({ length: n }, (_, i) => { const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return { date: d.toISOString().slice(0, 10), minutes }; });

describe('collectAnnual', () => {
  it('달별 칸과 1년 합계를 모은다 — 기록 없는 달은 빈칸', () => {
    const r = collectAnnual({
      year: 2026, practice: false, groupId: null, limitMinutes: 52 * 60,
      months: [
        { month: '2026-01', report: rep('2026-01', [emp({ employeeId: 'a', name: '가', lateCount: 2, overtimeMinutes: 90, isClosed: true })]) },
        { month: '2026-02', report: null },
        { month: '2026-03', report: rep('2026-03', [emp({ employeeId: 'a', name: '가', lateCount: 1, overtimeMinutes: 30, absentDays: 1 }), emp({ employeeId: 'b', name: '나', holidayMinutes: 480 })]) },
      ],
    });
    expect(r.employees.map((e) => e.name)).toEqual(['가', '나']);
    const a = r.employees[0];
    expect(a.months).toBe(2);
    expect(a.closedMonths).toBe(1);
    expect(empTotal(a, 'late')).toBe(3);
    expect(empTotal(a, 'overtime')).toBe(2); // 120분 = 2시간
    expect(empMonths(a, 'late')).toEqual([2, null, 1, null, null, null, null, null, null, null, null, null]);
    expect(empTotal(r.employees[1], 'holiday')).toBe(8);
  });

  it('달을 넘는 주도 한 주로 합쳐 52시간을 본다', () => {
    // 2026-03-30(월)~04-05(일): 3월에 2일 × 9시간, 4월에 5일 × 7시간 = 53시간 → 넘음. 달마다 따로 보면 넘지 않는다
    const r = collectAnnual({
      year: 2026, practice: false, groupId: null, limitMinutes: 52 * 60,
      months: [
        { month: '2026-03', report: rep('2026-03', [emp({ employeeId: 'a', name: '가', dayTotals: days('2026-03-30', 2, 9 * 60) })]) },
        { month: '2026-04', report: rep('2026-04', [emp({ employeeId: 'a', name: '가', dayTotals: [...days('2026-04-01', 5, 7 * 60), ...days('2026-04-06', 5, 8 * 60)] })]) },
      ],
    });
    const a = r.employees[0];
    expect(a.overWeeks).toEqual([{ monday: '2026-03-30', minutes: 53 * 60 }]);
    expect(empTotal(a, 'over52')).toBe(1);
    expect(empMonths(a, 'over52')[2]).toBe(1); // 3월에 시작한 주
    expect(empMonths(a, 'over52')[3]).toBe(0);
  });

  it('딱 52시간은 넘은 것이 아니다', () => {
    const r = collectAnnual({ year: 2026, practice: false, groupId: null, limitMinutes: 52 * 60, months: [{ month: '2026-05', report: rep('2026-05', [emp({ employeeId: 'a', name: '가', dayTotals: days('2026-05-04', 4, 13 * 60) })]) }] });
    expect(r.employees[0].overWeeks).toEqual([]);
  });

  it('mondayOf — 그 주 월요일', () => {
    expect(mondayOf('2026-10-16')).toBe('2026-10-12'); // 금
    expect(mondayOf('2026-10-18')).toBe('2026-10-12'); // 일
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
  });
});
