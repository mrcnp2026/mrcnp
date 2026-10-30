// 증명서 PDF — A4 세로 한 장 (2026-10-29 남은 일 9-3, 2026-10-30 의뢰인 「양식이 별로 — 정식 서식처럼」으로 다시 짬).
// 정식 서식 모양: 위 발급번호 → 큰 제목 → 테두리 표(인적사항 · 재직사항 · 발급사항, 왼쪽에 묶음 칸) → 증명 문구 → 발급일 → 오른쪽 아래 회사 · 대표자 (인).
// 글꼴은 나눔명조(SIL OFL, src/assets/fonts) — 문서용 명조체. 값은 발급 때 남긴 snapshot 그대로(다시 읽지 않는다). ★ 주민번호는 없다.
// sample=true면 쪽 가운데에 「견본」을 옅게 찍는다(발급 전 미리보기).
import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getTranslations } from 'next-intl/server';
import { degrees, PDFDocument, rgb as ink, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CertKind, CertSnapshot } from '@/lib/certificates';
import { slim } from '@/lib/payroll/slip-pdf';

const W = 595.28, H = 841.89, M = 62;
const INK = ink(0.08, 0.08, 0.1), MUTED = ink(0.38, 0.4, 0.44), SEAL = ink(0.75, 0.12, 0.12), FILL = ink(0.95, 0.95, 0.95), FAINT = ink(0.88, 0.88, 0.9);
let fonts: Promise<[Buffer, Buffer]> | null = null;
const loadMyeongjo = () => (fonts ??= Promise.all(['NanumMyeongjo-Regular.ttf', 'NanumMyeongjo-Bold.ttf'].map((f) => readFile(path.join(process.cwd(), 'src', 'assets', 'fonts', f)))) as Promise<[Buffer, Buffer]>);

