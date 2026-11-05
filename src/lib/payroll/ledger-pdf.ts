// 급여대장 PDF (2026-11-05 의뢰인: 「대장 PDF도 회사 양식으로, 급여명세서 톤을 참조」) — A4 가로.
//   1쪽 급여대장(표지) → 직원마다 한 쪽: 근무현황 날짜표(1~15 · 16~31) + 시급 × 할증 = 금액 · 기타 수당 · 공제와 실지급.
//   글꼴 · 색은 급여명세서(slip-pdf)와 같다 — 나눔명조, 남색 띠 글자, 옅은 파랑 칸, 회색 테두리. 숫자는 엑셀과 같은 ledger-data.
// ★ 돈은 저장된 명세서 그대로. 주민번호 · 계좌는 없다. 확정 전이면 쪽마다 「검토용」.
import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb as ink, type PDFFont, type PDFPage } from 'pdf-lib';
import { hm, LEDGER_ROWS, payTypeKo, WEEKDAY, type Ledger, type LeaveTone } from './ledger-data';
import { slim } from './slip-pdf';

type Ink = ReturnType<typeof ink>;
const W = 841.89, H = 595.28, M = 30;
const INK = ink(0.1, 0.12, 0.16), MUTED = ink(0.4, 0.44, 0.5), WARN = ink(0.72, 0.3, 0.05);
const LINE = ink(0.85, 0.87, 0.9), FRAME = ink(0.62, 0.67, 0.75), BAND_INK = ink(0.2, 0.3, 0.46);
const BAND = ink(0.9, 0.93, 0.975), SUM = ink(0.82, 0.87, 0.94), HEAD = ink(0.95, 0.96, 0.97);
const RED = ink(0.72, 0.16, 0.16), BLUE = ink(0.18, 0.38, 0.68);
const TONE: Record<LeaveTone, Ink> = { annual: ink(1, 0.87, 0.6), out: ink(0.82, 0.89, 0.97), family: ink(0.87, 0.94, 0.86), sick: ink(1, 0.82, 0.82) };
const K = {
  ledger: '급여대장', status: '근무현황', company: '회사명칭', payDate: '지급일', group: '소속', name: '성명', period: '귀속기간', type: '급여형태',
  cols: ['No.', '성명', '소속', '세전 급여액', '공제 합계', '실지급액', '이체예정일', '비고'], total: '합계', blocked: '계산 안 됨',
  legend: ['연차사용', '외출', '경조사', '병가/하계휴가'], kind: '구분', sub: ['조기', '연장'], extra: '연장근무',
  money: ['구분', '계', '시급', '할증', '급여 계산'], tot: 'total', extras: '기타 수당', item: '항목', amount: '지급액', note: '내역', grand: '급여합계',
  ded: '공제', dedTotal: '공제 합계', net: '실지급액', none: '없음', made: '만든 날', check: '합계 확인', okMsg: '직원별 합계와 항목 합계가 같습니다', bad: '합계가 다릅니다 — 담당자에게 알려 주세요',
  people: '명', calc: '계산', stop: '막힘', page: '쪽', thanks: '이체용 문서가 아닙니다. 주민번호 · 계좌는 들어 있지 않습니다.',
};

let serif: Promise<[Buffer, Buffer]> | null = null;
const loadSerif = () => (serif ??= Promise.all(['NanumMyeongjo-Regular.ttf', 'NanumMyeongjo-Bold.ttf'].map((f) => readFile(path.join(process.cwd(), 'src', 'assets', 'fonts', f)))) as Promise<[Buffer, Buffer]>);

