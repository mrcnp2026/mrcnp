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
  draft: string | null; practice: string | null; correction: string | null; familyTemp?: string | null; note: string; formula?: string; thanks?: string; correctionMark?: string | null; page: (n: number, all: number) => string; money: (n: number) => string; // familyTemp: 부양가족 신고 전 「임시」 문구 (묶음 38)
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

// 2026-10-30 의뢰인(「서체부터 별로 · 계산식이 왜 본문에 · 정정 안내는 왜」)로 다시 짬 — 회사가 쓰던 명세서(레퍼런스/2025.12)처럼:
//   명조체 · 테두리 표 · 위 제목(「2026년 9월분 급여명세서」) · 사람 칸 · [근무 | 지급 | 공제] 세 칸 나란히 · 합계 줄 · 실지급액 · 맨 아래 「산출 방법」 칸(법정 기재사항) · 감사 문구와 회사명.
//   본문에 계산식 · 정정 사유 · 「프로그램에 저장된 값」 같은 안내 문장을 넣지 않는다. 정정본은 위에 「정정본 (N판)」 작은 표시만. 한 장에 들어가게 줄 높이를 맞춘다.
let serif: Promise<[Buffer, Buffer]> | null = null;
const loadSerif = () => (serif ??= Promise.all(['NanumMyeongjo-Regular.ttf', 'NanumMyeongjo-Bold.ttf'].map((f) => readFile(path.join(process.cwd(), 'src', 'assets', 'fonts', f)))) as Promise<[Buffer, Buffer]>);

