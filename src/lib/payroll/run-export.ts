// 급여대장 엑셀 (PRD v1.3 23.4) — 회사가 손으로 만들던 대장 모양 그대로 (2026-11-05 의뢰인: 「26.10 김해3공장 급여대장」 양식으로, 영어 · 해시 · 번호는 빼고).
//   급여대장(표지) · 직원별 근무현황(날짜표 + 시급 × 할증 = 금액 + 기타 수당 + 공제) · 지급·공제 내역 · 확인 네 갈래. 숫자는 ledger-data(PDF와 같은 자료).
// ★ 엑셀 수식을 넣지 않는다(서버와 다른 값이 나오지 않게). ★ 주민번호 · 계좌는 없다. 이체용 파일이 아니다. 확정 전 대장은 제목에 「검토용」.
import 'server-only';
import ExcelJS from 'exceljs';
import { hm, LEDGER_ROWS, loadLedger, payTypeKo, WEEKDAY, type LeaveTone } from './ledger-data';
import type { RunRow } from './run-data';

const FONT = 'Malgun Gothic';
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const C = { head: fill('FFE2EFDA'), yellow: fill('FFFFFF00'), rate: fill('FFFFF2CC') };
const TONE: Record<LeaveTone, ExcelJS.Fill> = { annual: fill('FFFFC000'), out: fill('FFBDD7EE'), family: fill('FFE2EFDA'), sick: fill('FFFF7C80') };
const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const WON = '"₩" #,##0;[Red]-"₩" #,##0;"₩" -';
const HRS = '0.00';
const RED = 'FFC00000', BLUE = 'FF2F75B5';
const safe = (v: string | number | null) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v); // 글자가 수식으로 읽히지 않게
type V = string | number | null;

export type RunExportLabels = { status: string; kind: string; mode: string; line: (code: string, fallback: string) => string; pay: string; deduction: string; employer: string; auto: string; manual: string; override: string; blocked: string; ok: string; draftBanner: string; finalBanner: string; blocker: (code: string) => string };

function put(ws: ExcelJS.Worksheet, r: number, c: number, v: V, o: { bold?: boolean; fill?: ExcelJS.Fill; fmt?: string; align?: 'left' | 'center' | 'right'; color?: string; size?: number; border?: boolean } = {}) {
  const cell = ws.getCell(r, c);
  cell.value = safe(v);
  cell.font = { name: FONT, size: o.size ?? 10, bold: o.bold, color: o.color ? { argb: o.color } : undefined };
  if (o.fill) cell.fill = o.fill;
  if (o.fmt && typeof v === 'number') cell.numFmt = o.fmt;
  cell.alignment = { vertical: 'middle', horizontal: o.align ?? (typeof v === 'number' ? 'right' : 'center'), wrapText: true };
  if (o.border !== false) cell.border = box;
}
function span(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number, v: V, o: Parameters<typeof put>[4] = {}) {
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) put(ws, r, c, r === r1 && c === c1 ? v : null, o);
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
}

