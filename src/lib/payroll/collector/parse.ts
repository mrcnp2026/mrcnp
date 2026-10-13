// 공식자료 수집기 — 원문을 읽어 값을 뽑는 순수 함수들 (PRD v1.3 26~29장). 네트워크 · DB와 떨어져 있어 저장해 둔 원문으로 검사한다.
// 원칙: 원문에서 읽은 값만 돌려준다. 꼭 있어야 할 글이 없거나 모양이 달라졌으면 값을 추정하지 않고 ParseError로 멈춘다(그 출처만 실패).
// 시험 프로그램(`공식자료 수집 검증/collector.py`)의 읽는 방법을 옮기고, 빠져 있던 것(고용보험 · 건강보험 상하한 · 세액표의 고액/가족/자녀 규칙)을 더했다.
import JSZip from 'jszip';
import type { Candidate, HighBand, Json, TaxBand } from '../reference';

export class ParseError extends Error {}
const need = (re: RegExp, text: string, what: string): RegExpMatchArray => {
  const m = text.match(re);
  if (!m) throw new ParseError(`missing:${what}`);
  return m;
};
const num = (s: string) => Number(s.replace(/,/g, ''));
const pad = (n: string | number) => String(n).padStart(2, '0');
/** "7.19" → "0.0719" (자릿수만 옮긴다) */
export function pct(s: string): string {
  if (!/^\d{1,2}(\.\d{1,6})?$/.test(s)) throw new ParseError(`percent:${s}`);
  const [a, b = ''] = s.split('.');
  const w = a.padStart(3, '0');
  const out = `${w.slice(0, -2).replace(/^0+(?=\d)/, '')}.${w.slice(-2)}${b}`.replace(/0+$/, '').replace(/\.$/, '');
  return out.startsWith('.') ? `0${out}` : out || '0';
}
const half = (r: string): string => {
  const digits = r.split('.')[1] ?? '';
  const n = BigInt(digits + '0') * BigInt(5);
  return `0.${n.toString().padStart(digits.length + 2, '0')}`.replace(/0+$/, '');
};
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

// ── HTML ──
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unescape = (s: string) => s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, k: string) => (k[0] === '#' ? String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : Number(k.slice(1))) : (ENT[k] ?? m)));
const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
/** 화면에 보이는 글자만 (그림의 대체 글 포함 — 국민연금 공지는 표가 그림이고 값이 대체 글에 있다) */
export function pageText(html: string): string {
  const s = strip(html).replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, ' $1 ');
  return unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
export function pageLinks(html: string): { href: string; text: string }[] {
  return [...strip(html).matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: unescape(m[1]), text: pageText(m[2]) }));
}
export function pageTables(html: string): string[][][] {
  return [...strip(html).matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((t) => [...t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => pageText(c[1]))));
}

