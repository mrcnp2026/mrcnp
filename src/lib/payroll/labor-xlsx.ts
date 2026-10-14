// 인건비 현황 엑셀 (2026-10-14 인건비 표 확장) — 화면과 같은 계산 · 같은 조건. 값만 넣는다(수식 없음).
// 시트: 요약 · 월별 · 부서별 · 직무별 · 직원별 · 지급항목 · 공제항목. 이 파일은 순수 — 값만 받아 통을 만든다.
import ExcelJS from 'exceljs';
import type { LaborReport, LaborSum } from './labor-cost';

export type LaborLabels = {
  sheets: { summary: string; month: string; group: string; job: string; employee: string; pay: string; deduction: string };
  cols: { name: string; statements: string; pay: string; deduction: string; net: string; employer: string; total: string; people: string; average: string; item: string; amount: string; code: string };
  sum: string;
  title: string;
  conditions: string;
};

const MONEY = '#,##0';

function sumSheet(wb: ExcelJS.Workbook, name: string, first: string, L: LaborLabels, rows: { label: string; s: LaborSum; people?: number }[], total: LaborSum) {
  const ws = wb.addWorksheet(name);
  const withPeople = rows.some((r) => r.people !== undefined);
  ws.addRow([first, L.cols.statements, ...(withPeople ? [L.cols.people] : []), L.cols.pay, L.cols.deduction, L.cols.net, L.cols.employer, L.cols.total]).font = { bold: true };
  for (const r of rows) ws.addRow([r.label, r.s.statements, ...(withPeople ? [r.people ?? 0] : []), r.s.pay, r.s.deduction, r.s.net, r.s.employer, r.s.total]);
  ws.addRow([L.sum, total.statements, ...(withPeople ? [''] : []), total.pay, total.deduction, total.net, total.employer, total.total]).font = { bold: true };
  ws.columns.forEach((c, i) => {
    c.width = i === 0 ? 28 : 16;
    if (i >= (withPeople ? 3 : 2)) c.numFmt = MONEY;
  });
}

export function laborWorkbook(r: LaborReport, L: LaborLabels): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet(L.sheets.summary);
  s.addRow([L.title]).font = { bold: true, size: 14 };
  s.addRow([L.conditions]);
  s.addRow([]);
  const avg = r.total.people > 0 ? Math.round(r.total.total / r.total.people) : 0;
  for (const [k, v] of [[L.cols.people, r.total.people], [L.cols.pay, r.total.pay], [L.cols.deduction, r.total.deduction], [L.cols.net, r.total.net], [L.cols.employer, r.total.employer], [L.cols.total, r.total.total], [L.cols.average, avg]] as const) {
    const row = s.addRow([k, v]);
    if (k !== L.cols.people) row.getCell(2).numFmt = MONEY;
  }
  s.getColumn(1).width = 24;
  s.getColumn(2).width = 18;
  sumSheet(wb, L.sheets.month, L.sheets.month, L, r.months.map((m) => ({ label: m.month, s: m })), r.total);
  sumSheet(wb, L.sheets.group, L.sheets.group, L, r.groups.map((g) => ({ label: g.name, s: g, people: g.people })), r.total);
  sumSheet(wb, L.sheets.job, L.sheets.job, L, r.jobs.map((j) => ({ label: j.name, s: j, people: j.people })), r.total);
  sumSheet(wb, L.sheets.employee, L.cols.name, L, r.employees.map((e) => ({ label: e.employeeNo ? `${e.name} (${e.employeeNo})` : e.name, s: e })), r.total);
  for (const kind of ['PAYMENT', 'DEDUCTION'] as const) {
    const ws = wb.addWorksheet(kind === 'PAYMENT' ? L.sheets.pay : L.sheets.deduction);
    ws.addRow([L.cols.item, L.cols.code, L.cols.people, L.cols.amount]).font = { bold: true };
    const list = r.items.filter((x) => x.kind === kind);
    for (const x of list) ws.addRow([x.label, x.code, x.people, x.amount]);
    ws.addRow([L.sum, '', '', list.reduce((a, x) => a + x.amount, 0)]).font = { bold: true };
    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 16;
    ws.getColumn(4).width = 18;
    ws.getColumn(4).numFmt = MONEY;
  }
  return wb;
}