export async function buildRunWorkbook(args: { run: RunRow; company: string; by: string; now: string; labels: RunExportLabels }): Promise<{ wb: ExcelJS.Workbook; statements: number }> {
  const { run, labels: L } = args;
  const lg = await loadLedger(run, L);
  const { year, mon } = lg;
  const tag = lg.draft ? ` — ${L.draftBanner}` : '';
  const nowKst = new Date(Date.parse(args.now) + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  const wb = new ExcelJS.Workbook();
  wb.creator = args.company;

  // ── 1. 급여대장 (표지) — 회사 대장 1쪽 ──
  {
    const ws = wb.addWorksheet('급여대장', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [6, 12, 20, 16, 15, 16, 12, 30].map((width) => ({ width }));
    span(ws, 1, 1, 1, 8, `${year}년도  ${mon}월  ${args.company} 급여대장${tag}`, { bold: true, size: 16, border: false });
    ws.getRow(1).height = 32;
    ['No.', '성명', '소속', '세전 급여액', '공제 합계', '실지급액', '이체예정일', '비고'].forEach((h, i) => put(ws, 3, i + 1, h, { bold: true, fill: C.head }));
    lg.people.forEach((p, i) => {
      const r = 4 + i;
      put(ws, r, 1, i + 1);
      put(ws, r, 2, p.name);
      put(ws, r, 3, p.group, { align: 'left' });
      put(ws, r, 4, p.ok ? p.pay : null, { fmt: WON, fill: C.yellow });
      put(ws, r, 5, p.ok ? p.deduction : null, { fmt: WON });
      put(ws, r, 6, p.ok ? p.net : null, { fmt: WON });
      put(ws, r, 7, run.payDate.slice(5).replace('-', '.'));
      put(ws, r, 8, p.ok ? payTypeKo(p.payType) : `${L.blocked} — ${p.reason}`, { align: 'left', color: p.ok ? undefined : RED });
    });
    const r = 4 + lg.people.length;
    span(ws, r, 1, r, 3, '합계', { bold: true, fill: C.head });
    put(ws, r, 4, lg.sums.pay, { fmt: WON, bold: true });
    put(ws, r, 5, lg.sums.deduction, { fmt: WON, bold: true });
    put(ws, r, 6, lg.sums.net, { fmt: WON, bold: true });
    put(ws, r, 7, null);
    put(ws, r, 8, `계산 ${lg.sums.ok}명${lg.sums.blocked ? ` · 막힘 ${lg.sums.blocked}명` : ''}`, { align: 'left' });
  }

  // ── 2. 직원별 근무현황 — 회사 대장 2쪽부터 ──
  const used = new Set<string>(['급여대장', '지급·공제 내역', '확인']);
  for (const p of lg.people) {
    if (!p.ok) continue;
    let sheetName = p.name.slice(0, 28) || '직원';
    for (let k = 2; used.has(sheetName); k++) sheetName = `${p.name.slice(0, 25)} (${k})`;
    used.add(sheetName);
    const ws = wb.addWorksheet(sheetName, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
    ws.columns = [{ width: 9 }, { width: 7 }, ...Array.from({ length: 16 }, () => ({ width: 8.2 }))];

    span(ws, 1, 1, 1, 3, `${p.group} 근무현황`, { bold: true, size: 13, border: false, align: 'left', color: 'FF548235' });
    span(ws, 1, 5, 1, 6, `${year}년`, { bold: true, fill: C.yellow });
    put(ws, 1, 7, `${mon}월`, { bold: true, fill: C.yellow });
    span(ws, 1, 8, 1, 9, p.name, { bold: true, fill: C.yellow });
    span(ws, 1, 11, 1, 12, '연차사용', { bold: true, fill: TONE.annual });
    put(ws, 1, 13, '외출', { bold: true, fill: TONE.out });
    put(ws, 1, 14, '경조사', { bold: true, fill: TONE.family });
    span(ws, 1, 15, 1, 16, '병가/하계휴가', { bold: true, fill: TONE.sick });
    ws.getRow(1).height = 24;

    let r = 3;
    for (const half of lg.halves) {
      span(ws, r, 1, r + 1, 2, '구분', { bold: true, fill: C.head });
      half.forEach((d, i) => {
        const color = lg.isRed(d) ? RED : lg.isSat(d) ? BLUE : undefined;
        put(ws, r, 3 + i, +d.slice(8), { color });
        put(ws, r + 1, 3 + i, WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()], { color });
      });
      LEDGER_ROWS.forEach(([label, k], j) => {
        const rr = r + 2 + j;
        if (k === 'early') span(ws, rr, 1, rr + 1, 1, '연장\n근무', { fill: C.head });
        else if (k !== 'ot') span(ws, rr, 1, rr, 2, label, { fill: C.head });
        if (k === 'early' || k === 'ot') put(ws, rr, 2, label, { fill: C.head });
        half.forEach((d, i) => {
          const g = p.grid.get(d)!;
          const worked = g.base > 0 && (g.early > 0 || g.ot > 0);
          const show = g[k] > 0 || ((k === 'early' || k === 'ot') && worked);
          put(ws, rr, 3 + i, show ? hm(g[k]) : null, { fmt: HRS, align: 'center', fill: k === 'base' && g.leave ? TONE[g.leave.tone] : undefined, color: k === 'rest' || k === 'ph' || (k === 'hol' && !lg.isSat(d)) ? RED : k === 'hol' ? BLUE : undefined });
        });
      });
      const tr = r + 2 + LEDGER_ROWS.length;
      span(ws, tr, 1, tr, 2, 'total', { fill: C.head });
      half.forEach((d, i) => { const g = p.grid.get(d)!; put(ws, tr, 3 + i, hm(g.base + g.early + g.ot + g.hol + g.hol8 + g.rest + g.ph), { fmt: HRS, align: 'center' }); });
      half.forEach((d, i) => { const g = p.grid.get(d)!; if (g.leave) put(ws, tr + 1, 3 + i, g.leave.label, { fill: TONE[g.leave.tone], size: 9, border: false }); });
      r = tr + 3;
    }

    // 시급 × 할증 = 금액 · 기타 수당
    ['구분', '계', '시급', '할증'].forEach((h, i) => span(ws, r, 1 + i * 2, r, 2 + i * 2, h, { bold: true, fill: C.head }));
    span(ws, r, 9, r, 11, '급 여 계 산', { bold: true, fill: C.head });
    span(ws, r, 13, r, 14, '항목', { bold: true, fill: C.head });
    span(ws, r, 15, r, 16, '지급액', { bold: true, fill: C.head });
    span(ws, r, 17, r, 18, '내역', { bold: true, fill: C.head });
    p.lines.forEach((l, j) => {
      const rr = r + 1 + j;
      span(ws, rr, 1, rr, 2, l.label, { fill: C.head });
      span(ws, rr, 3, rr, 4, l.qty, { fmt: HRS });
      span(ws, rr, 5, rr, 6, l.rate, { fmt: '#,##0', fill: C.rate, align: 'center' });
      span(ws, rr, 7, rr, 8, l.factor, { fmt: '0.0#', align: 'center' });
      span(ws, rr, 9, rr, 11, l.amt || null, { fmt: WON });
    });
    const tr = r + 1 + p.lines.length;
    span(ws, tr, 1, tr, 2, 'total', { bold: true, fill: C.head });
    span(ws, tr, 3, tr, 4, hm(p.lines.reduce((a, l) => a + (l.qty ?? 0) * 60, 0)), { fmt: HRS, bold: true });
    span(ws, tr, 5, tr, 8, null);
    span(ws, tr, 9, tr, 11, p.timeSum, { fmt: WON, bold: true, fill: C.yellow });
    const extraRows = Math.max(p.lines.length - 1, p.extras.length);
    span(ws, r + 1, 12, r + extraRows, 12, '기\n타\n\n수\n당', { fill: C.head });
    for (let j = 0; j < extraRows; j++) {
      const it = p.extras[j];
      span(ws, r + 1 + j, 13, r + 1 + j, 14, it?.label ?? null, { fill: C.head });
      span(ws, r + 1 + j, 15, r + 1 + j, 16, it ? it.amount : null, { fmt: WON });
      span(ws, r + 1 + j, 17, r + 1 + j, 18, it?.note || null, { align: 'left' });
    }
    const sumRow = r + 1 + extraRows;
    span(ws, sumRow, 13, sumRow, 14, '합계', { bold: true, fill: C.head });
    span(ws, sumRow, 15, sumRow, 16, p.extraSum, { fmt: WON, bold: true, fill: C.yellow });
    span(ws, sumRow, 17, sumRow, 18, null);
    const grand = Math.max(tr, sumRow) + 1;
    span(ws, grand, 12, grand, 14, '급여합계', { bold: true, fill: C.yellow });
    span(ws, grand, 15, grand, 18, p.pay, { fmt: WON, bold: true, fill: C.yellow });

    // 공제 · 실지급 (회사 대장에는 없던 칸 — 명세서와 같은 값)
    let dr = grand + 2;
    span(ws, dr, 1, dr, 4, '공제 항목', { bold: true, fill: C.head });
    span(ws, dr, 5, dr, 8, '금액', { bold: true, fill: C.head });
    for (const d of p.deductions) { dr++; span(ws, dr, 1, dr, 4, d.label, { align: 'left' }); span(ws, dr, 5, dr, 8, d.amount, { fmt: WON }); }
    dr++;
    span(ws, dr, 1, dr, 4, '공제 합계', { bold: true, fill: C.head });
    span(ws, dr, 5, dr, 8, p.deduction, { fmt: WON, bold: true });
    dr++;
    span(ws, dr, 1, dr, 4, '실지급액', { bold: true, fill: C.yellow });
    span(ws, dr, 5, dr, 8, p.net, { fmt: WON, bold: true, fill: C.yellow });
    dr += 2;
    put(ws, dr, 1, '특이사항', { bold: true, fill: C.head });
    span(ws, dr, 2, dr, 18, [lg.draft ? L.draftBanner : '', p.closed ? '근태 마감됨' : '근태 마감 안 됨', `지급일 ${run.payDate}`].filter(Boolean).join(' · '), { align: 'left' });
  }

  // ── 3. 지급·공제 내역 ──
  {
    const ws = wb.addWorksheet('지급·공제 내역', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ state: 'frozen', ySplit: 2 }] });
    ws.columns = [12, 18, 22, 8, 11, 12, 8, 14, 40, 8].map((width) => ({ width }));
    span(ws, 1, 1, 1, 10, `${year}년 ${mon}월 지급·공제 내역${tag}`, { bold: true, size: 12, border: false, align: 'left' });
    ['이름', '소속', '항목', '구분', '시간·수량', '단가', '배율', '금액', '계산 내용', '입력'].forEach((h, i) => put(ws, 2, i + 1, h, { bold: true, fill: C.head }));
    lg.items.forEach((i, j) => {
      const r = 3 + j;
      put(ws, r, 1, i.person);
      put(ws, r, 2, i.group, { align: 'left' });
      put(ws, r, 3, i.label, { align: 'left' });
      put(ws, r, 4, i.kind === 'PAYMENT' ? L.pay : i.kind === 'DEDUCTION' ? L.deduction : L.employer);
      put(ws, r, 5, i.qty, { fmt: '#,##0.##' });
      put(ws, r, 6, i.unit, { fmt: '#,##0' });
      put(ws, r, 7, i.factor, { fmt: '0.0#', align: 'center' });
      put(ws, r, 8, i.amount, { fmt: WON });
      put(ws, r, 9, i.how, { align: 'left' });
      put(ws, r, 10, i.source === 'AUTO' ? L.auto : i.source === 'MANUAL' ? L.manual : L.override);
    });
  }

  // ── 4. 확인 — 합계가 맞는지, 무엇으로 만들었는지 (해시 · 번호 대신 쉬운 말) ──
  {
    const ws = wb.addWorksheet('확인', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ width: 28 }, { width: 70 }];
    const s = lg.sums;
    const same = s.pay === s.itemPay && s.deduction === s.itemDeduction && s.net === s.itemPay - s.itemDeduction;
    const won = (v: number) => `${v.toLocaleString('ko-KR')}원`;
    span(ws, 1, 1, 1, 2, `${year}년 ${mon}월 급여대장 확인`, { bold: true, size: 12, border: false, align: 'left' });
    const rows: [string, string, boolean?][] = [
      ['대장', `${L.kind} · ${L.status}${run.revision > 1 ? ` · 정정 ${run.revision - 1}차` : ''}${run.isTest ? ` · ${L.mode}` : ''}`],
      ['귀속 기간', `${run.periodFrom} ~ ${lg.last}`],
      ['지급일', run.payDate],
      ['직원', `계산 ${s.ok}명${s.blocked ? ` · 막힘 ${s.blocked}명` : ''}`],
      ['지급 합계', won(s.pay)],
      ['공제 합계', won(s.deduction)],
      ['실지급 합계', won(s.net)],
      ['사업주 부담 합계', won(s.employer)],
      ['합계 맞춤', same ? '맞음 — 직원별 합계와 항목 합계가 같습니다' : '다름 — 직원별 합계와 항목 합계가 다릅니다. 담당자에게 알려 주세요', !same],
      ['날짜표와 명세서 시간', lg.mismatch.length ? lg.mismatch.join('\n') : '맞음 — 날짜표 합계와 명세서 시간이 같습니다', lg.mismatch.length > 0],
      ['만든 날 · 사람', `${nowKst} · ${args.by}`],
      ['안내', '이체용 파일이 아닙니다. 주민번호 · 계좌는 들어 있지 않습니다. 금액은 프로그램에 저장된 명세서 그대로이며 수식이 없습니다.'],
    ];
    rows.forEach(([k, v, bad], i) => { put(ws, 3 + i, 1, k, { bold: true, fill: C.head, align: 'left' }); put(ws, 3 + i, 2, v, { align: 'left', color: bad ? RED : undefined }); });
  }
  return { wb, statements: lg.people.length };
}
