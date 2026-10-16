// 연간 리포트 (2026-10-16 의뢰인: 연봉 협상 · 인사평가의 근거 자료) — 직원마다 1월~12월의 근태를 달별로 쌓고 1년 합계를 낸다.
// ★ 달마다의 숫자는 근태 리포트(buildAttendanceDeptReport)를 그대로 쓴다 → 근태 리포트의 그 달 숫자와 같다. 금액은 없다.
// ★ 주 52시간: 달을 넘는 주도 한 주로 센다(달마다 받은 날짜별 합계를 이어 붙여 월요일 기준으로 묶는다). 해를 넘는 주는 그 해 안의 날만 센다.
// 숫자를 모으는 부분(collectAnnual)은 순수함수 — 시험(tests/report-annual.test.ts)이 이것을 본다.
import 'server-only';
import ExcelJS from 'exceljs';
import { OFFICE } from '@/config/office';
import { buildAttendanceDeptReport, type AttReport } from '@/lib/report-attendance';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { collectAnnual, type AnnualReport, type AnnualSum } from '@/lib/report-annual-core';

export { ANNUAL_METRICS, empMonths, empTotal, isMetric, metricValue, type AnnualEmp, type AnnualMetric, type AnnualReport, type AnnualSum } from '@/lib/report-annual-core';

/** 그 해에 셀 수 있는 달: 근무 규칙이 시작한 달부터, 이번 달까지 */
export async function annualMonths(year: number): Promise<string[]> {
  const today = toKstDate(new Date());
  const { data: firstRule } = await createAdminClient().from('work_rules').select('effective_from').eq('active', true).order('effective_from').limit(1);
  const ruleFrom = ((firstRule?.[0]?.effective_from as string | undefined) ?? '9999-12-31').slice(0, 7);
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).filter((m) => m >= ruleFrom && m <= today.slice(0, 7));
}

export async function buildAnnualReport(args: { year: number; practice: boolean; groupId: string | null; employeeId?: string }): Promise<AnnualReport> {
  const months = await annualMonths(args.year);
  // 달마다 따로 센다(근태 리포트와 같은 계산). 셀 수 없는 달(규칙 없음 등)은 빈 달로 둔다
  const reports = await Promise.all(
    months.map((ym) => buildAttendanceDeptReport({ ym, practice: args.practice, groupId: args.groupId, basis: 'at_month_end', withDays: true, employeeId: args.employeeId }).catch(() => null as AttReport | null)),
  );
  return collectAnnual({
    year: args.year,
    months: months.map((m, i) => ({ month: m, report: reports[i] })),
    limitMinutes: OFFICE.weeklyLimitHours * 60,
    practice: args.practice,
    groupId: args.groupId,
  });
}

const FONT = 'Malgun Gothic';
const HEAD: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const safe = (v: string | number | null) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
const h2 = (m: number) => Math.round((m / 60) * 100) / 100;