export async function buildSlipPdf(d: SlipPdfData): Promise<Uint8Array> {
  const L = d.labels;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, boldFile] = await loadSerif();
  const m = /^(\d{4})-(\d{2})(.*)$/.exec(L.title); // 「2026-09 급여명세서」 → 「2026년 9월분 급여명세서」
  const title = m ? `${m[1]}년 ${Number(m[2])}월분${m[3]}` : L.title;
  const payRows = d.lines.filter((l) => l.kind === 'PAYMENT'), dedRows = d.lines.filter((l) => l.kind === 'DEDUCTION');
  const howRows = d.lines.filter((l) => l.how);
  const workRows = d.work?.rows ?? [];
  const thanks = L.thanks ?? '';
  const words = [title, d.company, d.no, d.name, d.employeeNo, d.group, d.periodFrom, d.periodTo, d.payDate, thanks, L.formula ?? '', L.correctionMark ?? '', L.familyTemp ?? '', d.work?.title ?? '', L.money(d.pay), L.money(d.deduction), L.money(d.net)];
  for (const l of d.lines) words.push(l.label, l.how ?? '', L.money(l.amount));
  for (const r of workRows) words.push(...r);
  for (const v of Object.values(L)) if (typeof v === 'string') words.push(v);
  if (d.tax) words.push(L.money(d.tax.taxable), L.money(d.tax.exempt));
  const used = [...new Set(words.join(''))].join('') + '0123456789,.-~()% ×원…※';
  const font = await pdf.embedFont(await slim(regular, used), { subset: false });
  const bold = await pdf.embedFont(await slim(boldFile, used), { subset: false });
  pdf.setTitle(`${title} ${d.no}`);
  pdf.setAuthor(d.company);
  pdf.setSubject(d.no);
  let page = pdf.addPage([W, H]);
  const BORDER = ink(0.15, 0.15, 0.18), HEAD = ink(0.93, 0.93, 0.94);
  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof ink>; align?: 'left' | 'center' | 'right' } = {}) => {
    const size = o.size ?? 9.5, f = o.f ?? font, w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x, y: yy, size, font: f, color: o.color ?? INK });
  };
  const cell = (x: number, yy: number, w: number, h: number, fill?: ReturnType<typeof ink>) => page.drawRectangle({ x, y: yy, width: w, height: h, borderColor: BORDER, borderWidth: 0.6, color: fill });
  const fit = (s: string, f: PDFFont, size: number, max: number) => {
    if (f.widthOfTextAtSize(s, size) <= max) return s;
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(`${out}…`, size) > max) out = out.slice(0, -1);
    return `${out}…`;
  };
  const L0 = M, R0 = W - M, full = R0 - L0;

  // ── 머리: 왼쪽 명세 번호 · 표시, 가운데 제목, 오른쪽 지급일
  let y = H - M;
  const marks = [L.correctionMark, L.draft, L.practice].filter((v): v is string => !!v).join(' · ');
  text(`${L.no} ${d.no}`, L0, y, { size: 8, color: MUTED });
  if (marks) text(marks, L0, y - 11, { size: 8.5, f: bold, color: WARN });
  text(`${L.payDate} ${d.payDate}`, R0, y, { size: 9, align: 'right' });
  y -= 34;
  text(title, W / 2, y, { size: 19, f: bold, align: 'center' });
  y -= 22;

  // ── 사람 칸: [성명 | 값 | 소속 | 값] [귀속 기간 | 값 | 회사 | 값]
  const rowH = 20, kW = 70, vW = full / 2 - kW;
  const info: [string, string][][] = [
    [[L.name, `${d.name}${d.employeeNo ? ` (${d.employeeNo})` : ''}`], [L.group, d.group || '—']],
    [[L.period, `${d.periodFrom} ~ ${d.periodTo}`], [L.company, d.company]],
  ];
  for (const row of info) {
    row.forEach(([k, v], i) => {
      const x = L0 + i * (full / 2);
      cell(x, y - rowH, kW, rowH, HEAD);
      cell(x + kW, y - rowH, vW, rowH);
      text(k, x + kW / 2, y - 13.5, { size: 9, align: 'center' });
      text(fit(v, font, 9.5, vW - 12), x + kW + 8, y - 13.5);
    });
    y -= rowH;
  }
  y -= 10;

  // ── 본문: [근무 내역 | 지급 | 공제] 세 칸 (근무 내역이 없는 종이는 두 칸)
  const cols: { title: string; rows: [string, string][]; total?: [string, string] }[] = [
    ...(workRows.length ? [{ title: d.work!.title, rows: workRows }] : []),
    { title: L.pay, rows: payRows.map((l) => [l.label, L.money(l.amount)] as [string, string]), total: [L.payTotal, L.money(d.pay)] },
    { title: L.deduction, rows: dedRows.map((l) => [l.label, L.money(l.amount)] as [string, string]), total: [L.deductionTotal, L.money(d.deduction)] },
  ];
  const colW = full / cols.length, lineH = 17;
  const bodyRows = Math.max(...cols.map((c) => c.rows.length), 1);
  const headRow = () => {
    cols.forEach((c, i) => {
      cell(L0 + i * colW, y - lineH - 2, colW, lineH + 2, HEAD);
      text(c.title, L0 + i * colW + colW / 2, y - 12.5, { size: 10, f: bold, align: 'center' });
    });
    y -= lineH + 2;
  };
  // 넘치면 다음 쪽 — 위에 「제목 · 이름」과 표 머리를 다시 적는다(항목이 아주 많은 사람만)
  const nextPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
    text(`${title} · ${d.name}`, L0, y - 4, { size: 11, f: bold });
    y -= 22;
  };
  headRow();
  for (let r = 0; r < bodyRows; r++) {
    if (y - lineH < M + 30) {
      nextPage();
      headRow();
    }
    cols.forEach((c, i) => {
      const x = L0 + i * colW;
      cell(x, y - lineH, colW, lineH);
      const row = c.rows[r];
      if (row) {
        text(fit(row[0], font, 9, colW * 0.55), x + 7, y - 12, { size: 9 });
        text(row[1], x + colW - 7, y - 12, { size: 9.5, align: 'right' });
      }
    });
    y -= lineH;
  }
  cols.forEach((c, i) => {
    const x = L0 + i * colW;
    cell(x, y - lineH - 2, colW, lineH + 2, HEAD);
    if (c.total) {
      text(c.total[0], x + 7, y - 13, { size: 9.5, f: bold });
      text(c.total[1], x + colW - 7, y - 13, { size: 10, f: bold, align: 'right' });
    }
  });
  y -= lineH + 2;
  if (d.tax && L.taxable && L.exempt) {
    const x = L0 + (workRows.length ? 1 : 0) * colW;
    text(`${L.taxable} ${L.money(d.tax.taxable)} · ${L.exempt} ${L.money(d.tax.exempt)}`, x + colW - 7, y - 11, { size: 8, color: MUTED, align: 'right' });
    y -= 14;
  }
  y -= 6;
  // 합계 아래(실지급 · 산출 방법 · 감사)가 이 쪽에 다 들어가지 않으면 다음 쪽에
  if (y - (44 + Math.ceil(howRows.length / 2) * 16 + 70) < M) nextPage();
  // 실지급액 — 한 줄 크게
  cell(L0, y - 30, full * 0.6, 30, HEAD);
  cell(L0 + full * 0.6, y - 30, full * 0.4, 30);
  text(L.net, L0 + full * 0.3, y - 19.5, { size: 12, f: bold, align: 'center' });
  text(L.money(d.net), R0 - 12, y - 20, { size: 15, f: bold, align: 'right' });
  y -= 44;

  // ── 산출 방법 (임금명세서 기재사항 — 근로기준법 시행령 27조의2). 본문이 아니라 여기에만
  if (howRows.length && L.formula) {
    const half = full / 2, fh = 16, lw = 84;
    cell(L0, y - fh - 2, full, fh + 2, HEAD);
    text(L.formula, W / 2, y - 12, { size: 9.5, f: bold, align: 'center' });
    y -= fh + 2;
    for (let i = 0; i < howRows.length; i += 2) {
      [howRows[i], howRows[i + 1]].forEach((l, j) => {
        const x = L0 + j * half;
        cell(x, y - fh, lw, fh, HEAD);
        cell(x + lw, y - fh, half - lw, fh);
        if (l) {
          text(fit(l.label, font, 8.5, lw - 8), x + lw / 2, y - 11, { size: 8.5, align: 'center' });
          text(fit(l.how ?? '', font, 8.5, half - lw - 12), x + lw + 6, y - 11, { size: 8.5 });
        }
      });
      y -= fh;
    }
    y -= 8;
  }
  if (L.familyTemp) {
    text(`※ ${L.familyTemp}`, L0, y - 4, { size: 8, color: WARN });
    y -= 14;
  }
  // ── 끝: 감사 문구 · 회사명
  const endY = Math.max(y - 26, M + 20); // 표 바로 아래 (쪽 맨 아래로 떨어지면 허전하다)
  if (thanks) text(thanks, L0, endY, { size: 9.5 });
  text(d.company, R0, endY, { size: 11, f: bold, align: 'right' });
  const pages = pdf.getPages();
  if (pages.length > 1) pages.forEach((pg, i) => pg.drawText(L.page(i + 1, pages.length), { x: R0 - 30, y: M - 16, size: 8, font, color: MUTED }));
  return pdf.save();
}
