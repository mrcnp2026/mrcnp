// 급여명세서 PDF (PRD v1.3 23.3) — A4 세로. 값은 저장된 명세서 그대로 적는다(여기서 다시 계산하지 않는다).
// ★ 주민번호 · 계좌는 없다(저장하지 않는다). 사업주 부담 항목은 직원용 면에 넣지 않는다.
// ★ 확정 전 대장은 쪽마다 「검토용」, 연습 자료는 「연습」이라고 찍힌다. 정정본은 판 번호와 사유를 적는다.
// ★ 글자는 파일에 심는다(나눔고딕, SIL OFL — src/assets/fonts). 그래서 어디서 열어도 같은 모양이고 글자 검색이 된다.
import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import subsetFont from 'subset-font';
import { PDFDocument, rgb as ink, type PDFFont, type PDFPage } from 'pdf-lib'; // 종이에 찍는 먹색 — 화면 색(theme.ts)과 따로다

export type SlipPdfLine = { kind: 'PAYMENT' | 'DEDUCTION'; label: string; how: string | null; amount: number };
export type SlipPdfLabels = {
  title: string; company: string; no: string; name: string; group: string; period: string; payDate: string; revision: string;
  pay: string; deduction: string; item: string; how: string; amount: string; payTotal: string; deductionTotal: string; net: string; none: string; taxable?: string; exempt?: string;
  draft: string | null; practice: string | null; correction: string | null; note: string; page: (n: number, all: number) => string; money: (n: number) => string;
};
// 근로 내역 (임금명세서의 근로일수 · 총 근로시간 · 연장 · 야간 · 휴일 시간, 2026-10-16) — 칸 이름과 값을 이미 글자로 만들어 넘긴다. 없으면 이 칸을 그리지 않는다
export type SlipPdfWork = { title: string; rows: [string, string][] };
export type SlipPdfData = { company: string; no: string; name: string; employeeNo: string; group: string; periodFrom: string; periodTo: string; payDate: string; revision: number; pay: number; deduction: number; net: number; lines: SlipPdfLine[]; labels: SlipPdfLabels; work?: SlipPdfWork | null; tax?: { taxable: number; exempt: number } | null };

const W = 595.28, H = 841.89, M = 42;
const INK = ink(0.1, 0.12, 0.16), MUTED = ink(0.4, 0.44, 0.5), LINE = ink(0.78, 0.8, 0.84), FILL = ink(0.94, 0.95, 0.97), WARN = ink(0.72, 0.3, 0.05);
let fonts: Promise<[Buffer, Buffer]> | null = null;
const loadFonts = () => (fonts ??= Promise.all(['NanumGothic-Regular.ttf', 'NanumGothic-Bold.ttf'].map((f) => readFile(path.join(process.cwd(), 'src', 'assets', 'fonts', f)))) as Promise<[Buffer, Buffer]>);

/** 쓴 글자만 남긴 글꼴. 끝에 빈 자리를 조금 붙인다 — 추린 글꼴의 마지막 글자가 빈 글자(공백)이면 pdf-lib의 글꼴 읽기가 파일 끝을 넘어 읽다 멈추기 때문 */
async function slim(file: Buffer, text: string): Promise<Uint8Array> {
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

/** 폭에 맞게 줄을 나눈다 (한글은 글자 단위로도 끊는다) */
function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n' || font.widthOfTextAtSize(line + ch, size) > max) {
      out.push(line);
      line = ch === '\n' ? '' : ch.trimStart();
    } else line += ch;
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

