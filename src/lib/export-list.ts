// 목록 내려받기 엑셀 — PC 목록 화면의 [다운로드] (직원 · 휴가 내역). 한 장짜리 표: 머리줄 + 줄.
// 금액은 넣지 않는다(R-10-6). 휴가 사유는 건강 · 개인 사정이 적힐 수 있어 넣지 않는다.
import 'server-only';
import ExcelJS from 'exceljs';

export type ListSheet = { title: string; cols: { h: string; w: number }[]; rows: (string | number | null)[][] };

export function buildListWorkbook(s: ListSheet, by: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = by;
  wb.created = new Date();
  const ws = wb.addWorksheet(s.title, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = s.cols.map((c) => ({ width: c.w }));
  const head = ws.addRow(s.cols.map((c) => c.h));
  head.font = { name: 'Malgun Gothic', bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F7' } };
  // 글자 칸은 글자 그대로 넣는다 — =, +, - 로 시작하는 이름이 수식으로 읽히지 않게
  for (const r of s.rows) ws.addRow(r.map((v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v))).font = { name: 'Malgun Gothic' };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.cols.length } };
  return wb;
}
