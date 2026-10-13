// 공식 기준 자료(요율 · 상하한 · 세액표) — 순수 함수 (PRD v1.3 6 · 17.4 · 17.5 · 25 · 27장).
//   · 수집기(`공식자료 수집 검증/`)의 결과 파일을 「검토 후보」로 바꾼다. 값을 만들어 내지 않는다 — 수집기가 읽은 것만 옮긴다.
//   · 간이세액표로 소득세를 조회한다. 표에 없는 구간 · 규칙이 없는 자녀 수는 계산하지 않고 그 사실을 돌려준다.

export const REFERENCE_KINDS = ['pension.rate', 'pension.limit', 'health.rate', 'health.limit', 'ltc.rate', 'employment.rate', 'accident.commute', 'minimum-wage', 'maternity.limit', 'income-tax.table', 'income-tax.child-adjust'] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];
/** S05 사회보험 요율표에 보이는 종류 (세액표 두 가지는 S06) */
export const RATE_KINDS: ReferenceKind[] = ['pension.rate', 'pension.limit', 'health.rate', 'health.limit', 'ltc.rate', 'employment.rate', 'accident.commute', 'minimum-wage', 'maternity.limit'];

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type TaxBand = { wageFrom: number; wageTo: number | null; taxes: number[] }; // taxes[0] = 가족 1명
export type Candidate = {
  kind: ReferenceKind;
  payload: Record<string, Json>;
  sourceUnit: string | null;
  validFrom: string | null; // 원문에서 시행일을 읽지 못하면 null — 관리자가 확인해 넣어야 승인된다
  validTo: string | null; // 이 날 전날까지
  authority: string;
  sourceUrl: string | null;
  sourceHash: string | null;
  parserVersion: string | null;
  bands?: TaxBand[];
  warnings: string[];
};

/** 키 순서와 상관없이 같은 값이면 같은 글자가 되게 (해시용) */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const rate = (v: unknown): string | null => {
  const s = str(v);
  return s && /^0(\.\d{1,8})?$/.test(s) ? s : null;
};
const krw = (v: unknown): number | null => {
  const s = str(v)?.replace(/,/g, '');
  return s && /^\d{1,12}$/.test(s) ? Number(s) : null;
};
const date = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
/** 0.0719 ÷ 2 처럼 소수 문자열을 정확히 반으로 (부동소수 오차 없이) */
const half = (r: string): string => {
  const digits = r.split('.')[1] ?? '';
  const n = BigInt(digits + "0") * BigInt(5); // (r × 10^(len+1)) × 5 = r/2 × 10^(len+2)
  return `0.${n.toString().padStart(digits.length + 2, '0')}`.replace(/0+$/, '').replace(/\.$/, '.0');
};

type Row = { source_id?: unknown; source_url?: unknown; parser_version?: unknown; status?: unknown; values?: Record<string, unknown>; requests?: { sha256?: unknown }[] };

/**
 * 수집기의 latest.json(+ 세액표 구간 파일) → 검토 후보.
 * 필수 값이 빠진 자료는 후보로 만들지 않고 skipped에 이유를 남긴다 — 0이나 추정값으로 채우지 않는다.
 */