export async function buildSlipPdf(d: SlipPdfData): Promise<Uint8Array> {
  const L = d.labels;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, boldFile] = await loadFonts();
  // 쓴 글자만 추려서 심는다(파일이 작아진다). pdf-lib에 추리기를 맡기면 글자가 빠져 보이는 일이 있어 미리 추린 글꼴을 통째로 넣는다
  const used = [...new Set([d.company, d.no, d.name, d.employeeNo, d.group, d.periodFrom, d.periodTo, d.payDate, ...d.lines.flatMap((l) => [l.label, l.how ?? '']), ...(d.work ? [d.work.title, ...d.work.rows.flat()] : []), ...Object.values(L).filter((v): v is string => typeof v === 'string'), L.page(1234567890, 1234567890), L.money(1234567890), ' ~()·-/.,0123456789'].join(''))].join('');
  const font = await pdf.embedFont(await slim(regular, used), { subset: false });
  const bold = await pdf.embedFont(await slim(boldFile, used), { subset: false });
  pdf.setTitle(`${L.title} ${d.no}`);
  pdf.setAuthor(d.company);
  pdf.setSubject(d.no);
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof ink>; right?: number } = {}) => {
    const size = o.size ?? 9.5, f = o.f ?? font;
    page.drawText(s, { x: o.right !== undefined ? o.right - f.widthOfTextAtSize(s, size) : x, y: yy, size, font: f, color: o.color ?? INK });
  };
  const rule = (yy: number, color = LINE, thickness = 0.6) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness, color });
  const marks = [L.draft, L.practice].filter((v): v is string => !!v).join(' · ');
  const newPage = (first: boolean) => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = H - M;
    text(first ? L.title : `${L.title} · ${d.name}`, M, y - 14, { size: first ? 17 : 11, f: bold });
    if (marks) text(marks, 0, y - 12, { size: 11, f: bold, color: WARN, right: W - M }); // 쪽마다 찍는다
    y -= first ? 30 : 24;
    rule(y, INK, 1);
    y -= 14;
  };
  const need = (h: number) => {
    if (y - h < M + 24) newPage(false);
  };

  newPage(true);
  // 머리말 — 두 칸
  const info: [string, string][] = [[L.company, d.company], [L.no, d.no], [L.name, `${d.name}${d.employeeNo ? ` (${d.employeeNo})` : ''}`], [L.group, d.group], [L.period, `${d.periodFrom} ~ ${d.periodTo}`], [L.payDate, d.payDate]];
  if (d.revision > 1) info.push([L.revision, String(d.revision)]);
  const half = (W - 2 * M) / 2;
  info.forEach(([k, v], i) => {
    const x = M + (i % 2) * half, yy = y - Math.floor(i / 2) * 15;
    text(k, x, yy, { color: MUTED });
    text(wrap(v, font, 9.5, half - 86)[0], x + 76, yy);
  });
  y -= Math.ceil(info.length / 2) * 15 + 4;
  if (L.correction) {
    for (const l of wrap(L.correction, font, 9, W - 2 * M)) {
      text(l, M, y, { size: 9, color: WARN });
      y -= 12;
    }
  }
  y -= 4;
  // 실지급
  page.drawRectangle({ x: M, y: y - 30, width: W - 2 * M, height: 30, color: FILL });
  text(L.net, M + 10, y - 20, { size: 11, f: bold });
  text(L.money(d.net), 0, y - 21, { size: 14, f: bold, right: W - M - 10 });
  y -= 52;
  // 근로 내역 — 세 칸씩
  if (d.work && d.work.rows.length) {
    text(d.work.title, M, y, { size: 11, f: bold });
    y -= 16;
    const third = (W - 2 * M) / 3;
    d.work.rows.forEach(([k, v], i) => {
      const x = M + (i % 3) * third, yy = y - Math.floor(i / 3) * 15;
      text(k, x, yy, { color: MUTED });
      text(v, 0, yy, { right: x + third - 12 });
    });
    y -= Math.ceil(d.work.rows.length / 3) * 15 + 2;
    rule(y);
    y -= 20;
  }

  const colHow = M + 150, howW = W - M - 100 - colHow;
  const head = (title: string, total: number) => {
    need(60);
    text(title, M, y, { size: 11, f: bold });
    text(L.money(total), 0, y, { size: 11, f: bold, right: W - M });
    y -= 8;
    page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 16, color: FILL });
    text(L.item, M + 4, y - 11.5, { size: 8.5, f: bold });
    text(L.how, colHow, y - 11.5, { size: 8.5, f: bold });
    text(L.amount, 0, y - 11.5, { size: 8.5, f: bold, right: W - M - 4 });
    y -= 16;
  };
  for (const kind of ['PAYMENT', 'DEDUCTION'] as const) {
    const title = kind === 'PAYMENT' ? L.pay : L.deduction, total = kind === 'PAYMENT' ? d.pay : d.deduction;
    head(title, total);
    const rows = d.lines.filter((l) => l.kind === kind);
    if (rows.length === 0) {
      text(L.none, M + 4, y - 12, { color: MUTED });
      y -= 18;
    }
    for (const r of rows) {
      const name = wrap(r.label, font, 9.5, colHow - M - 10), how = r.how ? wrap(r.how, font, 8.5, howW) : [];
      const h = Math.max(name.length, how.length, 1) * 12 + 6;
      if (y - h < M + 24) {
        newPage(false);
        head(title, total); // 다음 쪽에도 표 머리를 다시 적는다
      }
      name.forEach((l, i) => text(l, M + 4, y - 12 - i * 12));
      how.forEach((l, i) => text(l, colHow, y - 12 - i * 12, { size: 8.5, color: MUTED }));
      text(L.money(r.amount), 0, y - 12, { right: W - M - 4 });
      y -= h;
      rule(y);
    }
    y -= 16;
  }
  need(64);
  // 과세 대상 · 비과세 (2026-10-22 의뢰인 ②) — 지급 합계 바로 아래 옅은 글자
  const taxRows: [string, number, boolean, boolean][] = d.tax && L.taxable && L.exempt ? [[L.taxable, d.tax.taxable, false, true], [L.exempt, d.tax.exempt, false, true]] : [];
  for (const [k, v, strong, sub] of [[L.payTotal, d.pay, false, false], ...taxRows, [L.deductionTotal, d.deduction, false, false], [L.net, d.net, true, false]] as [string, number, boolean, boolean][]) {
    text(k, W - M - 220 + (sub ? 10 : 0), y, { f: strong ? bold : font, size: strong ? 11 : sub ? 8.5 : 9.5, color: sub ? MUTED : undefined });
    text(L.money(v), 0, y, { f: strong ? bold : font, size: strong ? 11 : sub ? 8.5 : 9.5, right: W - M, color: sub ? MUTED : undefined });
    y -= strong ? 18 : 15;
  }
  y -= 6;
  for (const l of wrap(L.note, font, 8, W - 2 * M)) {
    need(12);
    text(l, M, y, { size: 8, color: MUTED });
    y -= 11;
  }
  pages.forEach((p, i) => {
    page = p;
    text(L.page(i + 1, pages.length), 0, M - 14, { size: 8, color: MUTED, right: W - M });
    text(`${d.company} · ${d.no}`, M, M - 14, { size: 8, color: MUTED });
  });
  return pdf.save();
}
