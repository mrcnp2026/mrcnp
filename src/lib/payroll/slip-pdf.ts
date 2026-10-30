// 급여명세서 PDF (PRD v1.3 23.3) — A4 세로. 값은 저장된 명세서 그대로 적는다(여기서 다시 계산하지 않는다).
// ★ 주민번호 · 계좌는 없다(저장하지 않는다). 사업주 부담 항목은 직원용 면에 넣지 않는다.
// ★ 확정 전 대장은 쪽마다 「검토용」, 연습 자료는 「연습」이라고 찍힌다. 정정본은 판 번호와 사유를 적는다.
// ★ 글자는 파일에 심는다(나눔고딕, SIL OFL — src/assets/fonts). 그래서 어디서 열어도 같은 모양이고 글자 검색이 된다.
import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import subsetFont from 'subset-font';
import { PDFDocument, rgb as ink, type PDFFont } from 'pdf-lib'; // 종이에 찍는 먹색 — 화면 색(theme.ts)과 따로다

export type SlipPdfLine = { kind: 'PAYMENT' | 'DEDUCTION'; label: string; how: string | null; amount: number };
export type SlipPdfLabels = {
  title: string; company: string; no: string; name: string; group: string; period: string; payDate: string; revision: string;
  pay: string; deduction: string; item: string; how: string; amount: string; payTotal: string; deductionTotal: string; net: string; none: string; taxable?: string; exempt?: string;
  draft: string | null; practice: string | null; correction: string | null; familyTemp?: string | null; note: string; formula?: string; thanks?: string; sum?: string; correctionMark?: string | null; page: (n: number, all: number) => string; money: (n: number) => string; // familyTemp: 부양가족 신고 전 「임시」 문구 (묶음 38)
};
// 근로 내역 (임금명세서의 근로일수 · 총 근로시간 · 연장 · 야간 · 휴일 시간, 2026-10-16) — 칸 이름과 값을 이미 글자로 만들어 넘긴다. 없으면 이 칸을 그리지 않는다
export type SlipPdfWork = { title: string; rows: [string, string][] };
export type SlipPdfData = { company: string; no: string; name: string; employeeNo: string; group: string; periodFrom: string; periodTo: string; payDate: string; revision: number; pay: number; deduction: number; net: number; lines: SlipPdfLine[]; labels: SlipPdfLabels; work?: SlipPdfWork | null; tax?: { taxable: number; exempt: number } | null };

const W = 595.28, H = 841.89, M = 42;
const INK = ink(0.1, 0.12, 0.16), MUTED = ink(0.4, 0.44, 0.5), WARN = ink(0.72, 0.3, 0.05);
let fonts: Promise<[Buffer, Buffer]> | null = null;
export const loadFonts = () => (fonts ??= Promise.all(['NanumGothic-Regular.ttf', 'NanumGothic-Bold.ttf'].map((f) => readFile(path.join(process.cwd(), 'src', 'assets', 'fonts', f)))) as Promise<[Buffer, Buffer]>);

/** 쓴 글자만 남긴 글꼴. 끝에 빈 자리를 조금 붙인다 — 추린 글꼴의 마지막 글자가 빈 글자(공백)이면 pdf-lib의 글꼴 읽기가 파일 끝을 넘어 읽다 멈추기 때문 */
export async function slim(file: Buffer, text: string): Promise<Uint8Array> {
  try {
    const cut = await subsetFont(file, text, { targetFormat: 'truetype' });
    const out = new Uint8Array(cut.length + 32);
    out.set(cut);
    return out;
  } catch (e) {
    // 추리기가 안 되는 환경이면 글꼴을 통째로 심는다(파일이 1.6MB쯤으로 커질 뿐 내용은 같다)
    console.error(JSON.stringify({ route: 'slip-pdf', code: 'font_subset_failed', detail: (e as Error).message.slice(0, 200) }));
    return file;
  }
}