export function mapCollector(latest: unknown, bandsFile: unknown): { candidates: Candidate[]; skipped: { source: string; why: string }[] } {
  const candidates: Candidate[] = [];
  const skipped: { source: string; why: string }[] = [];
  const results = (latest as { results?: unknown })?.results;
  if (!Array.isArray(results)) return { candidates, skipped: [{ source: 'latest.json', why: 'format' }] };
  for (const r of results as Row[]) {
    const id = str(r.source_id) ?? '?';
    if (r.status !== 'EXTRACTED' || !r.values) {
      skipped.push({ source: id, why: 'not_extracted' });
      continue;
    }
    const v = r.values;
    const base = { sourceUrl: str(r.source_url), sourceHash: str(r.requests?.at(-1)?.sha256), parserVersion: str(r.parser_version), warnings: [] as string[] };
    const year = typeof v.document_year === 'number' ? v.document_year : null;
    const push = (c: Omit<Candidate, keyof typeof base | 'warnings'> & { warnings?: string[] }) => candidates.push({ ...base, ...c, warnings: c.warnings ?? [] });
    if (id === 'health') {
      const total = rate(v.health_total_rate);
      const care = rate(v.long_term_care_income_rate);
      if (!total) skipped.push({ source: id, why: 'missing_field' });
      else {
        // 원문은 연도만 적는다 — 시행일은 관리자가 확인해 넣는다 (제안: 그 해 1월 1일)
        const w = ['effective_date_from_title_year'];
        push({ kind: 'health.rate', authority: '국민건강보험공단', sourceUnit: '%', validFrom: null, validTo: null, payload: { totalRate: total, employeeRate: half(total), employerRate: half(total), documentYear: year }, warnings: w });
        if (care) push({ kind: 'ltc.rate', authority: '국민건강보험공단', sourceUnit: '%', validFrom: null, validTo: null, payload: { incomeRate: care, healthRate: total, documentYear: year }, warnings: w });
      }
    } else if (id === 'pension') {
      const e = rate(v.employee_rate);
      const o = rate(v.employer_rate);
      if (!e || !o) skipped.push({ source: id, why: 'missing_field' });
      else push({ kind: 'pension.rate', authority: '국민연금공단', sourceUnit: '%', validFrom: null, validTo: null, payload: { employeeRate: e, employerRate: o }, warnings: ['rate_effective_date_not_in_source'] });
    } else if (id === 'pension_limits') {
      const periods = Array.isArray(v.periods) ? (v.periods as Record<string, unknown>[]) : [];
      if (!periods.length) skipped.push({ source: id, why: 'missing_field' });
      for (const p of periods) {
        const from = date(p.effective_from);
        const to = date(p.effective_to_inclusive);
        const lower = krw(p.lower_krw);
        const upper = krw(p.upper_krw);
        if (!from || !to || lower === null || upper === null || upper < lower) skipped.push({ source: id, why: 'missing_field' });
        else push({ kind: 'pension.limit', authority: '국민연금공단', sourceUnit: '원', validFrom: from, validTo: nextDay(to), payload: { lower, upper } });
      }
    } else if (id === 'accident') {
      const per = str(v.commuting_rate_per_thousand);
      const norm = rate(v.commuting_normalized_rate);
      if (!per || !norm) skipped.push({ source: id, why: 'missing_field' });
      else push({ kind: 'accident.commute', authority: '고용노동부', sourceUnit: '천분율', validFrom: null, validTo: null, payload: { perThousand: per, rate: norm, documentYear: year }, warnings: ['effective_date_from_title_year'] });
    } else if (id === 'minimum_wage') {
      const hourly = krw(v.hourly_krw);
      if (hourly === null) skipped.push({ source: id, why: 'missing_field' });
      else push({ kind: 'minimum-wage', authority: '고용노동부', sourceUnit: '원', validFrom: null, validTo: null, payload: { hourly, monthly209: krw(v.monthly_209h_krw), documentYear: year }, warnings: ['effective_date_from_title_year'] });
    } else if (id === 'maternity') {
      const limit = krw(v.monthly_limit_krw);
      if (limit === null) skipped.push({ source: id, why: 'missing_field' });
      else push({ kind: 'maternity.limit', authority: '고용노동부', sourceUnit: '원', validFrom: date(v.effective_date_in_answer), validTo: null, payload: { monthlyLimit: limit }, warnings: ['official_consultation_not_notice'] });
    } else if (id === 'tax_amendment_probe') {
      const one = krw(v.one_child_adjustment_candidate_krw);
      if (one === null) skipped.push({ source: id, why: 'missing_field' });
      else push({ kind: 'income-tax.child-adjust', authority: '국가법령정보센터', sourceUnit: '원', validFrom: date(v.effective_from), validTo: null, payload: { child1: one, child2: null, perExtraChild: null }, warnings: ['only_one_child_value_collected'] });
    } else if (id === 'tax') {
      const bands = parseBands(bandsFile);
      if (!bands.ok) skipped.push({ source: id, why: bands.why });
      else push({ kind: 'income-tax.table', authority: '국세청', sourceUnit: '원', validFrom: null, validTo: null, payload: { bandCount: bands.bands.length, wageMin: bands.bands[0].wageFrom, wageMaxExclusive: bands.bands.at(-1)!.wageTo, families: 11, datasetDate: str(v.portal_dataset_date) }, bands: bands.bands, warnings: ['distributed_file_may_predate_latest_amendment', 'no_rule_above_table_max'] });
    } else skipped.push({ source: id, why: 'unknown_source' });
  }
  return { candidates, skipped };
}

