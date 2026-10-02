// 월별 근태 증빙 엑셀 (②-4 7-5, 시프티 대조 우선 반영 ③ — 2026-10-02 의뢰인: "내려받아 바로 출력해서 보고할 수 있는 양식").
// 4시트: ① 월간근태확인서(인쇄용 양식) ② 원본데이터 ③ 정정이력(+휴가 내역) ④ 적용기준.
// ★★ 시트1은 값으로 박는다 — 수식 금지 (4-8). 합계도 코드가 계산해 값으로 쓴다.
// ★ 사번은 문자열 칸(numFmt '@')으로 — '001'이 1이 되지 않게. ★ 날짜(Date)와 시각('08:52' 글자)은 다른 열.
// 이 파일은 순수 — 값만 받아 통을 만든다. 데이터 모으기는 attendance-report.ts.
import ExcelJS from 'exceljs';

export type ReportPerson = {
  employeeNo: string | null;
  name: string;
  workDays: number;
  netMinutes: number; // 실제 근로 (휴게 제외)
  approvedOvertime: number;
  approvedNight: number;
  approvedHoliday: number;
  pendingOvertime: number; // 승인 대기 (연장+야간+휴일)
  lateCount: number;
  lateMinutes: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  notes: string[]; // 확인 필요 사항 (퇴근 미기록 등)
};
export type ReportPunch = { employeeNo: string | null; name: string; workDate: string; kind: string; original: string | null; corrected: string | null; correctionType: string | null; officeVerified: boolean | null; approvedWork?: string | null; source: string; note: string | null };
export type ReportCorrection = { employeeNo: string | null; name: string; workDate: string; kind: string; type: string; original: string | null; requested: string | null; reason: string; status: string; requestedBy: string; requestedAt: string; decidedBy: string | null; decidedAt: string | null };
export type ReportLeave = { employeeNo: string | null; name: string; type: string; start: string; end: string; days: number; status: string; decidedBy: string | null; decidedAt: string | null };
export type ReportWork = { employeeNo: string | null; name: string; kind: string; start: string; end: string; hours: string | null; place: string; status: string; decidedBy: string | null; decidedAt: string | null };

export type AttendanceReport = {
  company: string;
  yearMonth: string; // 'YYYY-MM'
  from: string;
  to: string;
  countedUntil: string; // 집계 기준일 (이번 달이면 오늘)
  generatedAt: string; // 'YYYY-MM-DD HH:MM' 사무실 시각
  generatedBy: string;
  practice: boolean;
  unlocked: boolean; // 월 마감(잠금) 전
  people: ReportPerson[];
  punches: ReportPunch[];
  corrections: ReportCorrection[];
  leave: ReportLeave[];
  work: ReportWork[]; // 외근·출장·재택 신청 (②-3)
  rules: { effectiveFrom: string; hours: string; grace: string; breakTime: string; workdays: string; restDay: string }[];
  holidays: { date: string; kind: string }[];
  settings: [string, string][];
};