export async function buildLedgerPdf(lg: Ledger, o: { company: string; payDate: string; by: string; now: string; draft: string | null; practice: string | null; blocked: string }): Promise<Uint8Array> {
  const nf = new Intl.NumberFormat('ko-KR');
  const won = (n: number | null) => (n === null ? '' : nf.format(n));
  const hrs = (min: number) => hm(min).toFixed(2);
  const dot = (v: string) => v.replace(/-/g, '.');
  const nowKst = new Date(Date.parse(o.now) + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  const title = `${lg.year}년 ${lg.mon}월`;
  // 쓴 글자만 심는다 — 자료 · 고정 문구 · 숫자
  const words: string[] = [title, o.company, o.by, o.draft ?? '', o.practice ?? '', o.blocked, dot(o.payDate), nowKst, ...WEEKDAY, ...LEDGER_ROWS.map((r) => r[0])];
  for (const v of Object.values(K)) words.push(...(Array.isArray(v) ? v : [v]));
  for (const p of lg.people) {
    words.push(p.name, p.group, p.reason, payTypeKo(p.payType));
    for (const l of p.lines) words.push(l.label);
    for (const e of p.extras) words.push(e.label, e.note);
    for (const d of p.deductions) words.push(d.label);
    for (const g of p.grid.values()) if (g.leave) words.push(g.leave.label);
  }
  const used = [...new Set(words.join(''))].join('') + '0123456789,.-~()% ×원…※·/:';
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, boldFile] = await loadSerif();
  const font = await pdf.embedFont(await slim(regular, used), { subset: false });
  const bold = await pdf.embedFont(await slim(boldFile, used), { subset: false });
  pdf.setTitle(`${title} ${K.ledger}`);
  pdf.setAuthor(o.company);

  let page: PDFPage = pdf.addPage([W, H]);
  const text = (s: string, x: number, y: number, a: { size?: number; f?: PDFFont; color?: Ink; align?: 'left' | 'center' | 'right' } = {}) => {
    if (!s) return;
    const size = a.size ?? 9, f = a.f ?? font, w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: a.align === 'center' ? x - w / 2 : a.align === 'right' ? x - w : x, y, size, font: f, color: a.color ?? INK });
  };
  /** 칸 너비에 맞춰 글자를 줄이고(6pt까지), 그래도 넘치면 「…」 */
  const fit = (s: string, f: PDFFont, size: number, max: number): [string, number] => {
    let sz = size;
    while (sz > 6 && f.widthOfTextAtSize(s, sz) > max) sz -= 0.25;
    if (f.widthOfTextAtSize(s, sz) <= max) return [s, sz];
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(`${out}…`, sz) > max) out = out.slice(0, -1);
    return [`${out}…`, sz];
  };
  /** 칸 하나: 배경 · 테두리 · 글자(가운데 또는 오른쪽) */
  const cell = (x: number, y: number, w: number, h: number, s: string, a: { fill?: Ink; f?: PDFFont; size?: number; color?: Ink; align?: 'center' | 'right' | 'left'; border?: Ink } = {}) => {
    page.drawRectangle({ x, y: y - h, width: w, height: h, color: a.fill, borderColor: a.border ?? LINE, borderWidth: 0.5 });
    if (!s) return;
    const [t, sz] = fit(s, a.f ?? font, a.size ?? 8.5, w - 6);
    const ty = y - h / 2 - sz * 0.35;
    text(t, a.align === 'right' ? x + w - 4 : a.align === 'left' ? x + 4 : x + w / 2, ty, { size: sz, f: a.f, color: a.color, align: a.align === 'left' ? 'left' : a.align ?? 'center' });
  };
  const frame = (x: number, y: number, w: number, h: number) => page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: FRAME, borderWidth: 0.8 });
  const L0 = M, R0 = W - M, full = R0 - L0;

  /** 쪽 머리 — 명세서처럼: 검토용 표시(왼쪽 위) · 가운데 제목 · 아래 줄 왼쪽 회사명칭 · 오른쪽 지급일 · 남색 줄 */
  const head = (t: string, left: [string, string][], right: [string, string][]) => {
    let y = H - M;
    const marks = [o.draft, o.practice].filter(Boolean).join(' · ');
    if (marks) text(marks, L0, y, { size: 8, f: bold, color: WARN });
    y -= 20;
    text(t, W / 2, y, { size: 17, f: bold, align: 'center' });
    y -= 22;
    let x = L0;
    for (const [k, v] of left) { text(k, x, y, { size: 8.5, color: MUTED }); x += font.widthOfTextAtSize(k, 8.5) + 5; text(v, x, y, { size: 9.5, f: bold }); x += bold.widthOfTextAtSize(v, 9.5) + 16; }
    let rx = R0;
    for (const [k, v] of [...right].reverse()) { text(v, rx, y, { size: 9.5, f: bold, align: 'right' }); rx -= bold.widthOfTextAtSize(v, 9.5) + 5; text(k, rx, y, { size: 8.5, color: MUTED, align: 'right' }); rx -= font.widthOfTextAtSize(k, 8.5) + 16; }
    y -= 8;
    page.drawLine({ start: { x: L0, y }, end: { x: R0, y }, thickness: 1.2, color: BAND_INK });
    return y - 12;
  };

  // ── 1쪽: 급여대장 (표지) ──
  {
    let y = head(`${title} ${K.ledger}`, [[K.company, o.company]], [[K.payDate, dot(o.payDate)]]);
    const ws = [36, 80, 150, 104, 96, 104, 70, 0];
    ws[7] = full - ws.slice(0, 7).reduce((a, b) => a + b, 0);
    const rh = 19;
    let x = L0;
    let tTop = y;
    const colHead = () => { x = L0; K.cols.forEach((h, i) => { cell(x, y, ws[i], rh, h, { fill: BAND, f: bold, color: BAND_INK }); x += ws[i]; }); y -= rh; };
    colHead();
    lg.people.forEach((p, i) => {
      if (y - rh < M + 60) {
        frame(L0, tTop, full, tTop - y);
        page = pdf.addPage([W, H]);
        y = tTop = head(`${title} ${K.ledger}`, [[K.company, o.company]], [[K.payDate, dot(o.payDate)]]);
        colHead();
      }
      const vals = [String(i + 1), p.name, p.group, p.ok ? won(p.pay) : '', p.ok ? won(p.deduction) : '', p.ok ? won(p.net) : '', dot(o.payDate).slice(5), p.ok ? payTypeKo(p.payType) : `${o.blocked} — ${p.reason}`];
      x = L0;
      vals.forEach((v, c) => { cell(x, y, ws[c], rh, v, { align: c >= 3 && c <= 5 ? 'right' : c === 2 || c === 7 ? 'left' : 'center', color: !p.ok && c === 7 ? WARN : undefined, f: c === 1 ? bold : undefined, size: c === 7 ? 7.5 : 8.5 }); x += ws[c]; });
      y -= rh;
    });
    x = L0;
    const sumVals = [K.total, '', '', won(lg.sums.pay), won(lg.sums.deduction), won(lg.sums.net), '', `${K.calc} ${lg.sums.ok}${K.people}${lg.sums.blocked ? ` · ${K.stop} ${lg.sums.blocked}${K.people}` : ''}`];
    sumVals.forEach((v, c) => { cell(x, y, ws[c], rh + 2, v, { fill: SUM, f: bold, align: c >= 3 && c <= 5 ? 'right' : c === 7 ? 'left' : 'center' }); x += ws[c]; });
    y -= rh + 2;
    frame(L0, tTop, full, tTop - y);
    const same = lg.sums.pay === lg.sums.itemPay && lg.sums.deduction === lg.sums.itemDeduction;
    text(`${K.check}: ${same ? K.okMsg : K.bad}`, L0, y - 16, { size: 8, color: same ? MUTED : WARN });
    text(`${K.made} ${nowKst} · ${o.by}`, R0, y - 16, { size: 8, color: MUTED, align: 'right' });
    text(K.thanks, L0, M - 8, { size: 7.5, color: MUTED });
  }

  // ── 직원마다 한 쪽: 근무현황 ──
  for (const p of lg.people) {
    if (!p.ok) continue;
    page = pdf.addPage([W, H]);
    let y = head(`${title} ${K.status}`, [[K.group, p.group], [K.name, p.name]], [[K.type, payTypeKo(p.payType)], [K.payDate, dot(o.payDate)]]);
    // 휴가 색 안내 (오른쪽 위, 제목 줄 높이)
    let lx = R0;
    (['sick', 'family', 'out', 'annual'] as LeaveTone[]).forEach((t, i) => {
      const label = K.legend[3 - i];
      const w = font.widthOfTextAtSize(label, 7.5);
      lx -= w;
      text(label, lx, H - M - 20, { size: 7.5, color: MUTED });
      lx -= 11;
      page.drawRectangle({ x: lx, y: H - M - 21, width: 8, height: 8, color: TONE[t], borderColor: FRAME, borderWidth: 0.4 });
      lx -= 10;
    });

    // 날짜표 — 이름 칸 두 줄(구분 · 연장근무 조기/연장) + 날짜 16칸
    const c1 = 44, c2 = 32, dw = (full - c1 - c2) / 16, rh = 13;
    for (const half of lg.halves) {
      const top = y;
      cell(L0, y, c1 + c2, rh * 2, K.kind, { fill: HEAD, f: bold });
      half.forEach((d, i) => {
        const color = lg.isRed(d) ? RED : lg.isSat(d) ? BLUE : INK;
        cell(L0 + c1 + c2 + i * dw, y, dw, rh, String(+d.slice(8)), { fill: HEAD, f: bold, color });
        cell(L0 + c1 + c2 + i * dw, y - rh, dw, rh, WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()], { fill: HEAD, color, size: 8 });
      });
      y -= rh * 2;
      LEDGER_ROWS.forEach(([label, k]) => {
        if (k === 'early') cell(L0, y, c1, rh * 2, K.extra, { fill: BAND, color: BAND_INK, size: 8 });
        if (k === 'early' || k === 'ot') cell(L0 + c1, y, c2, rh, label, { fill: BAND, color: BAND_INK, size: 8 });
        else cell(L0, y, c1 + c2, rh, label, { fill: BAND, color: BAND_INK, size: 8 });
        half.forEach((d, i) => {
          const g = p.grid.get(d)!;
          const worked = g.base > 0 && (g.early > 0 || g.ot > 0);
          const show = g[k] > 0 || ((k === 'early' || k === 'ot') && worked);
          cell(L0 + c1 + c2 + i * dw, y, dw, rh, show ? hrs(g[k]) : '', { fill: k === 'base' && g.leave ? TONE[g.leave.tone] : undefined, color: k === 'rest' || k === 'ph' || (k === 'hol' && !lg.isSat(d)) ? RED : k === 'hol' ? BLUE : INK, size: 8 });
        });
        y -= rh;
      });
      cell(L0, y, c1 + c2, rh, K.tot, { fill: SUM, f: bold, size: 8 });
      half.forEach((d, i) => { const g = p.grid.get(d)!; cell(L0 + c1 + c2 + i * dw, y, dw, rh, hrs(g.base + g.early + g.ot + g.hol + g.hol8 + g.rest + g.ph), { fill: SUM, f: bold, size: 8 }); });
      y -= rh;
      frame(L0, top, full, top - y);
      // 휴가 표시 줄 (대장의 「8H」 · 「하계」)
      half.forEach((d, i) => { const g = p.grid.get(d)!; if (g.leave) { const [t, sz] = fit(g.leave.label, font, 7, dw - 4); text(t, L0 + c1 + c2 + i * dw + dw / 2, y - 9, { size: sz, color: MUTED, align: 'center' }); } });
      y -= 16;
    }

    // 아래: 시급 × 할증 = 금액 | 기타 수당 | 공제 · 실지급
    y -= 2;
    const rh2 = 12.5, gap = 14;
    const wA = [54, 46, 54, 34, 92], wAll = wA.reduce((a, b) => a + b, 0);
    const wB = [86, 76], wBAll = wB.reduce((a, b) => a + b, 0);
    const wC = full - wAll - wBAll - gap * 2;
    const xA = L0, xB = xA + wAll + gap, xC = xB + wBAll + gap;
    const top = y;
    let ya = y;
    K.money.forEach((h, i) => cell(xA + wA.slice(0, i).reduce((a, b) => a + b, 0), ya, wA[i], rh2, h, { fill: BAND, f: bold, color: BAND_INK, size: 8 }));
    ya -= rh2;
    for (const l of p.lines) {
      const v = [l.label, l.qty ? l.qty.toFixed(2) : '', l.rate !== null ? won(l.rate) : '', l.factor !== null ? String(l.factor) : '', l.amt ? won(l.amt) : ''];
      let x = xA;
      v.forEach((s, i) => { cell(x, ya, wA[i], rh2, s, { fill: i === 0 ? HEAD : undefined, align: i === 4 ? 'right' : 'center', size: 8 }); x += wA[i]; });
      ya -= rh2;
    }
    let x = xA;
    [K.tot, hm(p.lines.reduce((a, l) => a + (l.qty ?? 0) * 60, 0)).toFixed(2), '', '', won(p.timeSum)].forEach((s, i) => { cell(x, ya, wA[i], rh2, s, { fill: SUM, f: bold, align: i === 4 ? 'right' : 'center', size: 8 }); x += wA[i]; });
    ya -= rh2;
    frame(xA, top, wAll, top - ya);

    let yb = top;
    cell(xB, yb, wB[0], rh2, K.extras, { fill: BAND, f: bold, color: BAND_INK, size: 8 });
    cell(xB + wB[0], yb, wB[1], rh2, K.amount, { fill: BAND, f: bold, color: BAND_INK, size: 8 });
    yb -= rh2;
    const extraRows = Math.max(p.lines.length - 1, p.extras.length, 1);
    for (let j = 0; j < extraRows; j++) {
      const e = p.extras[j];
      cell(xB, yb, wB[0], rh2, e ? `${e.label}${e.note ? ` (${e.note})` : ''}` : j === 0 ? K.none : '', { fill: HEAD, size: 8, color: e ? INK : MUTED });
      cell(xB + wB[0], yb, wB[1], rh2, e ? won(e.amount) : '', { align: 'right', size: 8 });
      yb -= rh2;
    }
    cell(xB, yb, wB[0], rh2, K.total, { fill: SUM, f: bold, size: 8 });
    cell(xB + wB[0], yb, wB[1], rh2, won(p.extraSum), { fill: SUM, f: bold, align: 'right', size: 8 });
    yb -= rh2;
    frame(xB, top, wBAll, top - yb);

    let yc = top;
    const wc1 = wC * 0.55, wc2 = wC - wc1;
    cell(xC, yc, wc1, rh2, K.ded, { fill: BAND, f: bold, color: BAND_INK, size: 8 });
    cell(xC + wc1, yc, wc2, rh2, K.amount.replace('지급', '공제'), { fill: BAND, f: bold, color: BAND_INK, size: 8 });
    yc -= rh2;
    for (const d of p.deductions) { cell(xC, yc, wc1, rh2, d.label, { fill: HEAD, size: 8 }); cell(xC + wc1, yc, wc2, rh2, won(d.amount), { align: 'right', size: 8 }); yc -= rh2; }
    if (!p.deductions.length) { cell(xC, yc, wc1, rh2, K.none, { fill: HEAD, size: 8, color: MUTED }); cell(xC + wc1, yc, wc2, rh2, ''); yc -= rh2; }
    cell(xC, yc, wc1, rh2, K.dedTotal, { fill: SUM, f: bold, size: 8 });
    cell(xC + wc1, yc, wc2, rh2, won(p.deduction), { fill: SUM, f: bold, align: 'right', size: 8 });
    yc -= rh2;
    frame(xC, top, wC, top - yc);

    // 맨 아래 띠: 급여합계 · 공제 합계 · 실지급액 — 명세서의 [합계] 줄처럼 오른쪽 세 칸
    const yEnd = Math.min(ya, yb, yc) - 8;
    const sw = 130, sh = 24;
    const sx = R0 - sw * 3;
    page.drawRectangle({ x: sx - 66, y: yEnd - sh, width: 66, height: sh, color: SUM });
    text(K.total, sx - 33, yEnd - sh / 2 - 3, { size: 9, f: bold, color: BAND_INK, align: 'center' });
    ([[K.grand, p.pay], [K.dedTotal, p.deduction], [K.net, p.net]] as [string, number | null][]).forEach(([k, v], i) => {
      const cx = sx + i * sw;
      page.drawRectangle({ x: cx, y: yEnd - sh, width: sw, height: sh, color: i === 2 ? BAND : HEAD, borderColor: LINE, borderWidth: 0.5 });
      text(k, cx + 8, yEnd - sh / 2 - 3, { size: 8.5, color: MUTED });
      text(won(v), cx + sw - 8, yEnd - sh / 2 - 3.5, { size: 11, f: bold, align: 'right' });
    });
    frame(sx - 66, yEnd, sw * 3 + 66, sh);
  }

  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(`${i + 1} / ${pages.length}`, { x: R0 - 26, y: M - 16, size: 7.5, font, color: MUTED }));
  return pdf.save();
}