/** 세액표 구간 파일 검사: 가족 11칸 · 금액 · 구간이 빈틈없이 이어지는지. 「-」는 세액 없음(0원) */
export function parseBands(file: unknown): { ok: true; bands: TaxBand[] } | { ok: false; why: string } {
  if (!Array.isArray(file) || file.length === 0) return { ok: false, why: 'bands_missing' };
  const bands: TaxBand[] = [];
  for (const b of file as Record<string, unknown>[]) {
    const from = typeof b.from_krw === 'number' ? b.from_krw : null;
    const to = typeof b.to_krw_exclusive === 'number' ? b.to_krw_exclusive : null;
    const raw = Array.isArray(b.tax_by_family_1_to_11_raw) ? (b.tax_by_family_1_to_11_raw as unknown[]) : [];
    if (from === null || to === null || to <= from || raw.length !== 11) return { ok: false, why: 'bands_format' };
    const taxes = raw.map((x) => (x === '-' ? 0 : krw(x)));
    if (taxes.some((x) => x === null)) return { ok: false, why: 'bands_format' };
    if (bands.length && bands.at(-1)!.wageTo !== from) return { ok: false, why: 'bands_gap' };
    bands.push({ wageFrom: from, wageTo: to, taxes: taxes as number[] });
  }
  return { ok: true, bands };
}

// ── 소득세 조회 (S06 계산기) ──
// 규칙은 전부 소득세법 시행령 [별표 2] 근로소득 간이세액표의 원문에서 읽은 것이다(수집기가 읽어 payload에 담는다). 여기서 숫자를 정하지 않는다.
export type ChildRule = { child1: number | null; child2: number | null; perExtraChild: number | null };
/** 1,000만원 초과 구간의 식: (1,000만원인 경우의 세액) + fixed + (over를 넘는 금액 [× 98%] × ratePct%) */
export type HighBand = { over: number; upTo: number | null; fixed: number; pct98: boolean; ratePct: number };
export type TaxRules = { wageMin: number; wageMaxExclusive: number; topRow: number[] | null; highBands: HighBand[] | null; family11Rule: boolean };
export type TaxEstimate =
  | { ok: true; baseTax: number; childAdjust: number; afterChild: number; ratio: number; incomeTax: number; localTax: number; how: 'below_table' | 'table' | 'top_row' | 'high_band' }
  | { ok: false; why: 'no_row' | 'no_child_rule' | 'no_family_rule' | 'no_high_rule' | 'invalid_input' };

/** 가족 수별 세액. 11명을 넘으면 별표 2 제4호: (11명 세액) − (10명 세액 − 11명 세액) × 넘는 가족 수 */
export function familyTax(taxes: number[], family: number, rule11: boolean): number | null {
  if (taxes.length !== 11 || !Number.isInteger(family) || family < 1) return null;
  if (family <= 11) return taxes[family - 1];
  if (!rule11) return null;
  return Math.max(0, taxes[10] - (taxes[9] - taxes[10]) * (family - 11));
}

export const asChildRule = (p: Record<string, Json> | undefined): ChildRule | null => (p ? { child1: typeof p.child1 === 'number' ? p.child1 : null, child2: typeof p.child2 === 'number' ? p.child2 : null, perExtraChild: typeof p.perExtraChild === 'number' ? p.perExtraChild : null } : null);