// ── HWPX (한글 문서: zip 안의 Contents/section*.xml) ──
/** 문단 글과 표(줄 · 칸). 겹친 표의 글은 바깥 칸에도 들어간다(시험 프로그램과 같은 읽기) */
export async function readHwpx(bytes: Uint8Array): Promise<{ text: string; tables: string[][][] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ParseError('hwpx:not_zip');
  }
  const names = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort();
  if (!names.length || Object.keys(zip.files).length > 1000) throw new ParseError('hwpx:sections');
  const paragraphs: string[] = [];
  const tables: string[][][] = [];
  for (const name of names) {
    const xml = await zip.files[name].async('string');
    if (xml.length > 40_000_000 || /<!DOCTYPE|<!ENTITY/.test(xml)) throw new ParseError('hwpx:unsafe');
    type Tbl = { depth: number; rows: string[][]; row: string[] | null; rowDepth: number; cell: string[] | null; cellDepth: number };
    const tbls: Tbl[] = [];
    const ps: { depth: number; parts: string[] }[] = [];
    let depth = 0;
    let inT = 0;
    for (const m of xml.matchAll(/<(\/?)([\w.-]+:)?([\w.-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g)) {
      if (m[6] !== undefined) {
        if (inT > 0) {
          const s = unescape(m[6]);
          for (const p of ps) p.parts.push(s);
          for (const t of tbls) t.cell?.push(s);
        }
        continue;
      }
      const tag = m[3];
      const close = m[1] === '/';
      const self = m[5] === '/';
      if (!close) {
        depth++;
        const top = tbls.at(-1);
        if (tag === 'p') ps.push({ depth, parts: [] });
        else if (tag === 'tbl') tbls.push({ depth, rows: [], row: null, rowDepth: 0, cell: null, cellDepth: 0 });
        else if (tag === 'tr' && top && depth === top.depth + 1) {
          top.row = [];
          top.rowDepth = depth;
        } else if (tag === 'tc' && top?.row && depth === top.rowDepth + 1) {
          top.cell = [];
          top.cellDepth = depth;
        } else if (tag === 't' && !self) inT++;
      }
      if (close || self) {
        const top = tbls.at(-1);
        if (tag === 't' && close) inT = Math.max(0, inT - 1);
        else if (tag === 'p' && ps.at(-1)?.depth === depth) {
          const s = ps.pop()!.parts.join('');
          if (s) paragraphs.push(s);
        } else if (tag === 'tc' && top?.cell && top.cellDepth === depth) {
          top.row!.push(top.cell.join(''));
          top.cell = null;
        } else if (tag === 'tr' && top?.row && top.rowDepth === depth) {
          top.rows.push(top.row);
          top.row = null;
        } else if (tag === 'tbl' && top && top.depth === depth) {
          tbls.pop();
          if (top.rows.length) tables.push(top.rows);
        }
        depth--;
      }
    }
  }
  return { text: paragraphs.join('\n'), tables };
}

// ── 출처별 읽기 ──
type C = Omit<Candidate, 'sourceUrl' | 'sourceHash' | 'parserVersion'>;
const cand = (kind: C['kind'], authority: string, sourceUnit: string | null, validFrom: string | null, validTo: string | null, payload: Record<string, Json>, warnings: string[] = []): C => ({ kind, authority, sourceUnit, validFrom, validTo, payload, warnings });

/** 건강보험 · 장기요양 요율 (건강보험공단 EDI 안내) — 원문에는 연도만 있다 */
export function parseHealth(html: string): C[] {
  const t = pageText(html);
  const year = Number(need(/(\d{4})년도 보험료율/, t, 'year')[1]);
  const total = pct(need(/직장가입자 건강보험료율:\s*([\d.]+)%/, t, 'health')[1]);
  const care = pct(need(/장기요양보험료율:\s*([\d.]+)%/, t, 'care')[1]);
  if (!t.includes('각각 50%') || !t.includes('장기요양보험료 = 건강보험료')) throw new ParseError('health:formula_changed');
  const w = ['effective_date_from_title_year'];
  return [
    cand('health.rate', '국민건강보험공단', '%', null, null, { totalRate: total, employeeRate: half(total), employerRate: half(total), documentYear: year }, w),
    cand('ltc.rate', '국민건강보험공단', '%', null, null, { incomeRate: care, healthRate: total, documentYear: year }, w),
  ];
}

/** 건강보험료 상한 · 하한 (보건복지부 고시 「월별 건강보험료액의 상한과 하한에 관한 고시」, 공단 법령 화면) */
export function parseHealthLimits(html: string): C[] {
  const t = pageText(html);
  if (!t.includes('월별 건강보험료액의 상한과 하한에 관한 고시')) throw new ParseError('healthLimits:title');
  const notice = need(/보건복지부고시\s*제(\d{4}-\d+)호/, t, 'notice')[1];
  const upper = num(need(/제2조[\s\S]{0,400}?직장가입자의 보수월액보험료\s*:\s*([\d,]+)원/, t, 'upper')[1]);
  const upperOther = num(need(/소득월액 보험료 및 지역가입자의 월별 보험료액\s*:\s*([\d,]+)원/, t, 'upperOther')[1]);
  const lower = num(need(/제3조[\s\S]{0,400}?직장가입자의 보수월액보험료\s*:\s*([\d,]+)원/, t, 'lower')[1]);
  if (upper <= lower) throw new ParseError('healthLimits:order');
  // 시행일 = 마지막 부칙의 「이 고시는 YYYY년 M월 D일부터 시행한다」
  const all = [...t.matchAll(/이 고시는\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일부터 시행한다/g)];
  if (!all.length) throw new ParseError('healthLimits:effective');
  const e = all.at(-1)!;
  return [cand('health.limit', '보건복지부', '원', `${e[1]}-${pad(e[2])}-${pad(e[3])}`, null, { premiumUpper: upper, premiumUpperEmployee: upper / 2, premiumLower: lower, incomePremiumUpper: upperOther, noticeNo: notice }, Number.isInteger(upper / 2) ? [] : ['half_not_integer'])];
}

/** 국민연금 요율 (공단 영문 안내의 표) — 요율의 시행일은 원문에 없다 */
export function parsePension(html: string): C[] {
  const tables = pageTables(html);
  const rates = tables.find((t) => t.some((r) => r.join(' ').includes('Workplace-based Insured')));
  const row = rates?.at(-1);
  if (!row || row.length !== 2) throw new ParseError('pension:table');
  const [employer, employee] = row.map((x) => pct(x.replace('%', '').trim()));
  return [cand('pension.rate', '국민연금공단', '%', null, null, { employeeRate: employee, employerRate: employer }, ['rate_effective_date_not_in_source'])];
}

/** 국민연금 기준소득월액 상 · 하한 (공단 공지 — 기간별) */
export function parsePensionLimits(html: string): C[] {
  const t = pageText(html);
  const rx = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*\.?\s*[~～]\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?.{0,15}?하한액\s*:\s*([\d,]+)원\s*,\s*상한액\s*:\s*([\d,]+)원/g;
  const seen = new Set<string>();
  const out: C[] = [];
  for (const m of t.matchAll(rx)) {
    const from = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    const to = `${m[4]}-${pad(m[5])}-${pad(m[6])}`;
    if (seen.has(from)) continue;
    seen.add(from);
    const lower = num(m[7]);
    const upper = num(m[8]);
    if (upper < lower || to <= from) throw new ParseError('pensionLimits:order');
    out.push(cand('pension.limit', '국민연금공단', '원', from, nextDay(to), { lower, upper }));
  }
  if (!out.length) throw new ParseError('pensionLimits:none');
  return out;
}

/** 고용보험 요율 (고용보험 공식 안내) — 실업급여 근로자/사업주, 고용안정 · 직업능력개발 사업의 규모별 사업주 요율 */
export function parseEmployment(html: string): C[] {
  const t = pageText(html);
  const u = need(/고용보험요율 안내\s*실업급여\s*노동자\s*([\d.]+)%\s*사업주\s*([\d.]+)%/, t, 'unemployment');
  const tier = (re: RegExp, what: string) => pct(need(re, t, what)[1]);
  const payload = {
    employeeRate: pct(u[1]),
    employerRate: pct(u[2]),
    stabilityUnder150: tier(/150인 미만 기업\s*([\d.]+)%/, 'under150'),
    stabilityPriority150: tier(/150인 이상 기업\s*\(우선지원 대상 기업 제외\)\s*([\d.]+)%/, 'priority150'),
    stability150to1000: tier(/150인 이상 기업\s*~\s*1000인 미만 기업\s*\(우선지원 대상 기업 제외\)\s*([\d.]+)%/, '150to1000'),
    stabilityOver1000: tier(/1000인 이상 기업[^%]{0,60}?([\d.]+)%/, 'over1000'),
  };
  // 안내 화면의 둘째 구간 문구("150인 이상 기업 (우선지원 대상 기업 제외) 0.45%")는 법령의 "150인 이상 우선지원 대상기업"과 표현이 다르다 — 값은 원문대로 두고 확인하도록 알린다
  return [cand('employment.rate', '고용노동부', '%', null, null, payload, ['rate_effective_date_not_in_source', 'employment_tier_wording_check'])];
}

/** 최저임금 (고용노동부 보도자료) — 월 환산액 = 시급 × 209 인지 검산한다 */
export function parseMinimumWage(html: string): C[] {
  const t = pageText(html);
  const m = need(/(\d{4})년 적용 최저임금 시간급\s*([\d,]+)원/, t, 'hourly');
  const hourly = num(m[2]);
  const monthly = num(need(/월 환산액은\s*([\d,]+)원/, t, 'monthly')[1]);
  if (hourly * 209 !== monthly) throw new ParseError('minimumWage:monthly_check');
  // 최저임금은 해마다 1월 1일부터 그 해 12월 31일까지 적용된다(최저임금법) — 원문의 「YYYY년 적용」을 그 기간으로 읽는다
  return [cand('minimum-wage', '고용노동부', '원', `${m[1]}-01-01`, `${Number(m[1]) + 1}-01-01`, { hourly, monthly209: monthly, documentYear: Number(m[1]) })];
}

/** 출산전후휴가 급여 상한 (고용노동부 공식 상담 답변) */
export function parseMaternity(html: string): C[] {
  const t = pageText(html);
  const m = need(/(\d{2})\.(\d{1,2})\.(\d{1,2})\.개정_상한액 월\s*(\d+)만원/, t, 'limit');
  return [cand('maternity.limit', '고용노동부', '원', `20${m[1]}-${pad(m[2])}-${pad(m[3])}`, null, { monthlyLimit: Number(m[4]) * 10000 }, ['official_consultation_not_notice'])];
}

/** 산재보험: 고시 목록에서 가장 최근 연도의 「사업종류별 산재보험료율」 고시 찾기 → 상세 주소 */
export function findAccidentNotice(listHtml: string): { year: number; href: string } | null {
  const hits = pageLinks(listHtml)
    .map((l) => ({ m: l.text.match(/(\d{4})년도 사업종류별 산재보험료율/), href: l.href }))
    .filter((x) => x.m && x.href.includes('view.do?'))
    .map((x) => ({ year: Number(x.m![1]), href: x.href }));
  return hits.sort((a, b) => b.year - a.year)[0] ?? null;
}
export function findHwpxLink(detailHtml: string): string {
  const links = [...new Set(pageLinks(detailHtml).filter((l) => l.href.includes('file_ext=hwpx')).map((l) => l.href))];
  if (links.length !== 1) throw new ParseError('accident:attachment');
  return links[0];
}
export async function parseAccident(hwpx: Uint8Array, year: number): Promise<C[]> {
  const { text } = await readHwpx(hwpx);
  const per = need(/전\s*업종\s*([\d.]+)\s*\/\s*1,?000/, text, 'commute')[1];
  if (!/^\d(\.\d{1,3})?$/.test(per)) throw new ParseError('accident:rate');
  const [a, b = ''] = per.split('.');
  const rate = `0.00${a}${b}`.replace(/0+$/, ''); // 천분율 ÷ 1000 (한 자리 정수부만 받는다 — 위에서 검사)
  // 산재보험료율 고시는 해마다 1월 1일부터 적용된다 — 고시 제목의 연도를 그 기간으로 읽는다
  return [cand('accident.commute', '고용노동부', '천분율', `${year}-01-01`, `${year + 1}-01-01`, { perThousand: per, rate, documentYear: year }, ['effective_date_from_title_year'])];
}

/**
 * 근로소득 간이세액표 (소득세법 시행령 별표 2, 국세청 배포 HWPX).
 * 표 본체(급여구간 × 가족 1~11명)와 함께 원문의 규칙을 읽는다: 1,000만원인 경우의 세액 줄, 1,000만원 초과 구간의 식, 가족 11명 초과 규칙, 자녀 수별 공제액.
 */
export async function parseTaxTable(hwpx: Uint8Array, datasetDate: string | null): Promise<C[]> {
  const { text, tables } = await readHwpx(hwpx);
  const wage = tables.filter((t) => t.length > 10 && t.slice(0, 5).some((r) => r.join(' ').includes('월급여')));
  if (!wage.length) throw new ParseError('tax:table');
  const revised = text.match(/별표 2\]\s*<개정\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?>/);
  const bands: TaxBand[] = [];
  let topRow: number[] | null = null;
  const high: HighBand[] = [];
  const money = (x: string) => (x === '-' ? 0 : num(x));
  for (const row of wage.flat().length ? wage.flatMap((t) => t) : []) {
    const c = row.map((x) => x.trim());
    if (c.length === 13 && /^\d[\d,]*$/.test(c[0]) && /^\d[\d,]*$/.test(c[1])) {
      const from = num(c[0]) * 1000;
      const to = num(c[1]) * 1000;
      if (from >= to || c.slice(2).some((x) => !/^([\d,]+|-)$/.test(x))) throw new ParseError('tax:band');
      bands.push({ wageFrom: from, wageTo: to, taxes: c.slice(2).map(money) });
    } else if (c.length === 12 && /^[\d,]+천원$/.test(c[0]) && c.slice(1).every((x) => /^[\d,]+$/.test(x))) {
      topRow = c.slice(1).map(num);
      if (num(c[0].replace('천원', '')) * 1000 !== bands.at(-1)?.wageTo) throw new ParseError('tax:top_row');
    } else if (c.length === 2 && /천원 초과/.test(c[0])) {
      const l = need(/^([\d,]+)천원 초과\s*(?:([\d,]+)천원 이하)?$/, c[0], 'high_label');
      const f = need(/^\(10,000천원인 경우의 해당 세액\)\s*\+\s*(?:\(([\d,]+)원\)\s*\+\s*)?\(([\d,]+)천원을 초과하는 금액(에 98%를 곱한 금액)?의 (\d+)% 상당액\)(?:\s*\+\s*\(([\d,]+)원\))?$/, c[1], 'high_formula');
      if (num(f[2]) !== num(l[1])) throw new ParseError('tax:high_mismatch');
      high.push({ over: num(l[1]) * 1000, upTo: l[2] ? num(l[2]) * 1000 : null, fixed: num(f[1] ?? f[5] ?? '0'), pct98: !!f[3], ratePct: Number(f[4]) });
    }
  }
  if (!bands.length || bands.some((b, i) => i > 0 && bands[i - 1].wageTo !== b.wageFrom)) throw new ParseError('tax:gap');
  const max = bands.at(-1)!.wageTo!;
  // 고액 구간은 표의 끝에서 시작해 빈틈없이 이어지고 마지막은 끝이 열려 있어야 한다. 아니면 고액 규칙 없이 낸다(그 구간은 조회되지 않는다)
  const highOk = !!topRow && high.length > 0 && high[0].over === max && high.every((h, i) => (i === high.length - 1 ? h.upTo === null : h.upTo === high[i + 1].over));
  const family11 = /공제대상가족의 수가 11명인 경우의 세액/.test(text) && /\(공제대상가족의 수가 10명인 경우의 세액\s*-\s*공제대상가족의 수가 11명인 경우의 세액\)\s*×\s*11명을 초과하는 가족의 수/.test(text);
  const warnings = ['distributed_file_may_predate_latest_amendment'];
  if (!highOk) warnings.push('no_rule_above_table_max');
  if (!family11) warnings.push('no_rule_above_family_11');
  const out: C[] = [
    { ...cand('income-tax.table', '국세청', '원', null, null, { bandCount: bands.length, wageMin: bands[0].wageFrom, wageMaxExclusive: max, families: 11, datasetDate, revisedOn: revised ? `${revised[1]}-${pad(revised[2])}-${pad(revised[3])}` : null, topRow: highOk ? topRow : null, highBands: highOk ? (high as unknown as Json[]) : null, family11Rule: family11 }, warnings), bands },
  ];
  // 표 원문에 적힌 자녀 공제액 (개정 전 값일 수 있다 — 개정문에서 읽은 새 값은 따로 후보가 된다)
  const c1 = text.match(/자녀가 1명인 경우\s*:\s*([\d,]+)원/);
  const c2 = text.match(/자녀가 2명인 경우\s*:\s*([\d,]+)원/);
  const c3 = text.match(/자녀가 3명 이상인 경우\s*:\s*([\d,]+)원\s*\+\s*2명 초과 자녀 1명당\s*([\d,]+)원/);
  if (c1 && c2 && c3 && num(c3[1]) === num(c2[1])) out.push(cand('income-tax.child-adjust', '국세청', '원', null, null, { child1: num(c1[1]), child2: num(c2[1]), perExtraChild: num(c3[2]), revisedOn: revised ? `${revised[1]}-${pad(revised[2])}-${pad(revised[3])}` : null }, ['child_rule_from_table_document']));
  return out;
}

/** 소득세법 시행령 개정문에서 별표 2의 자녀 공제액 바뀐 값과 시행일 (국가법령정보센터) */
export function parseTaxAmendment(html: string): C[] {
  const t = pageText(html);
  const m = need(/별표\s*2\s*제3호가목 중 "([\d,]+)원"을 "([\d,]+)원"으로 하고, 같은 호 나목 중 "([\d,]+)원"을 "([\d,]+)원"으로 하며, 같은 호 다목 중 "([\d,]+)원"을 "([\d,]+)원"으로, "([\d,]+)원"을 "([\d,]+)원"으로 한다/, t, 'amendment');
  if (num(m[4]) !== num(m[6])) throw new ParseError('amendment:mismatch');
  const e = need(/별표 2의 개정규정:\s*(\d{4})년\s*(\d+)월\s*(\d+)일/, t.slice(m.index!, m.index! + 8000), 'commencement');
  return [cand('income-tax.child-adjust', '국가법령정보센터', '원', `${e[1]}-${pad(e[2])}-${pad(e[3])}`, null, { child1: num(m[2]), child2: num(m[4]), perExtraChild: num(m[8]), previousChild1: num(m[1]), previousChild2: num(m[3]), previousPerExtraChild: num(m[7]) })];
}
