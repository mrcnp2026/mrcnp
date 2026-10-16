// 연간 리포트의 순수 계산 — 달마다의 근태 리포트를 직원별로 모아 1월~12월 칸과 1년 합계를 만든다. DB를 읽지 않는다.
import type { AttReport } from '@/lib/report-attendance';

export type AnnualSum = { regularMinutes: number; overtimeMinutes: number; holidayMinutes: number; nightMinutes: number; netMinutes: number; lateCount: number; absentDays: number; paidLeaveDays: number; unpaidLeaveDays: number };
/** 한 달 칸. null = 그 달은 셀 기록이 없다(입사 전 · 퇴사 뒤 · 규칙 없음 · 아직 오지 않은 달) */
export type AnnualCell = (AnnualSum & { isClosed: boolean }) | null;
export type OverWeek = { monday: string; minutes: number };
export type AnnualEmp = {
  employeeId: string;
  name: string;
  employeeNo: string | null;
  groupId: string | null; // 가장 마지막 달의 소속
  cells: AnnualCell[]; // 1월~12월 (12칸)
  total: AnnualSum;
  months: number; // 기록이 있는 달 수
  closedMonths: number; // 마감한 달 수
  overWeeks: OverWeek[]; // 주 52시간을 넘은 주
};
export type AnnualReport = { year: number; practice: boolean; groupId: string | null; months: string[]; employees: AnnualEmp[]; generatedAt: string };

export const ANNUAL_METRICS = ['regular', 'overtime', 'holiday', 'night', 'late', 'absent', 'leave', 'over52'] as const;
export type AnnualMetric = (typeof ANNUAL_METRICS)[number];

const zero = (): AnnualSum => ({ regularMinutes: 0, overtimeMinutes: 0, holidayMinutes: 0, nightMinutes: 0, netMinutes: 0, lateCount: 0, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0 });
const KEYS = Object.keys(zero()) as (keyof AnnualSum)[];
const hours = (m: number) => Math.round((m / 60) * 10) / 10;

/** 항목 하나의 값 — 시간 항목은 시간(소수 첫째 자리), 나머지는 회 · 일 */
export function metricValue(s: AnnualSum, k: Exclude<AnnualMetric, 'over52'>): number {
  switch (k) {
    case 'regular': return hours(s.regularMinutes);
    case 'overtime': return hours(s.overtimeMinutes);
    case 'holiday': return hours(s.holidayMinutes);
    case 'night': return hours(s.nightMinutes);
    case 'late': return s.lateCount;
    case 'absent': return s.absentDays;
    case 'leave': return s.paidLeaveDays;
  }
}

/** 날짜의 그 주 월요일 (YYYY-MM-DD) */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function collectAnnual(args: { year: number; months: { month: string; report: AttReport | null }[]; limitMinutes: number; practice: boolean; groupId: string | null }): AnnualReport {
  const by = new Map<string, AnnualEmp & { days: Map<string, number> }>();
  for (const { month, report } of args.months) {
    if (!report) continue;
    const idx = Number(month.slice(5, 7)) - 1;
    for (const e of report.employees) {
      let a = by.get(e.employeeId);
      if (!a) {
        a = { employeeId: e.employeeId, name: e.name, employeeNo: e.employeeNo, groupId: e.groupId, cells: Array.from({ length: 12 }, () => null), total: zero(), months: 0, closedMonths: 0, overWeeks: [], days: new Map() };
        by.set(e.employeeId, a);
      }
      // 이름 · 사번 · 소속은 가장 마지막 달 것으로
      Object.assign(a, { name: e.name, employeeNo: e.employeeNo, groupId: e.groupId });
      const cell: AnnualSum = zero();
      for (const k of KEYS) cell[k] = e[k];
      a.cells[idx] = { ...cell, isClosed: e.isClosed };
      for (const k of KEYS) a.total[k] += cell[k];
      a.months += 1;
      if (e.isClosed) a.closedMonths += 1;
      for (const d of e.dayTotals ?? []) a.days.set(d.date, d.minutes);
    }
  }
  const employees = [...by.values()].map(({ days, ...a }) => {
    const weeks = new Map<string, number>();
    for (const [date, m] of days) weeks.set(mondayOf(date), (weeks.get(mondayOf(date)) ?? 0) + m);
    a.overWeeks = [...weeks].filter(([, m]) => m > args.limitMinutes).map(([monday, minutes]) => ({ monday, minutes })).sort((x, y) => x.monday.localeCompare(y.monday));
    for (const k of KEYS) a.total[k] = Math.round(a.total[k] * 100) / 100;
    return a;
  });
  employees.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { year: args.year, practice: args.practice, groupId: args.groupId, months: args.months.map((m) => m.month), employees, generatedAt: new Date().toISOString() };
}

/** 직원의 1년 합계 한 항목 (52시간 초과 = 넘은 주 수) */
export function empTotal(e: AnnualEmp, k: AnnualMetric): number {
  return k === 'over52' ? e.overWeeks.length : metricValue(e.total, k);
}

/** 직원의 달별 한 항목 (1월~12월, 기록 없는 달은 null). 52시간 초과는 그 달에 시작한 넘은 주 수 */
export function empMonths(e: AnnualEmp, k: AnnualMetric): (number | null)[] {
  return e.cells.map((c, i) => {
    if (!c) return null;
    if (k !== 'over52') return metricValue(c, k);
    const mm = String(i + 1).padStart(2, '0');
    return e.overWeeks.filter((w) => w.monday.slice(5, 7) === mm).length;
  });
}

export const isMetric = (v: unknown): v is AnnualMetric => typeof v === 'string' && (ANNUAL_METRICS as readonly string[]).includes(v);