export function asTaxRules(p: Record<string, Json> | undefined): TaxRules | null {
  if (!p || typeof p.wageMin !== 'number' || typeof p.wageMaxExclusive !== 'number') return null;
  const top = Array.isArray(p.topRow) && p.topRow.length === 11 && p.topRow.every((x) => typeof x === 'number') ? (p.topRow as number[]) : null;
  const high = Array.isArray(p.highBands) && p.highBands.length > 0 ? (p.highBands as unknown as HighBand[]) : null;
  return { wageMin: p.wageMin, wageMaxExclusive: p.wageMaxExclusive, topRow: top, highBands: high, family11Rule: p.family11Rule === true };
}

/**
 * 표 세액(또는 고액 구간 식) − 자녀 공제 → 선택 비율 → 10원 미만 버림. 지방소득세는 소득세의 10%(10원 미만 버림).
 * 수집기 교차검수의 예(3,370,000원 · 가족 3 · 자녀 1 · 80% → 24,540원)를 재현하는 순서다. 절사 규정 전체를 검증한 것은 아니다(임시).
 * bandTaxes: 그 급여가 든 구간의 가족 1~11명 세액. 표에 없는데 규칙도 없으면 계산하지 않는다 — 마지막 줄 값이나 0으로 대신하지 않는다.
 * 표의 첫 구간(77만원)보다 적은 급여는 세액 0원이다(표가 그 위부터 시작하고 첫 구간들이 전부 「-」).
 */
export function estimateTax(input: { wage: number; family: number; children: number; ratio: number; bandTaxes: number[] | null; rules: TaxRules; childRule: ChildRule | null }): TaxEstimate {
  const { wage, family, children, ratio, rules } = input;
  if (![80, 100, 120].includes(ratio) || !Number.isInteger(children) || children < 0 || children > 20 || !Number.isInteger(wage) || wage < 0 || !Number.isInteger(family) || family < 1 || family > 30) return { ok: false, why: 'invalid_input' };
  // 계산은 1만 배 한 정수로 한다 (98% × 35% 같은 곱에서 소수 오차가 나지 않게)
  let scaled: number;
  let how: 'below_table' | 'table' | 'top_row' | 'high_band';
  if (wage < rules.wageMin) {
    scaled = 0;
    how = 'below_table';
  } else if (wage < rules.wageMaxExclusive) {
    if (!input.bandTaxes) return { ok: false, why: 'no_row' };
    const t = familyTax(input.bandTaxes, family, rules.family11Rule);
    if (t === null) return { ok: false, why: 'no_family_rule' };
    scaled = t * 10000;
    how = 'table';
  } else {
    if (!rules.topRow) return { ok: false, why: 'no_high_rule' };
    const t = familyTax(rules.topRow, family, rules.family11Rule);
    if (t === null) return { ok: false, why: 'no_family_rule' };
    if (wage === rules.wageMaxExclusive) {
      scaled = t * 10000;
      how = 'top_row';
    } else {
      const b = rules.highBands?.find((x) => wage > x.over && (x.upTo === null || wage <= x.upTo));
      if (!b) return { ok: false, why: 'no_high_rule' };
      scaled = (t + b.fixed) * 10000 + (wage - b.over) * (b.pct98 ? 98 : 100) * b.ratePct;
      how = 'high_band';
    }
  }
  let childAdjust = 0;
  if (children > 0) {
    const r = input.childRule;
    const v = !r ? null : children === 1 ? r.child1 : children === 2 ? r.child2 : r.child2 !== null && r.perExtraChild !== null ? r.child2 + (children - 2) * r.perExtraChild : null;
    if (v === null) return { ok: false, why: 'no_child_rule' };
    childAdjust = v;
  }
  const after = Math.max(0, scaled - childAdjust * 10000);
  const incomeTax = Math.floor((after * ratio) / 100 / 10000 / 10) * 10;
  const localTax = Math.floor(incomeTax / 100) * 10;
  return { ok: true, baseTax: Math.floor(scaled / 10000), childAdjust, afterChild: Math.floor(after / 10000), ratio, incomeTax, localTax, how };
}