// 2026-10-30 의뢰인: 「서체만 맘에 들고 엑셀 방식은 싫다 — 급여4처럼, 그보다 잘」 → 회사가 쓰던 명세서(스샷/스샷2/급여4.png) 배치로 다시 짬. 글꼴(나눔명조)은 그대로.
//   제목 · 회사명칭 · 지급일 → 사원 정보 상자 → 근로시간(이름 위 · 값 아래) → [지급내역] [공제내역] 왼쪽 파란 띠 + 한 줄 6칸(이름 위 · 금액 아래)
//   → [합계] 지급총액 · 공제총액 · 차인지급액 → 계산방법 표(산출방식 토글이 켜졌을 때만 줄이 있다) → 「귀하의 노고에 감사드립니다.」 · 회사명
let serif: Promise<[Buffer, Buffer]> | null = null;
const loadSerif = () => (serif ??= Promise.all(['NanumMyeongjo-Regular.ttf', 'NanumMyeongjo-Bold.ttf'].map((f) => readFile(path.join(process.cwd(), 'src', 'assets', 'fonts', f)))) as Promise<[Buffer, Buffer]>);

export async function buildSlipPdf(d: SlipPdfData): Promise<Uint8Array> {
  const L = d.labels;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, boldFile] = await loadSerif();
  const m = /^(\d{4})-(\d{2})(.*)$/.exec(L.title); // 「2026-09 급여명세서」 → 「2026년 09월 급여명세서」
  const title = m ? `${m[1]}년 ${m[2]}월${m[3]}` : L.title;
  const nf = new Intl.NumberFormat('ko-KR');
  const amt = (n: number) => nf.format(n); // 칸 안 금액은 숫자만(원 없이) — 양식과 같게
  const dot = (v: string) => v.replace(/-/g, '.');
  const payRows = d.lines.filter((l) => l.kind === 'PAYMENT'), dedRows = d.lines.filter((l) => l.kind === 'DEDUCTION');
  const howRows = d.lines.filter((l) => l.how);
  const workRows = d.work?.rows ?? [];
  const thanks = L.thanks ?? '';
  const sum = L.sum ?? '';
  const words = [title, d.company, d.no, d.name, d.employeeNo, d.group, dot(d.periodFrom), dot(d.periodTo), dot(d.payDate), thanks, sum, L.formula ?? '', L.correctionMark ?? '', L.familyTemp ?? '', amt(d.pay), amt(d.deduction), amt(d.net)];
  for (const l of d.lines) words.push(l.label, l.how ?? '', amt(l.amount));
  for (const r of workRows) words.push(...r);
  for (const v of Object.values(L)) if (typeof v === 'string') words.push(v);
  if (d.tax) words.push(amt(d.tax.taxable), amt(d.tax.exempt));
  const used = [...new Set(words.join(''))].join('') + '0123456789,.-~()% ×원…※·';
  const font = await pdf.embedFont(await slim(regular, used), { subset: false });
  const bold = await pdf.embedFont(await slim(boldFile, used), { subset: false });
  pdf.setTitle(`${title} ${d.no}`);
  pdf.setAuthor(d.company);
  pdf.setSubject(d.no);
  let page = pdf.addPage([W, H]);
  type Ink = ReturnType<typeof ink>;
  const LINE = ink(0.85, 0.87, 0.9), FRAME = ink(0.62, 0.67, 0.75), BAND_INK = ink(0.2, 0.3, 0.46);
  const BAND = ink(0.9, 0.93, 0.975), SUM = ink(0.82, 0.87, 0.94), HEAD = ink(0.95, 0.96, 0.97), STRIPE = ink(0.975, 0.978, 0.985);
  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: Ink; align?: 'left' | 'center' | 'right' } = {}) => {
    const size = o.size ?? 9.5, f = o.f ?? font, w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x, y: yy, size, font: f, color: o.color ?? INK });
  };
  const box = (x: number, yy: number, w: number, h: number, o: { fill?: Ink; border?: Ink } = {}) =>
    page.drawRectangle({ x, y: yy, width: w, height: h, color: o.fill, borderColor: o.border, borderWidth: o.border ? 0.7 : 0 });
  const hline = (x1: number, x2: number, yy: number, c: Ink = LINE, t = 0.5) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: t, color: c });
  const vline = (x: number, y1: number, y2: number, c: Ink = LINE) => page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.5, color: c });
  /** 칸 너비에 맞춰 글자를 줄이고(6.5pt까지), 그래도 넘치면 「…」 */
  const fitText = (s: string, f: PDFFont, size: number, max: number): [string, number] => {
    let sz = size;
    while (sz > 6.5 && f.widthOfTextAtSize(s, sz) > max) sz -= 0.25;
    if (f.widthOfTextAtSize(s, sz) <= max) return [s, sz];
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(`${out}…`, sz) > max) out = out.slice(0, -1);
    return [`${out}…`, sz];
  };
  const cText = (s: string, cx: number, yy: number, max: number, o: { size?: number; f?: PDFFont; color?: Ink } = {}) => {
    if (!s) return;
    const [t, sz] = fitText(s, o.f ?? font, o.size ?? 9, max);
    text(t, cx, yy, { size: sz, f: o.f, color: o.color, align: 'center' });
  };
  const L0 = M, R0 = W - M, full = R0 - L0;
  let y = H - M;
  const nextPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M - 6;
    text(`${title} · ${d.name}`, L0, y, { size: 11, f: bold });
    y -= 20;
  };

  // ── 머리: 가운데 제목, 아래 줄 왼쪽 회사명칭 · 오른쪽 지급일. 정정본 · 검토용 · 연습은 맨 위 왼쪽에 작게
  const marks = [L.correctionMark, L.draft, L.practice].filter((v): v is string => !!v).join(' · ');
  if (marks) text(marks, L0, y + 4, { size: 8, f: bold, color: WARN });
  y -= 18;
  text(title, W / 2, y, { size: 18, f: bold, align: 'center' });
  y -= 26;
  text(L.company, L0, y, { size: 9, color: MUTED });
  text(d.company, L0 + font.widthOfTextAtSize(L.company, 9) + 6, y, { size: 9.5, f: bold });
  const pd = dot(d.payDate);
  text(pd, R0, y, { size: 9.5, f: bold, align: 'right' });
  text(L.payDate, R0 - bold.widthOfTextAtSize(pd, 9.5) - 6, y, { size: 9, color: MUTED, align: 'right' });
  y -= 9;
  hline(L0, R0, y, BAND_INK, 1.2);
  y -= 8;

  // ── 사원 정보 상자: · 사원코드 · 사원명 / · 부서 · 귀속기간
  const infoH = 44;
  box(L0, y - infoH, full, infoH, { border: FRAME });
  const info: [string, string][] = [[L.no, d.employeeNo || '—'], [L.name, d.name], [L.group, d.group || '—'], [L.period, `${dot(d.periodFrom)} ~ ${dot(d.periodTo)}`]];
  info.forEach(([k, v], i) => {
    const x = L0 + 16 + (i % 2) * (full / 2), yy = y - 17 - Math.floor(i / 2) * 17;
    text(`· ${k}`, x, yy, { size: 9, f: bold });
    const [t, sz] = fitText(v, font, 9.5, full / 2 - 96);
    text(t, x + 70, yy, { size: sz });
  });
  y -= infoH + 12;

  // ── 근로시간 (근로일수 · 총 근로 · 연장 · 야간 · 휴일 …) — 칸 이름 위 · 값 아래
  const COLS = 6;
  if (workRows.length) {
    const cw = full / COLS, rh = 18;
    for (let i = 0; i < workRows.length; i += COLS) {
      box(L0, y - rh, full, rh, { fill: HEAD });
      box(L0, y - rh * 2, full, rh * 2, { border: FRAME });
      hline(L0, R0, y - rh);
      for (let c = 1; c < COLS; c++) vline(L0 + c * cw, y, y - rh * 2);
      workRows.slice(i, i + COLS).forEach(([k, v], c) => {
        const cx = L0 + c * cw + cw / 2;
        cText(k, cx, y - 12.5, cw - 8, { size: 8.5, color: MUTED });
        cText(v, cx, y - rh - 12.5, cw - 8, { size: 9.5 });
      });
      y -= rh * 2;
    }
    y -= 12;
  }

  // ── 지급내역 · 공제내역 · 합계: 왼쪽 띠 + 오른쪽 6칸 격자(이름 줄 · 금액 줄)
  const bandW = 66, gx = L0 + bandW, gw = full - bandW, cw = gw / COLS, rh = 16;
  const section = (label: string, cells: ([string, string] | null)[], minPairs: number, fill: Ink, strong = false) => {
    const pairs = Math.max(minPairs, Math.ceil(cells.length / COLS));
    if (y - pairs * rh * 2 < M + 40) nextPage();
    const top = y, h = pairs * rh * 2;
    for (let p = 0; p < pairs; p++) {
      const t = top - p * rh * 2;
      box(gx, t - rh, gw, rh, { fill: strong ? HEAD : STRIPE }); // 이름 줄
      for (let c = 0; c < COLS; c++) {
        const cell = cells[p * COLS + c];
        if (!cell) continue;
        const cx = gx + c * cw + cw / 2;
        cText(cell[0], cx, t - 11.5, cw - 6, { size: 8.5, f: bold, color: strong ? INK : MUTED });
        cText(cell[1], cx, t - rh - 11.5, cw - 6, { size: strong ? 10 : 9.5, f: strong ? bold : font });
      }
      if (p < pairs - 1) hline(gx, R0, t - rh * 2);
    }
    box(L0, top - h, bandW, h, { fill });
    text(label, L0 + bandW / 2, top - h / 2 - 3, { size: 9, f: bold, color: BAND_INK, align: 'center' }); // 띠 글자는 작고 차분하게 (2026-10-30 의뢰인: 「너무 크고 촌스럽다」)
    box(L0, top - h, full, h, { border: FRAME });
    vline(gx, top, top - h, FRAME);
    y -= h;
  };
  section(L.pay, payRows.map((l) => [l.label, amt(l.amount)]), 3, BAND);
  section(L.deduction, dedRows.map((l) => [l.label, amt(l.amount)]), 3, BAND);
  y -= 8;
  // 합계: 지급총액 · 공제총액 · 차인지급액을 오른쪽 세 칸에 (양식과 같은 자리)
  section(sum, [null, null, null, [L.payTotal, amt(d.pay)], [L.deductionTotal, amt(d.deduction)], [L.net, amt(d.net)]], 1, SUM, true);
  if (d.tax && L.taxable && L.exempt) {
    text(`${L.taxable} ${amt(d.tax.taxable)} · ${L.exempt} ${amt(d.tax.exempt)}`, R0, y - 11, { size: 8, color: MUTED, align: 'right' });
    y -= 14;
  }
  y -= 18;

  // ── 계산방법 (임금명세서 기재사항 — 근로기준법 시행령 27조의2). 산출방식 토글을 끄면 줄이 없어 이 칸이 통째로 빠진다
  if (howRows.length && L.formula) {
    const fh = 19, c1 = full * 0.26, c3 = full * 0.22, c2 = full - c1 - c3;
    if (y - (fh * (howRows.length + 1) + 30) < M + 30) nextPage();
    text(`· ${L.formula}`, L0, y, { size: 10, f: bold });
    y -= 9;
    box(L0, y - fh, full, fh, { fill: HEAD });
    hline(L0, R0, y, BAND_INK, 1.2);
    text(L.item, L0 + c1 / 2, y - 13, { size: 9, f: bold, align: 'center' });
    text(L.how, L0 + c1 + c2 / 2, y - 13, { size: 9, f: bold, align: 'center' });
    text(L.amount, L0 + c1 + c2 + c3 / 2, y - 13, { size: 9, f: bold, align: 'center' });
    y -= fh;
    for (const l of howRows) {
      if (y - fh < M + 30) nextPage();
      hline(L0, R0, y);
      cText(l.label, L0 + c1 / 2, y - 13, c1 - 8, { size: 9 });
      const [t, sz] = fitText(l.how ?? '', font, 9, c2 - 16);
      text(t, L0 + c1 + c2 / 2, y - 13, { size: sz, align: 'center' });
      text(amt(l.amount), R0 - 10, y - 13, { size: 9.5, align: 'right' });
      y -= fh;
    }
    hline(L0, R0, y, FRAME, 0.8);
    y -= 12;
  }
  if (L.familyTemp) {
    text(`※ ${L.familyTemp}`, L0, y - 4, { size: 8, color: WARN });
    y -= 14;
  }
  // ── 끝: 감사 문구(가운데) · 회사명(오른쪽)
  const endY = Math.max(y - 20, M + 24);
  if (thanks) text(thanks, W / 2, endY, { size: 10, align: 'center' });
  text(d.company, R0, endY - 26, { size: 11, f: bold, align: 'right' });
  const pages = pdf.getPages();
  if (pages.length > 1) pages.forEach((pg, i) => pg.drawText(L.page(i + 1, pages.length), { x: R0 - 30, y: M - 16, size: 8, font, color: MUTED }));
  return pdf.save();
}