/** 연간 리포트 → 엑셀 1년치. 화면과 같은 값을 적는다(여기서 다시 계산하지 않는다) */
export function annualWorkbook(r: AnnualReport, args: { company: string; by: string; groupName: string; groupOf: (id: string | null) => string }): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = args.company;
  const banner = `${args.company} · ${r.year}년 연간 근태 리포트 (${r.months.length ? `${Number(r.months[0].slice(5))}월~${Number(r.months[r.months.length - 1].slice(5))}월` : '기록 없음'})`;
  const sheet = (name: string, head: string[], rows: (string | number | null)[][], widths: number[] = []) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2, xSplit: 2 }] });
    ws.columns = head.map((_, i) => ({ width: widths[i] ?? 11 }));
    ws.mergeCells(1, 1, 1, head.length);
    ws.getCell(1, 1).value = banner;
    ws.getCell(1, 1).font = { name: FONT, size: 10, bold: true };
    head.forEach((x, i) => {
      const c = ws.getRow(2).getCell(i + 1);
      c.value = x;
      c.font = { name: FONT, size: 10, bold: true };
      c.fill = HEAD;
      c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    });
    rows.forEach((row, ri) => row.forEach((v, i) => {
      const c = ws.getRow(ri + 3).getCell(i + 1);
      c.value = safe(v);
      c.font = { name: FONT, size: 10 };
      if (typeof v === 'number') c.numFmt = '#,##0.##';
    }));
  };
  const COLS = ['정규 근무(시간)', '연장(시간)', '특근 · 휴일(시간)', '야간(시간)', '실제 근무(시간)', '지각(회)', '결근(일)', '유급휴가(일)', '무급휴가(일)'];
  const vals = (s: AnnualSum) => [h2(s.regularMinutes), h2(s.overtimeMinutes), h2(s.holidayMinutes), h2(s.nightMinutes), h2(s.netMinutes), s.lateCount, s.absentDays, s.paidLeaveDays, s.unpaidLeaveDays];
  sheet('연간 합계', ['사번', '이름', '소속', '기록 달 수', '마감 달 수', ...COLS, '주 52시간 넘은 주'],
    r.employees.map((e) => [e.employeeNo ?? '', e.name, args.groupOf(e.groupId), e.months, e.closedMonths, ...vals(e.total), e.overWeeks.length]), [10, 12, 18]);
  sheet('월별 기록', ['사번', '이름', '달', '마감', ...COLS],
    r.employees.flatMap((e) => e.cells.flatMap((c, i) => (c ? [[e.employeeNo ?? '', e.name, `${r.year}-${String(i + 1).padStart(2, '0')}`, c.isClosed ? '확정' : '잠정', ...vals(c)]] : []))), [10, 12, 10, 8]);
  // 항목마다 직원 × 1월~12월 — 한눈에 달별로 비교 (인사평가용)
  const PIVOTS: { name: string; v: (s: AnnualSum) => number }[] = [
    { name: '정규 근무(시간)', v: (s) => h2(s.regularMinutes) },
    { name: '연장(시간)', v: (s) => h2(s.overtimeMinutes) },
    { name: '특근(시간)', v: (s) => h2(s.holidayMinutes) },
    { name: '지각(회)', v: (s) => s.lateCount },
    { name: '결근(일)', v: (s) => s.absentDays },
    { name: '휴가(일)', v: (s) => s.paidLeaveDays },
  ];
  for (const p of PIVOTS) {
    sheet(p.name, ['사번', '이름', ...Array.from({ length: 12 }, (_, i) => `${i + 1}월`), '합계'],
      r.employees.map((e) => [e.employeeNo ?? '', e.name, ...e.cells.map((c) => (c ? p.v(c) : null)), p.v(e.total)]), [10, 12]);
  }
  sheet('52시간 넘은 주', ['사번', '이름', '주 시작(월)', '그 주 합계(시간)'],
    r.employees.flatMap((e) => e.overWeeks.map((w) => [e.employeeNo ?? '', e.name, w.monday, h2(w.minutes)])), [10, 12, 14, 16]);
  const meta = wb.addWorksheet('안내');
  meta.columns = [{ width: 22 }, { width: 80 }];
  [
    ['해', `${r.year}년`], ['센 달', r.months.join(', ') || '없음'], ['부서 조건', args.groupName], ['기록', r.practice ? '연습' : '운영'], ['생성 일시', r.generatedAt], ['내보낸 사람', args.by],
    ['안내', '달마다의 숫자는 근태 리포트의 그 달 숫자와 같습니다. 마감한 달은 확정, 마감 전 달은 바뀔 수 있는 잠정치입니다. 연장 · 특근 · 야간은 인정(승인)된 시간만 셉니다. 「주 52시간 넘은 주」는 정규 + 연장 + 휴일 근무의 주 합계가 52시간을 넘은 주입니다(달을 넘는 주도 한 주로 셉니다). 금액은 들어 있지 않습니다.'],
  ].forEach((row, i) => row.forEach((v, j) => { const c = meta.getRow(i + 1).getCell(j + 1); c.value = safe(v); c.font = { name: FONT, size: 10, bold: j === 0 }; c.alignment = { wrapText: true, vertical: 'top' }; }));
  return wb;
}