/** 승인된 판 가운데 그 날짜에 쓰는 것 (시행일 ≤ 날짜 < 끝). 없으면 null — 이전 연도 표를 대신 쓰지 않는다 */
export function pickAt<T extends { validFrom: string | null; validTo: string | null }>(list: T[], day: string): T | null {
  return list.filter((x) => x.validFrom !== null && x.validFrom <= day && (x.validTo === null || day < x.validTo)).sort((a, b) => (a.validFrom! < b.validFrom! ? 1 : -1))[0] ?? null;
}

// ── 직접 입력 (수집기가 읽지 못하는 자료 — 예: 고용보험) ──
/** 퍼센트 글자 → 소수 비율 글자. "0.9" → "0.009" (부동소수 없이 자릿수만 옮긴다) */
export function pctToRate(v: unknown): string | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,2}(\.\d{1,6})?$/.test(s)) return null;
  const [a, b = ''] = s.split('.');
  const digits = (a.padStart(3, '0') + b).replace(/^0+(?=\d{3,})/, ''); // 정수부를 세 자리로 맞춘 뒤 소수점을 두 칸 앞으로
  const whole = a.padStart(3, '0');
  const out = `${whole.slice(0, -2).replace(/^0+(?=\d)/, '')}.${whole.slice(-2)}${b}`.replace(/0+$/, '').replace(/\.$/, '');
  return digits ? (out.startsWith('.') ? `0${out}` : out || '0') : '0';
}
/** 소수 비율 글자 → 퍼센트 글자 (보여 주기용). "0.03595" → "3.595" */
export function rateToPct(r: string | number | null | undefined): string {
  if (r === null || r === undefined) return '';
  const [a, b = ''] = String(r).split('.');
  const d = (b + '00').slice(0, 2);
  const rest = (b + '00').slice(2).replace(/0+$/, '');
  const whole = `${a === '0' ? '' : a}${d}`.replace(/^0+(?=\d)/, '') || '0';
  return rest ? `${whole}.${rest}` : whole;
}

type Field = { key: string; type: 'pct' | 'krw' | 'num'; optional?: boolean };
export const MANUAL_FIELDS: Partial<Record<ReferenceKind, Field[]>> = {
  'pension.rate': [{ key: 'employeeRate', type: 'pct' }, { key: 'employerRate', type: 'pct' }],
  'pension.limit': [{ key: 'lower', type: 'krw' }, { key: 'upper', type: 'krw' }],
  'health.rate': [{ key: 'employeeRate', type: 'pct' }, { key: 'employerRate', type: 'pct' }],
  'ltc.rate': [{ key: 'incomeRate', type: 'pct' }, { key: 'healthRate', type: 'pct' }],
  'employment.rate': [{ key: 'employeeRate', type: 'pct' }, { key: 'employerRate', type: 'pct' }],
  'accident.commute': [{ key: 'perThousand', type: 'num' }],
  'minimum-wage': [{ key: 'hourly', type: 'krw' }],
  'maternity.limit': [{ key: 'monthlyLimit', type: 'krw' }],
  'income-tax.child-adjust': [{ key: 'child1', type: 'krw' }, { key: 'child2', type: 'krw', optional: true }, { key: 'perExtraChild', type: 'krw', optional: true }],
};

/** 직접 입력한 값 → 정규화한 payload. 형식이 틀리면 null (빈 칸을 0으로 채우지 않는다) */
export function buildManual(kind: ReferenceKind, b: Record<string, unknown>): Record<string, string | number | null> | null {
  const fields = MANUAL_FIELDS[kind];
  if (!fields) return null;
  const out: Record<string, string | number | null> = {};
  for (const f of fields) {
    const raw = b[f.key];
    if (raw === undefined || raw === null || raw === '') {
      if (!f.optional) return null;
      out[f.key] = null;
      continue;
    }
    const v = f.type === 'pct' ? pctToRate(raw) : f.type === 'krw' ? krw(raw) : /^\d{1,3}(\.\d{1,4})?$/.test(String(raw).trim()) ? String(raw).trim() : null;
    if (v === null) return null;
    out[f.key] = v;
  }
  if (kind === 'pension.limit' && (out.upper as number) < (out.lower as number)) return null;
  return out;
}
