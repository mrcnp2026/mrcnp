// 인사기록카드 PDF — A4 세로, 묶음마다 제목 + 「칸 | 값」 줄 (2026-10-29 남은 일 9-4). 화면과 같은 묶음(buildHrCard)을 그린다.
// 글꼴은 급여명세서와 같은 나눔고딕. 길면 다음 쪽으로 넘어가고, 쪽마다 아래에 회사 · 출력일 · 쪽 번호.
import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { getTranslations } from 'next-intl/server';
import { PDFDocument, rgb as ink, type PDFPage, type PDFFont } from 'pdf-lib';
import type { HrCard } from '@/lib/hr-card';
import { loadFonts, slim } from '@/lib/payroll/slip-pdf';

const W = 595.28, H = 841.89, M = 44;
const INK = ink(0.1, 0.12, 0.16), MUTED = ink(0.4, 0.44, 0.5), LINE = ink(0.8, 0.82, 0.86), FILL = ink(0.95, 0.95, 0.96);

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

export async function hrCardPdfBytes(card: HrCard, locale = 'ko'): Promise<{ bytes: Uint8Array; file: string }> {
  const t = await getTranslations({ locale, namespace: 'hrCard' });
  const title = t('title');
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, boldFile] = await loadFonts();
  const used = [...new Set([title, card.name, card.employeeNo ?? '', card.company, card.printedOn, t('footer', { company: card.company, date: card.printedOn, n: 0, all: 0 }), ...card.sections.flatMap((s) => [s.title, s.empty ?? '', ...s.rows.flat()])].join(''))].join('') + '0123456789/-·~ ';
  const font = await pdf.embedFont(await slim(regular, used), { subset: false });
  const bold = await pdf.embedFont(await slim(boldFile, used), { subset: false });
  pdf.setTitle(`${title} ${card.name}`);
  pdf.setAuthor(card.company);
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const text = (s: string, x: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof ink> } = {}) =>
    page.drawText(s, { x, y: yy, size: o.size ?? 9.5, font: o.b ? bold : font, color: o.color ?? INK });
  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = H - M;
    text(pages.length === 1 ? title : `${title} · ${card.name}`, M, y - 16, { size: pages.length === 1 ? 20 : 11, b: true });
    if (pages.length === 1) text([card.name, card.employeeNo].filter(Boolean).join('  ·  '), M, y - 38, { size: 12 });
    y -= pages.length === 1 ? 56 : 30;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: INK });
    y -= 18;
  };
  const need = (h: number) => {
    if (y - h < M + 30) newPage();
  };
  const labelW = 130, valueX = M + labelW + 8, valueW = W - M - valueX;
  newPage();
  for (const s of card.sections) {
    need(40);
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: FILL });
    text(s.title, M + 6, y, { size: 11, b: true });
    y -= 24;
    const rows = s.rows.length ? s.rows : [[s.empty ?? '—', ''] as [string, string]];
    for (const [k, v] of rows) {
      const lines = wrap(v, font, 9.5, valueW);
      need(lines.length * 13 + 8);
      text(k, M + 6, y, { color: MUTED });
      lines.forEach((l, i) => text(l, valueX, y - i * 13));
      y -= lines.length * 13 + 5;
      page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.4, color: LINE });
      y -= 6;
    }
    y -= 8;
  }
  pages.forEach((pg, i) => pg.drawText(t('footer', { company: card.company, date: card.printedOn, n: i + 1, all: pages.length }), { x: M, y: M - 10, size: 8, font, color: MUTED }));
  return { bytes: await pdf.save(), file: `${title}_${card.name}_${card.printedOn}.pdf` };
}