/** 분 → '162:30' (사람이 읽는 시간). 0은 '0:00' */
export const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.abs(min) % 60).padStart(2, '0')}`;
const dateCell = (d: string) => new Date(`${d}T00:00:00Z`); // 날짜만 — 시간대 해석으로 밀리지 않게 UTC 자정 + 날짜 서식

const C = { ink: 'FF1E293B', muted: 'FF64748B', line: 'FF94A3B8', head: 'FFE8EEF8', total: 'FFF1F5F9', warn: 'FFB45309', danger: 'FFB91C1C', primary: 'FF1E40AF' };
const thin = { style: 'thin' as const, color: { argb: C.line } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const FONT = 'Malgun Gothic';

export function buildAttendanceWorkbook(r: AttendanceReport): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = r.generatedBy;
  wb.created = new Date();
  sheetSummary(wb, r);
  sheetRaw(wb, r);
  sheetHistory(wb, r);
  sheetBasis(wb, r);
  return wb;
}

// ───────────────────────── 시트 1: 월간근태확인서 (A4 세로 1장) ─────────────────────────
const SUM_COLS = [
  { h: 'No', w: 4.5 },
  { h: '사번', w: 9 },
  { h: '성명', w: 14 },
  { h: '근무\n일수', w: 6 },
  { h: '총 근로\n(시간)', w: 9.5 },
  { h: '연장\n(인정)', w: 7.5 },
  { h: '야간\n(인정)', w: 7.5 },
  { h: '휴일\n(인정)', w: 7.5 },
  { h: '지각', w: 11 },
  { h: '결근\n(일)', w: 6 },
  { h: '휴가\n(일)', w: 6.5 },
  { h: '비고 (확인 필요)', w: 23 },
] as const;
const LAST = String.fromCharCode(64 + SUM_COLS.length); // 'L'

function sheetSummary(wb: ExcelJS.Workbook, r: AttendanceReport) {
  const ws = wb.addWorksheet('월간근태확인서', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: r.people.length > 30 ? 0 : 1, // 30명까지는 1장, 넘으면 가로만 맞추고 여러 장
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 },
    },
    headerFooter: { oddFooter: `&L&8${r.company} 월간 근태 확인서 ${r.yearMonth}&R&8&P / &N 쪽` },
  });
  ws.columns = SUM_COLS.map((c) => ({ width: c.w }));
  const [y, m] = r.yearMonth.split('-');
  const merge = (row: number, text: string, style: Partial<ExcelJS.Style> = {}, height?: number) => {
    ws.mergeCells(`A${row}:${LAST}${row}`);
    const cell = ws.getCell(`A${row}`);
    cell.value = text;
    Object.assign(cell, { style: { font: { name: FONT, size: 10, color: { argb: C.ink } }, alignment: { vertical: 'middle', wrapText: true }, ...style } });
    if (height) ws.getRow(row).height = height;
    return cell;
  };

  let row = 1;
  merge(row++, '월간 근태 확인서', { font: { name: FONT, size: 20, bold: true, color: { argb: C.ink } }, alignment: { horizontal: 'center', vertical: 'middle' } }, 40);
  merge(row++, `${y}년 ${Number(m)}월`, { font: { name: FONT, size: 12, color: { argb: C.muted } }, alignment: { horizontal: 'center', vertical: 'middle' } }, 22);
  if (r.practice) merge(row++, '※ 연습 기록입니다 — 실제 근태가 아니므로 보고·증빙에 쓰지 마세요.', { font: { name: FONT, size: 10, bold: true, color: { argb: C.danger } }, alignment: { horizontal: 'center' } }, 20);
  row++;

  // 기본 정보 — 2열 × 2줄 (라벨 칸 회색)
  const info: [string, string, string, string][] = [
    ['사업장', r.company, '대상 기간', `${r.from} ~ ${r.to}`],
    ['작성일시', r.generatedAt, '집계 기준일', r.countedUntil],
  ];
  for (const [a, b, c, d] of info) {
    ws.mergeCells(`A${row}:B${row}`);
    ws.mergeCells(`C${row}:F${row}`);
    ws.mergeCells(`G${row}:H${row}`);
    ws.mergeCells(`I${row}:${LAST}${row}`);
    for (const [col, v, label] of [['A', a, true], ['C', b, false], ['G', c, true], ['I', d, false]] as const) {
      const cell = ws.getCell(`${col}${row}`);
      cell.value = v;
      cell.style = { font: { name: FONT, size: 10, bold: label, color: { argb: C.ink } }, alignment: { vertical: 'middle', horizontal: label ? 'center' : 'left', indent: label ? 0 : 1 }, fill: label ? { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } } : undefined, border: box };
    }
    // 병합된 칸의 테두리를 끝까지
    for (let ci = 1; ci <= SUM_COLS.length; ci++) ws.getRow(row).getCell(ci).border = box;
    ws.getRow(row).height = 22;
    row++;
  }
  if (r.unlocked) merge(row++, '※ 월 마감(잠금) 전 자료입니다. 정정·연장이 더 승인되면 숫자가 바뀔 수 있습니다.', { font: { name: FONT, size: 9, color: { argb: C.warn } } }, 18);
  row++;

  // 직원별 요약표
  const headRow = row;
  SUM_COLS.forEach((c, i) => {
    const cell = ws.getRow(row).getCell(i + 1);
    cell.value = c.h;
    cell.style = { font: { name: FONT, size: 9.5, bold: true, color: { argb: C.ink } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } }, border: box };
  });
  ws.getRow(row).height = 32;
  row++;
  const t = { days: 0, net: 0, ot: 0, night: 0, hol: 0, lateC: 0, lateM: 0, absent: 0, leave: 0 };
  r.people.forEach((p, i) => {
    const leave = p.paidLeaveDays + p.unpaidLeaveDays;
    const vals: (string | number)[] = [
      i + 1, p.employeeNo ?? '', p.name, p.workDays, hm(p.netMinutes), hm(p.approvedOvertime), hm(p.approvedNight), hm(p.approvedHoliday),
      p.lateCount ? `${p.lateCount}회 ${p.lateMinutes}분` : '-', p.absentDays || '-', leave || '-',
      [p.pendingOvertime ? `연장 승인 대기 ${hm(p.pendingOvertime)}` : '', p.unpaidLeaveDays ? `무급 ${p.unpaidLeaveDays}일` : '', ...p.notes].filter(Boolean).join(', '),
    ];
    const rr = ws.getRow(row);
    vals.forEach((v, ci) => {
      const cell = rr.getCell(ci + 1);
      cell.value = v;
      const right = ci >= 3 && ci <= 10;
      cell.style = {
        font: { name: FONT, size: 9.5, color: { argb: (ci === 9 && p.absentDays) || (ci === 8 && p.lateCount) ? C.warn : C.ink } },
        alignment: { horizontal: ci === 0 || ci === 1 ? 'center' : right ? 'right' : 'left', vertical: 'middle', wrapText: ci === 11 || ci === 2, indent: right || ci === 2 || ci === 11 ? 1 : 0 },
        border: box,
        numFmt: ci === 1 ? '@' : undefined,
      };
    });
    rr.height = (vals[11] && String(vals[11]).length > 22) || p.name.length > 11 ? 30 : 20;
    t.days += p.workDays; t.net += p.netMinutes; t.ot += p.approvedOvertime; t.night += p.approvedNight; t.hol += p.approvedHoliday;
    t.lateC += p.lateCount; t.lateM += p.lateMinutes; t.absent += p.absentDays; t.leave += leave;
    row++;
  });
  if (r.people.length === 0) merge(row++, '이 달 집계할 직원이 없습니다.', { alignment: { horizontal: 'center' }, border: box }, 22);
  // 합계 — 값으로 (수식 금지 4-8)
  ws.mergeCells(`A${row}:C${row}`);
  const totals: (string | number)[] = ['합계', '', '', t.days, hm(t.net), hm(t.ot), hm(t.night), hm(t.hol), t.lateC ? `${t.lateC}회 ${t.lateM}분` : '-', t.absent || '-', Math.round(t.leave * 100) / 100 || '-', `${r.people.length}명`];
  totals.forEach((v, ci) => {
    const cell = ws.getRow(row).getCell(ci + 1);
    if (ci === 1 || ci === 2) return;
    cell.value = v;
    cell.style = { font: { name: FONT, size: 9.5, bold: true, color: { argb: C.ink } }, alignment: { horizontal: ci === 0 ? 'center' : ci === 11 ? 'left' : 'right', vertical: 'middle', indent: ci === 11 ? 1 : 0, shrinkToFit: ci > 0 && ci < 11 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.total } }, border: box };
  });
  for (let ci = 1; ci <= SUM_COLS.length; ci++) ws.getRow(row).getCell(ci).border = box;
  ws.getRow(row).height = 22;
  row += 2;

  // 용어 설명
  const legend = [
    '· 총 근로: 출퇴근 기록에서 휴게시간(점심)을 뺀 실제 근로시간 합계 (시:분).',
    '· 연장·야간·휴일(인정): 관리자가 승인한 시간만. 승인 대기분은 비고에 따로 적었습니다.',
    '· 지각: 출근 기준 시각 + 유예시간 이후 출근. 결근: 근무일인데 출근 기록과 승인된 휴가가 모두 없는 날.',
    '· 휴가: 승인된 연차·반차·병가·경조사·무급휴가 일수 (반차 0.5일). 유급휴가일은 결근에 넣지 않습니다.',
    '· 원래 찍은 시각과 정정 내역은 「원본데이터」「정정이력」 시트, 적용한 근무규칙은 「적용기준」 시트에 있습니다.',
  ];
  for (const l of legend) merge(row++, l, { font: { name: FONT, size: 8.5, color: { argb: C.muted } } }, 15);
  row++;
  merge(row++, '위 내용은 출퇴근 기록과 승인된 정정·연장·휴가를 바탕으로 작성되었음을 확인합니다.', { font: { name: FONT, size: 10, color: { argb: C.ink } }, alignment: { horizontal: 'center', vertical: 'middle' } }, 24);
  row++;

  // 서명란 — 작성 / 확인 / 승인 (각 4칸 병합)
  const blocks = [['A', 'D', '작 성'], ['E', 'H', '확 인'], ['I', LAST, '승 인']] as const;
  for (const [a, b, label] of blocks) {
    ws.mergeCells(`${a}${row}:${b}${row}`);
    ws.mergeCells(`${a}${row + 1}:${b}${row + 1}`);
    ws.mergeCells(`${a}${row + 2}:${b}${row + 2}`);
    const h = ws.getCell(`${a}${row}`);
    h.value = label;
    h.style = { font: { name: FONT, size: 10, bold: true, color: { argb: C.ink } }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } }, border: box };
    const s = ws.getCell(`${a}${row + 1}`);
    s.value = '';
    s.style = { border: box };
    const n = ws.getCell(`${a}${row + 2}`);
    n.value = '성명:                    (서명)';
    n.style = { font: { name: FONT, size: 9, color: { argb: C.muted } }, alignment: { horizontal: 'left', vertical: 'middle', indent: 1 }, border: box };
  }
  for (let rr = row; rr <= row + 2; rr++) for (let ci = 1; ci <= SUM_COLS.length; ci++) ws.getRow(rr).getCell(ci).border = box;
  ws.getRow(row).height = 20;
  ws.getRow(row + 1).height = 46;
  ws.getRow(row + 2).height = 20;
  row += 3;

  ws.pageSetup.printArea = `A1:${LAST}${row - 1}`;
  ws.pageSetup.printTitlesRow = `${headRow}:${headRow}`; // 여러 장이면 표 머리를 매 장 반복
}

// ───────────────────────── 시트 2: 원본데이터 ─────────────────────────
function table(ws: ExcelJS.Worksheet, cols: { h: string; w: number; key: string; fmt?: string }[], rows: Record<string, unknown>[], startRow = 1) {
  ws.columns = cols.map((c) => ({ key: c.key, width: c.w }));
  const hr = ws.getRow(startRow);
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.h;
    cell.style = { font: { name: FONT, size: 10, bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: box };
  });
  hr.height = 22;
  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = (r[c.key] ?? null) as ExcelJS.CellValue;
      cell.style = { font: { name: FONT, size: 10 }, border: box, numFmt: c.fmt, alignment: { vertical: 'middle', wrapText: c.w >= 24 } };
    });
  });
  return startRow + 1 + rows.length;
}

function sheetRaw(wb: ExcelJS.Workbook, r: AttendanceReport) {
  const ws = wb.addWorksheet('원본데이터', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const kind = (k: string) => (k === 'in' ? '출근' : k === 'out' ? '퇴근' : k);
  const ctype = (t: string | null) => (t === 'modify' ? '시각 수정' : t === 'void' ? '기록 취소' : t === 'add_missing' ? '빠진 기록 추가' : '');
  const src = (s: string) => (s === 'web' ? '앱' : s === 'admin' ? '관리자 대리 등록' : s === 'correction' ? '정정으로 추가' : s);
  const end = table(
    ws,
    [
      { h: '사번', w: 10, key: 'no', fmt: '@' },
      { h: '성명', w: 10, key: 'name' },
      { h: '근무일', w: 12, key: 'date', fmt: 'yyyy-mm-dd' },
      { h: '구분', w: 7, key: 'kind' },
      { h: '찍은 시각', w: 10, key: 'orig', fmt: '@' },
      { h: '정정 시각', w: 10, key: 'corr', fmt: '@' },
      { h: '정정', w: 13, key: 'ctype' },
      { h: '사무실 확인', w: 18, key: 'office' },
      { h: '경로', w: 14, key: 'src' },
      { h: '근무노트', w: 30, key: 'note' },
    ],
    r.punches.map((p) => ({
      no: p.employeeNo ?? '', name: p.name, date: dateCell(p.workDate), kind: kind(p.kind), orig: p.original ?? '', corr: p.corrected ?? '',
      ctype: ctype(p.correctionType), office: p.officeVerified === null ? '' : p.officeVerified ? '확인' : p.approvedWork ? `미확인(승인된 ${p.approvedWork})` : '미확인', src: src(p.source), note: p.note ?? '',
    })),
  );
  ws.autoFilter = { from: 'A1', to: `J${Math.max(end - 1, 1)}` };
}

// ───────────────────────── 시트 3: 정정이력 + 휴가 내역 ─────────────────────────
function sheetHistory(wb: ExcelJS.Workbook, r: AttendanceReport) {
  const ws = wb.addWorksheet('정정이력', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const st = (s: string) => ({ pending: '대기', approved: '승인', rejected: '거부', cancelled: '취소' })[s] ?? s;
  const kind = (k: string) => (k === 'in' ? '출근' : k === 'out' ? '퇴근' : k);
  const ctype = (t: string) => (t === 'modify' ? '시각 수정' : t === 'void' ? '기록 취소' : t === 'add_missing' ? '빠진 기록 추가' : t);
  let end = table(
    ws,
    [
      { h: '사번', w: 10, key: 'no', fmt: '@' },
      { h: '성명', w: 10, key: 'name' },
      { h: '근무일', w: 12, key: 'date', fmt: 'yyyy-mm-dd' },
      { h: '구분', w: 7, key: 'kind' },
      { h: '정정 종류', w: 13, key: 'type' },
      { h: '원래 시각', w: 10, key: 'orig', fmt: '@' },
      { h: '요청 시각', w: 10, key: 'req', fmt: '@' },
      { h: '사유', w: 28, key: 'reason' },
      { h: '상태', w: 7, key: 'status' },
      { h: '요청자', w: 10, key: 'by' },
      { h: '요청 일시', w: 16, key: 'at', fmt: '@' },
      { h: '처리자', w: 10, key: 'dby' },
      { h: '처리 일시', w: 16, key: 'dat', fmt: '@' },
    ],
    r.corrections.map((c) => ({
      no: c.employeeNo ?? '', name: c.name, date: dateCell(c.workDate), kind: kind(c.kind), type: ctype(c.type), orig: c.original ?? '', req: c.requested ?? '',
      reason: c.reason, status: st(c.status), by: c.requestedBy, at: c.requestedAt, dby: c.decidedBy ?? '', dat: c.decidedAt ?? '',
    })),
  );
  if (r.corrections.length === 0) ws.getCell(`A${end}`).value = '이 달 정정 요청이 없습니다.';
  end += 2;
  const title = ws.getCell(`A${end}`);
  title.value = '휴가 내역';
  title.font = { name: FONT, size: 11, bold: true };
  end++;
  const hr = ws.getRow(end);
  const lh = ['사번', '성명', '시작일', '종료일', '종류', '일수', '', '', '상태', '처리자', '처리 일시'];
  lh.forEach((h, i) => {
    if (!h) return;
    const c = hr.getCell(i + 1);
    c.value = h;
    c.style = { font: { name: FONT, size: 10, bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } }, alignment: { horizontal: 'center' }, border: box };
  });
  r.leave.forEach((l, i) => {
    const row = ws.getRow(end + 1 + i);
    const vals: [number, ExcelJS.CellValue, string?][] = [
      [1, l.employeeNo ?? '', '@'], [2, l.name], [3, dateCell(l.start), 'yyyy-mm-dd'], [4, dateCell(l.end), 'yyyy-mm-dd'], [5, l.type], [6, l.days, '0.##'],
      [9, st(l.status)], [10, l.decidedBy ?? ''], [11, l.decidedAt ?? '', '@'],
    ];
    for (const [ci, v, f] of vals) {
      const c = row.getCell(ci);
      c.value = v;
      c.style = { font: { name: FONT, size: 10 }, border: box, numFmt: f };
    }
  });
  if (r.leave.length === 0) ws.getCell(`A${end + 1}`).value = '이 달 휴가 신청이 없습니다.';

  // 외근·출장·재택 내역 (②-3 7-11)
  end += Math.max(r.leave.length, 1) + 2;
  const wt = ws.getCell(`A${end}`);
  wt.value = '외근·출장·재택 내역';
  wt.font = { name: FONT, size: 11, bold: true };
  end++;
  const wh = ['사번', '성명', '시작일', '종료일', '종류', '시간', '장소', '', '상태', '처리자', '처리 일시'];
  wh.forEach((h, i) => {
    if (!h) return;
    const c = ws.getRow(end).getCell(i + 1);
    c.value = h;
    c.style = { font: { name: FONT, size: 10, bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } }, alignment: { horizontal: 'center' }, border: box };
  });
  r.work.forEach((w, i) => {
    const row = ws.getRow(end + 1 + i);
    const vals: [number, ExcelJS.CellValue, string?][] = [
      [1, w.employeeNo ?? '', '@'], [2, w.name], [3, dateCell(w.start), 'yyyy-mm-dd'], [4, dateCell(w.end), 'yyyy-mm-dd'], [5, w.kind], [6, w.hours ?? '하루', '@'], [7, w.place],
      [9, st(w.status)], [10, w.decidedBy ?? ''], [11, w.decidedAt ?? '', '@'],
    ];
    for (const [ci, v, f] of vals) {
      const c = row.getCell(ci);
      c.value = v;
      c.style = { font: { name: FONT, size: 10 }, border: box, numFmt: f };
    }
  });
  if (r.work.length === 0) ws.getCell(`A${end + 1}`).value = '이 달 외근·출장·재택 신청이 없습니다.';
}

// ───────────────────────── 시트 4: 적용기준 ─────────────────────────
function sheetBasis(wb: ExcelJS.Workbook, r: AttendanceReport) {
  const ws = wb.addWorksheet('적용기준', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 22 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 22 }, { width: 10 }];
  let row = 1;
  const line = (text: string, bold = false, color = C.ink) => {
    const c = ws.getCell(`A${row++}`);
    c.value = text;
    c.font = { name: FONT, size: bold ? 11 : 10, bold, color: { argb: color } };
  };
  line(`이 파일은 ${r.generatedAt}에 ${r.generatedBy}이(가) 생성했습니다.`, true);
  line(`${r.company} · ${r.yearMonth} · ${r.practice ? '연습 기록' : '실제 기록'}${r.unlocked ? ' · 월 마감 전' : ''}`, false, C.muted);
  row++;
  line('근무규칙 (이 달에 적용된 판)', true);
  table(
    ws,
    [
      { h: '적용 시작일', w: 22, key: 'from', fmt: '@' },
      { h: '근무시간', w: 16, key: 'hours' },
      { h: '지각 유예', w: 14, key: 'grace' },
      { h: '휴게시간', w: 16, key: 'brk' },
      { h: '근무 요일', w: 22, key: 'days' },
      { h: '주휴일', w: 10, key: 'rest' },
    ],
    r.rules.map((x) => ({ from: x.effectiveFrom, hours: x.hours, grace: x.grace, brk: x.breakTime, days: x.workdays, rest: x.restDay })),
    row,
  );
  row += r.rules.length + 2;
  line('이 달 휴일', true);
  if (r.holidays.length === 0) line('없음', false, C.muted);
  for (const h of r.holidays) {
    ws.getCell(`A${row}`).value = h.date;
    ws.getCell(`B${row}`).value = h.kind;
    row++;
  }
  row++;
  line('집계 기준값', true);
  for (const [k, v] of r.settings) {
    ws.getCell(`A${row}`).value = k;
    ws.getCell(`A${row}`).font = { name: FONT, size: 10, color: { argb: C.muted } };
    ws.getCell(`B${row}`).value = v;
    ws.getCell(`B${row}`).font = { name: FONT, size: 10 };
    row++;
  }
}

/** 시트1에 수식이 하나라도 있으면 true — 검사용 (4-8) */
export function hasFormula(ws: ExcelJS.Worksheet): boolean {
  let found = false;
  ws.eachRow((row) => row.eachCell((c) => {
    if (c.type === ExcelJS.ValueType.Formula) found = true;
  }));
  return found;
}