export async function certPdfFromSnapshot(s: CertSnapshot, o: { serial: string | null; copies: number; sample?: boolean; locale?: string }): Promise<Uint8Array> {
  const t = await getTranslations({ locale: o.locale ?? 'ko', namespace: 'certPdf' });
  const day = (d: string | null) => (d ? t('date', { y: d.slice(0, 4), m: Number(d.slice(5, 7)), d: Number(d.slice(8, 10)) }) : '');
  const kind: CertKind = s.kind;
  const period = kind === 'EMPLOYMENT' ? t('periodNow', { from: day(s.startsOn) }) : t('period', { from: day(s.startsOn), to: day(s.endsOn) });
  // 표: [묶음 이름, [칸, 값][]]
  const blocks: [string, [string, string][]][] = [
    [t('b.person'), [[t('name'), s.name], [t('birth'), s.birthDate ? day(s.birthDate) : '']]],
    [t(kind === 'EMPLOYMENT' ? 'b.work' : 'b.career'), [[t('companyName'), s.company.name], [t('group'), s.group ?? ''], [t('job'), s.jobTitle ?? ''], [t(kind === 'EMPLOYMENT' ? 'periodLabelNow' : 'periodLabel'), period]]],
    [t('b.issue'), [[t('purpose'), s.purpose], [t('copiesLabel'), t('copies', { n: o.copies })]]],
  ];
  const title = t(`title.${kind}`);
  const body = t(`body.${kind}`);
  const serial = o.serial ? t('serial', { no: o.serial }) : t('serialNone');
  const footer: [string, string][] = [[t('bizNo'), s.company.bizNo], [t('address'), s.company.address], [t('phone'), s.company.phone]];
  const ceoLine = `${t('ceo')}   ${s.company.ceo || ''}`;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, boldFile] = await loadMyeongjo();
  const used = [...new Set([title, body, serial, day(s.issuedOn), ceoLine, s.company.name, t('seal'), t('sample'), ...blocks.flatMap(([b, rows]) => [b, ...rows.flat()]), ...footer.flat()].join(''))].join('') + '0123456789-() .:·~';
  const font = await pdf.embedFont(await slim(regular, used), { subset: false });
  const bold = await pdf.embedFont(await slim(boldFile, used), { subset: false });
  pdf.setTitle(o.serial ? `${title} ${o.serial}` : title);
  pdf.setAuthor(s.company.name);
  const page: PDFPage = pdf.addPage([W, H]);
  const width = (str: string, f: PDFFont, size: number) => f.widthOfTextAtSize(str, size);
  const text = (str: string, x: number, y: number, op: { size?: number; f?: PDFFont; color?: ReturnType<typeof ink>; align?: 'left' | 'center' | 'right' } = {}) => {
    const size = op.size ?? 11.5, f = op.f ?? font;
    const w = width(str, f, size);
    const xx = op.align === 'center' ? x - w / 2 : op.align === 'right' ? x - w : x;
    page.drawText(str, { x: xx, y, size, font: f, color: op.color ?? INK });
  };
  const box = (x: number, y: number, w: number, h: number, fill?: ReturnType<typeof ink>) => page.drawRectangle({ x, y, width: w, height: h, borderColor: INK, borderWidth: 0.8, color: fill });

  if (o.sample) page.drawText(t('sample'), { x: W / 2 - 120, y: H / 2 - 40, size: 110, font: bold, color: FAINT, rotate: degrees(30) });

  // 발급번호 · 제목 (글자 사이를 띄운 큰 제목)
  text(serial, M, H - M + 6, { size: 9.5, color: MUTED });
  const spaced = [...title.replace(/\s/g, '')].join('   ');
  text(spaced, W / 2, H - M - 70, { size: 28, f: bold, align: 'center' });

  // 표
  const left = M, right = W - M, groupW = 74, labelW = 92, rowH = 34;
  let y = H - M - 130;
  for (const [group, rows] of blocks) {
    const h = rows.length * rowH;
    box(left, y - h, groupW, h, FILL);
    text(group, left + groupW / 2, y - h / 2 - 4, { size: 11.5, f: bold, align: 'center' });
    rows.forEach(([k, v], i) => {
      const top = y - i * rowH;
      box(left + groupW, top - rowH, labelW, rowH, FILL);
      box(left + groupW + labelW, top - rowH, right - left - groupW - labelW, rowH);
      text(k, left + groupW + labelW / 2, top - rowH / 2 - 4, { size: 11, align: 'center' });
      text(v, left + groupW + labelW + 12, top - rowH / 2 - 4, { size: 11.5 });
    });
    y -= h;
  }

  // 증명 문구 · 날짜
  y -= 80;
  text(body, W / 2, y, { size: 14, align: 'center' });
  y -= 70;
  text(day(s.issuedOn), W / 2, y, { size: 13.5, align: 'center' });

  // 오른쪽 아래: 회사 정보 몇 줄 → 회사명 · 대표자 (인)
  y -= 80;
  const colX = right - 250;
  for (const [k, v] of footer) {
    if (!v) continue;
    text(k, colX, y, { size: 10, color: MUTED });
    text(v, colX + 82, y, { size: 10.5 });
    y -= 18;
  }
  y -= 18;
  text(s.company.name, colX, y, { size: 15, f: bold });
  y -= 30;
  text(ceoLine, colX, y, { size: 14, f: bold });
  // 도장 자리 — 붉은 원 안에 (인)
  const sealX = right - 22, sealY = y + 5;
  page.drawCircle({ x: sealX, y: sealY, size: 18, borderColor: SEAL, borderWidth: 1.2 });
  text(t('seal'), sealX, sealY - 4, { size: 11, color: SEAL, align: 'center' });
  return pdf.save();
}

export async function certPdfBytes(c: { state: string; snapshot: CertSnapshot | null; serial: string | null; copies: number }, locale = 'ko'): Promise<{ bytes: Uint8Array; file: string }> {
  if (c.state !== 'ISSUED' || !c.snapshot || !c.serial) throw new Error('certificate not issued');
  const t = await getTranslations({ locale, namespace: 'certPdf' });
  const bytes = await certPdfFromSnapshot(c.snapshot, { serial: c.serial, copies: c.copies, locale });
  return { bytes, file: `${t(`title.${c.snapshot.kind}`).replace(/\s/g, '')}_${c.snapshot.name}_${c.serial}.pdf` };
}
