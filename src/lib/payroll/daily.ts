// 일용직 지급 계산 — 순수 계산 (PRD v1.3 9장 · 18.5 W07). 화면과 서버가 같이 쓴다.
// ★ 정규직 월 세액표를 쓰지 않는다. 일용근로소득은 하루 단위로 계산한다.
// ★ 아래 숫자는 통상 방식의 임시 값이다(세무 검증 대기 — 검증 대기 기록). 규칙 번호를 명세에 남겨, 값이 바뀌면 어느 규칙으로 계산했는지 알 수 있게 한다.
//     하루 과세 지급액 − 150,000원(근로소득공제) → × 6%(세율) → × (1 − 55%)(근로소득세액공제) = 소득세. 10원 미만 버림.
//     하루 소득세가 1,000원 미만이면 떼지 않는다(소액부징수). 지방소득세 = 소득세의 10%, 10원 미만 버림.
// ★ 세금 적용 상태가 「모름」이거나 보험 적용 상태에 「모름」이 있으면 계산하지 않는다(BLOCKED). 0원으로 내지 않는다.
// ★ 4대보험 (2026-10-28 의뢰인 급여-58: 앱이 자동 계산, 최고관리자가 고칠 수 있다) — 정규 급여와 같은 승인 요율 · 끝수 규칙을 쓴다.
//     「자동」이면 그 달 근무로 정한다(임시 규칙 daily-insurance-temp-1, 검증 대기 기록):
//       고용보험 — 일반 일용직은 가입. 외국인은 F-2 · F-5 · F-6 가입, E-9 · H-2는 본인 신청(임의)이라 「자동」이면 빼고, 그 밖의 자격은 빼고 확인을 알린다
//       국민연금 · 건강보험 — 그 달 근무일 8일 이상 또는 근로시간 60시간 이상(일당 1공수 = 8시간으로 센다)이면 가입. 외국인 국민연금은 나라별(상호주의)이라 「자동」이면 빼고 확인을 알린다
//       장기요양 — 건강보험료 × 비율. 기준액 = 그 달 과세 지급 합계(기준액 하한 · 상한 · 끊는 단위 · 보험료 상하한은 정규와 같다)
// ★ 최고관리자의 조정: 자동 항목(보험 · 세금)의 금액을 바꾸거나 항목을 더한다. 바꾼 줄은 「조정」으로 남는다.
// 프리랜서(사업소득) — 한 달 지급 합계 × 3%, 10원 미만 버림, 1,000원 미만이면 떼지 않음(소액부징수). 지방소득세 = 소득세의 10%. 4대보험 없음.
import { dec, max, min, mul, toWon, type Rounding } from './engine/decimal';
import type { EngineReference, InsuranceRef } from './engine/engine';

export const DAILY_RULE = 'daily-tax-temp-1';
export const DAILY_INSURANCE_RULE = 'daily-insurance-temp-1';
export const DAILY_TAX = { dailyDeduction: 150_000, rate: 0.06, credit: 0.55, minTax: 1_000 } as const;
export const DAILY_INSURANCE_THRESHOLD = { days: 8, hours: 60, hoursPerManDay: 8 } as const;

export type DailyItem = { label: string; kind: 'TAXABLE' | 'NONTAX' | 'DEDUCTION'; amount: number };
/** basis: 그 줄이 가리키는 고용 기간의 지급 기준 (없으면 일당) */
export type DailyWork = { id: string; workDate: string; project: string; quantity: number; dayRate: number; items: DailyItem[]; status: 'DRAFT' | 'CONFIRMED' | 'VOID'; basis?: PayBasis };
export const BUSINESS_RULE = 'business-tax-temp-1';
export const BUSINESS_TAX = { percent: 3, minTax: 1_000 } as const;
/** 지급 기준 — 수량이 무엇을 뜻하는가: 일당 = 공수(일) · 시간당 = 시간 · 월급 = 개월 · 고정 금액 = 건수 */
export const PAY_BASES = ['DAY', 'HOUR', 'MONTH', 'FIXED'] as const;
export type PayBasis = (typeof PAY_BASES)[number];
export const QTY_MAX: Record<PayBasis, number> = { DAY: 3, HOUR: 744, MONTH: 12, FIXED: 100 };
export type InsState = 'UNKNOWN' | 'AUTO' | 'YES' | 'NO';
export type DailyTerms = { taxState: 'UNKNOWN' | 'DAILY' | 'BUSINESS' | 'NONE'; ei: InsState; np: InsState; hi: InsState };
export type WorkerKind = 'GENERAL' | 'FOREIGN';
export type DailyPerson = { workerKind: WorkerKind; visaType: string | null; nationality: string | null };
/** 매달 한 번 넣는 항목 (대상자에 붙여 둔다) — 지급이면 과세 · 비과세, 공제면 그대로 뺀다 */
export type MonthlyItem = { code: string; label: string; kind: 'TAXABLE' | 'NONTAX' | 'DEDUCTION'; amount: number };
/** 최고관리자의 조정 — 자동 항목 코드면 그 금액을 바꾸고, 아니면 새 항목을 더한다 */
export type DailyAdjustment = { code: string; label: string; kind: 'PAYMENT' | 'DEDUCTION'; amount: number };
export const AUTO_CODES = ['NP', 'HI', 'LTC', 'EI', 'INCOME_TAX', 'LOCAL_TAX', 'BIZ_TAX', 'BIZ_LOCAL_TAX'] as const;
export type DailyLineRow = { code: string; label: string; kind: 'PAYMENT' | 'DEDUCTION' | 'EMPLOYER'; amount: number; source: 'AUTO' | 'MANUAL' | 'OVERRIDE'; how: string | null; taxable?: boolean };
export type DailyBlocker = 'tax_unknown' | 'insurance_unknown' | 'unconfirmed_work' | 'no_work' | 'insurance_ref_missing';
export type DailyDay = { workIds: string[]; workDate: string; gross: number; taxable: number; nontax: number; incomeTax: number; localTax: number; deduction: number };
export type DailyInsurance = { np: number; hi: number; ltc: number; ei: number };
export type DailyResult =
  | { state: 'BLOCKED'; blockers: DailyBlocker[]; warnings: string[] }
  | {
      state: 'OK'; blockers: []; warnings: string[]; days: DailyDay[];
      workDays: number; manDays: number; hours: number; // 일한 날 수(날짜) · 공수 합계(일당) · 시간 합계(시간당)
      gross: number; taxable: number; nontax: number; incomeTax: number; localTax: number;
      insurance: DailyInsurance; insuranceTotal: number; otherDeduction: number; deduction: number; net: number;
      applied: { np: boolean; hi: boolean; ei: boolean }; lines: DailyLineRow[]; rule: string;
    };
export type DailyCalcOptions = {
  person?: DailyPerson;
  reference?: EngineReference | null; // 승인된 요율 (정규 급여와 같은 판) — 없으면 보험료를 계산하지 못한다
  rounding?: Rounding; // 보험료 끝수 (정규와 같다)
  monthly?: MonthlyItem[];
  adjustments?: DailyAdjustment[];
};

const floor10 = (v: number) => Math.floor(v / 10) * 10;
/** 하루 소득세 — 과세 지급액에서 */
export function dailyIncomeTax(taxable: number): number {
  const base = taxable - DAILY_TAX.dailyDeduction;
  if (base <= 0) return 0;
  // 0.06 × 0.45 = 0.027 — 소수 오차가 없도록 정수로 계산한다 (× 27 ÷ 1000)
  const tax = floor10(Math.floor((base * 27) / 1000));
  return tax < DAILY_TAX.minTax ? 0 : tax;
}

/** 사업소득 원천징수 소득세 — 한 달 지급 합계에서 */
export function businessIncomeTax(amount: number): number {
  if (amount <= 0) return 0;
  const tax = floor10(Math.floor((amount * BUSINESS_TAX.percent) / 100));
  return tax < BUSINESS_TAX.minTax ? 0 : tax;
}

/** 「자동」 보험 판단 — 그 달의 근무일 · 시간 · 체류 자격으로 (임시 규칙, 위 머리말) */
export function autoInsurance(person: DailyPerson | undefined, days: number, hours: number): { np: boolean; hi: boolean; ei: boolean; warnings: string[] } {
  const foreign = person?.workerKind === 'FOREIGN';
  const visa = (person?.visaType ?? '').toUpperCase().replace(/\s/g, '');
  const enough = days >= DAILY_INSURANCE_THRESHOLD.days || hours >= DAILY_INSURANCE_THRESHOLD.hours;
  const warnings: string[] = [];
  let ei = true;
  if (foreign) {
    if (['F-2', 'F-5', 'F-6'].includes(visa)) ei = true;
    else if (['E-9', 'H-2'].includes(visa)) ei = false; // 본인 신청(임의 가입) — 신청했으면 「적용」으로 바꾼다
    else {
      ei = false;
      warnings.push('ei_foreign_check');
    }
  }
  let np = enough;
  if (foreign && enough) {
    np = false; // 나라마다 다르다(상호주의) — 공단 확인 뒤 「적용」 · 「제외」로 정한다
    warnings.push('np_foreign_check');
  }
  return { np, hi: enough, ei, warnings };
}

function premium(base: number, r: InsuranceRef, rounding: Rounding): { employee: number; employer: number } {
  let b = dec(base);
  if (r.floor !== null) b = max(b, dec(r.floor));
  if (r.ceiling !== null) b = min(b, dec(r.ceiling));
  if (r.baseUnit) b = dec(toWon(b, { mode: 'FLOOR', unit: r.baseUnit }));
  const clamp = (v: bigint) => {
    let out = v;
    if (r.premiumFloor != null) out = max(out, dec(r.premiumFloor));
    if (r.premiumCeiling != null) out = min(out, dec(r.premiumCeiling));
    return out;
  };
  return { employee: Number(toWon(clamp(mul(b, dec(r.employeeRate))), rounding)), employer: Number(toWon(clamp(mul(b, dec(r.employerRate))), rounding)) };
}

const AUTO_LABEL: Record<string, string> = { NP: '국민연금', HI: '건강보험', LTC: '장기요양보험', EI: '고용보험', INCOME_TAX: '소득세', LOCAL_TAX: '지방소득세', BIZ_TAX: '사업소득세', BIZ_LOCAL_TAX: '사업소득 지방소득세' };
const BASIS_LABEL: Record<PayBasis, string> = { DAY: '일당', HOUR: '시급', MONTH: '월급', FIXED: '고정 금액' };
const UNIT: Record<PayBasis, string> = { DAY: '공수', HOUR: '시간', MONTH: '개월', FIXED: '건' };
const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

/** 한 사람 · 한 달의 근무 줄(무효 제외)로 지급명세를 만든다 */
export function calcDaily(works: readonly DailyWork[], terms: DailyTerms, opts: DailyCalcOptions = {}): DailyResult {
  const live = works.filter((w) => w.status !== 'VOID');
  const blockers: DailyBlocker[] = [];
  const warnings: string[] = [];
  if (live.length === 0) blockers.push('no_work');
  if (live.some((w) => w.status === 'DRAFT')) blockers.push('unconfirmed_work'); // 확정하지 않은 근무가 섞여 있으면 계산하지 않는다
  if (terms.taxState === 'UNKNOWN') blockers.push('tax_unknown');
  const business = terms.taxState === 'BUSINESS'; // 프리랜서는 4대보험이 없다 — 보험 「모름」으로 막지 않는다
  if (!business && (terms.ei === 'UNKNOWN' || terms.np === 'UNKNOWN' || terms.hi === 'UNKNOWN')) blockers.push('insurance_unknown');
  if (blockers.length > 0) return { state: 'BLOCKED', blockers, warnings };

  // ── 날짜마다 지급 · 하루 세금 ──
  const byDate = new Map<string, DailyWork[]>();
  for (const w of [...live].sort((x, y) => x.workDate.localeCompare(y.workDate) || x.id.localeCompare(y.id))) byDate.set(w.workDate, [...(byDate.get(w.workDate) ?? []), w]);
  // 같은 날 다른 현장 두 곳 이상 — 막지는 않는다(오전 · 오후 다른 현장일 수 있다). 겹쳐 넣은 것인지 담당자가 보게 알린다 (2026-10-20, 미구현 #12)
  if ([...byDate.values()].some((rows) => new Set(rows.map((w) => w.project)).size > 1)) warnings.push('same_day_projects');
  const days = [...byDate].map(([workDate, rows]): DailyDay => {
    const sum = (k: DailyItem['kind']) => rows.reduce((a, w) => a + w.items.filter((i) => i.kind === k).reduce((x, i) => x + i.amount, 0), 0);
    const taxable = rows.reduce((a, w) => a + Math.round(w.quantity * w.dayRate), 0) + sum('TAXABLE'), nontax = sum('NONTAX');
    const incomeTax = terms.taxState === 'DAILY' ? dailyIncomeTax(taxable) : 0;
    return { workIds: rows.map((w) => w.id), workDate, gross: taxable + nontax, taxable, nontax, incomeTax, localTax: floor10(Math.floor(incomeTax / 10)), deduction: sum('DEDUCTION') };
  });
  const total = (k: keyof Omit<DailyDay, 'workIds' | 'workDate'>) => days.reduce((a, d) => a + d[k], 0);
  const basisOf = (w: DailyWork): PayBasis => w.basis ?? 'DAY';
  const manDays = Math.round(live.filter((w) => basisOf(w) === 'DAY').reduce((a, w) => a + w.quantity, 0) * 100) / 100;
  const hours = Math.round(live.filter((w) => basisOf(w) === 'HOUR').reduce((a, w) => a + w.quantity, 0) * 100) / 100;

  // ── 지급 줄: 기준 · 단가마다 한 줄, 근무 줄의 항목은 이름마다 한 줄 ──
  const lines: DailyLineRow[] = [];
  const groups = new Map<string, { basis: PayBasis; rate: number; qty: number; amount: number }>();
  for (const w of live) {
    const k = `${basisOf(w)}:${w.dayRate}`;
    const g = groups.get(k) ?? { basis: basisOf(w), rate: w.dayRate, qty: 0, amount: 0 };
    g.qty += w.quantity;
    g.amount += Math.round(w.quantity * w.dayRate);
    groups.set(k, g);
  }
  for (const g of groups.values()) lines.push({ code: `BASE_${g.basis}`, label: BASIS_LABEL[g.basis], kind: 'PAYMENT', amount: g.amount, source: 'AUTO', how: `${fmt(Math.round(g.qty * 100) / 100)}${UNIT[g.basis]} × ${fmt(g.rate)}원`, taxable: true });
  const itemSum = new Map<string, DailyLineRow>();
  for (const w of live) for (const i of w.items) {
    const kind = i.kind === 'DEDUCTION' ? 'DEDUCTION' : 'PAYMENT';
    const key = `${i.kind}:${i.label}`;
    const cur = itemSum.get(key) ?? { code: `ITEM_${i.kind}`, label: i.label, kind, amount: 0, source: 'MANUAL' as const, how: null, taxable: i.kind === 'TAXABLE' };
    cur.amount += i.amount;
    itemSum.set(key, cur);
  }
  lines.push(...itemSum.values());
  // 매달 항목 — 하루 세금이 끝난 뒤 더하는 지급은 일용 소득세에 들어가지 않는다(알린다). 사업소득은 한 달 합계라 들어간다
  let monthlyTaxable = 0, monthlyNontax = 0;
  for (const m of opts.monthly ?? []) {
    if (m.kind === 'DEDUCTION') lines.push({ code: m.code, label: m.label, kind: 'DEDUCTION', amount: m.amount, source: 'MANUAL', how: null });
    else {
      lines.push({ code: m.code, label: m.label, kind: 'PAYMENT', amount: m.amount, source: 'MANUAL', how: null, taxable: m.kind === 'TAXABLE' });
      if (m.kind === 'TAXABLE') monthlyTaxable += m.amount;
      else monthlyNontax += m.amount;
    }
  }
  if (monthlyTaxable > 0 && terms.taxState === 'DAILY') warnings.push('monthly_pay_not_in_daily_tax');
  const adjPay = (opts.adjustments ?? []).filter((a) => a.kind === 'PAYMENT' && !(AUTO_CODES as readonly string[]).includes(a.code));
  for (const a of adjPay) lines.push({ code: a.code, label: a.label, kind: 'PAYMENT', amount: a.amount, source: 'OVERRIDE', how: null, taxable: true });
  const adjTaxable = adjPay.reduce((s, a) => s + a.amount, 0);
  if (adjTaxable > 0 && terms.taxState === 'DAILY') warnings.push('monthly_pay_not_in_daily_tax');

  let taxable = total('taxable') + monthlyTaxable + adjTaxable, nontax = total('nontax') + monthlyNontax;
  let incomeTax = total('incomeTax'), localTax = total('localTax');
  let rule = DAILY_RULE;
  if (business) {
    // 사업소득은 한 달 합계로 한 번 — 비과세 없이 지급 전액이 기준
    if (nontax > 0) warnings.push('business_no_exempt');
    taxable += nontax;
    nontax = 0;
    incomeTax = businessIncomeTax(taxable);
    localTax = floor10(Math.floor(incomeTax / 10));
    rule = BUSINESS_RULE;
  }

  // ── 4대보험 ──
  const ins: DailyInsurance = { np: 0, hi: 0, ltc: 0, ei: 0 };
  const applied = { np: false, hi: false, ei: false };
  if (!business) {
    const auto = autoInsurance(opts.person, byDate.size, hours + manDays * DAILY_INSURANCE_THRESHOLD.hoursPerManDay);
    const decide = (k: 'np' | 'hi' | 'ei') => (terms[k] === 'YES' ? true : terms[k] === 'NO' ? false : auto[k]);
    applied.np = decide('np');
    applied.hi = decide('hi');
    applied.ei = decide('ei');
    if (terms.np === 'AUTO' || terms.hi === 'AUTO' || terms.ei === 'AUTO') warnings.push(...auto.warnings.filter((w) => (w === 'np_foreign_check' ? terms.np === 'AUTO' : terms.ei === 'AUTO')));
    if (applied.np || applied.hi || applied.ei) {
      const ref = opts.reference;
      const rounding = opts.rounding ?? { mode: 'FLOOR', unit: 10 };
      if (!ref) warnings.push('insurance_not_calculated'); // 요율이 없는 순수 계산(검사) — 보험료를 내지 않는다
      else {
        const need = [applied.np && !ref.pension, applied.hi && (!ref.health || ref.ltcOfHealth === null), applied.ei && !ref.employment];
        if (need.some(Boolean)) return { state: 'BLOCKED', blockers: ['insurance_ref_missing'], warnings };
        const base = taxable;
        const push = (code: 'NP' | 'HI' | 'EI', r: InsuranceRef) => {
          const p = premium(base, r, rounding);
          lines.push({ code, label: AUTO_LABEL[code], kind: 'DEDUCTION', amount: p.employee, source: 'AUTO', how: `${fmt(base)}원 × ${r.employeeRate}` });
          lines.push({ code: `${code}_EMPLOYER`, label: `${AUTO_LABEL[code]}(회사)`, kind: 'EMPLOYER', amount: p.employer, source: 'AUTO', how: `${fmt(base)}원 × ${r.employerRate}` });
          return p;
        };
        if (applied.np) ins.np = push('NP', ref.pension!).employee;
        if (applied.hi) {
          const h = push('HI', ref.health!);
          ins.hi = h.employee;
          ins.ltc = Number(toWon(mul(dec(h.employee), dec(ref.ltcOfHealth!)), rounding));
          lines.push({ code: 'LTC', label: AUTO_LABEL.LTC, kind: 'DEDUCTION', amount: ins.ltc, source: 'AUTO', how: `${fmt(h.employee)}원 × ${ref.ltcOfHealth}` });
          lines.push({ code: 'LTC_EMPLOYER', label: `${AUTO_LABEL.LTC}(회사)`, kind: 'EMPLOYER', amount: Number(toWon(mul(dec(h.employer), dec(ref.ltcOfHealth!)), rounding)), source: 'AUTO', how: null });
        }
        if (applied.ei) ins.ei = push('EI', ref.employment!).employee;
      }
    }
  }

  // ── 세금 줄 · 근무 줄 공제 ──
  const taxCode = business ? 'BIZ_TAX' : 'INCOME_TAX', localCode = business ? 'BIZ_LOCAL_TAX' : 'LOCAL_TAX';
  if (terms.taxState !== 'NONE') {
    lines.push({ code: taxCode, label: AUTO_LABEL[taxCode], kind: 'DEDUCTION', amount: incomeTax, source: 'AUTO', how: business ? `${fmt(taxable)}원 × 3%` : '하루마다 (지급 − 150,000원) × 2.7%' });
    lines.push({ code: localCode, label: AUTO_LABEL[localCode], kind: 'DEDUCTION', amount: localTax, source: 'AUTO', how: '소득세 × 10%' });
  }

  // ── 최고관리자 조정: 자동 항목 금액 바꾸기 · 공제 더하기 ──
  for (const a of opts.adjustments ?? []) {
    if ((AUTO_CODES as readonly string[]).includes(a.code)) {
      const l = lines.find((x) => x.code === a.code && x.kind === 'DEDUCTION');
      if (l) Object.assign(l, { amount: a.amount, source: 'OVERRIDE' as const, how: l.how ? `${l.how} → 조정` : '조정' });
      else lines.push({ code: a.code, label: AUTO_LABEL[a.code] ?? a.label, kind: 'DEDUCTION', amount: a.amount, source: 'OVERRIDE', how: '조정' });
    } else if (a.kind === 'DEDUCTION') lines.push({ code: a.code, label: a.label, kind: 'DEDUCTION', amount: a.amount, source: 'OVERRIDE', how: null });
  }
  const amt = (code: string) => lines.filter((l) => l.code === code && l.kind === 'DEDUCTION').reduce((s, l) => s + l.amount, 0);
  ins.np = amt('NP');
  ins.hi = amt('HI');
  ins.ltc = amt('LTC');
  ins.ei = amt('EI');
  incomeTax = amt(taxCode);
  localTax = amt(localCode);
  if (applied.np || applied.hi || applied.ei || ins.np + ins.hi + ins.ltc + ins.ei > 0) rule = `${rule}+${DAILY_INSURANCE_RULE}`;

  const gross = lines.filter((l) => l.kind === 'PAYMENT').reduce((s, l) => s + l.amount, 0);
  const deduction = lines.filter((l) => l.kind === 'DEDUCTION').reduce((s, l) => s + l.amount, 0);
  const insuranceTotal = ins.np + ins.hi + ins.ltc + ins.ei;
  return {
    state: 'OK', blockers: [], warnings: [...new Set(warnings)], days, workDays: byDate.size, manDays, hours,
    gross, taxable, nontax, incomeTax, localTax, insurance: ins, insuranceTotal, otherDeduction: deduction - incomeTax - localTax - insuranceTotal, deduction, net: gross - deduction, applied, lines, rule,
  };
}

/** 저장 · 요청에서 온 항목을 정리한다 (모르는 값은 버린다) */
export function toDailyItems(v: unknown): DailyItem[] | null {
  if (!Array.isArray(v) || v.length > 10) return null;
  const out: DailyItem[] = [];
  for (const x of v as Record<string, unknown>[]) {
    const label = typeof x?.label === 'string' ? x.label.trim().slice(0, 40) : '';
    const amount = typeof x?.amount === 'number' ? x.amount : typeof x?.amount === 'string' ? Number(x.amount.replace(/,/g, '')) : NaN;
    if (!label || !Number.isInteger(amount) || amount <= 0 || amount > 1e9 || (x.kind !== 'TAXABLE' && x.kind !== 'NONTAX' && x.kind !== 'DEDUCTION')) return null;
    out.push({ label, kind: x.kind, amount });
  }
  return out;
}

/** 매달 항목 정리 — 코드 · 이름 · 종류 · 금액. 틀린 값이 하나라도 있으면 통째로 거부 */
export function toMonthlyItems(v: unknown): MonthlyItem[] | null {
  if (!Array.isArray(v) || v.length > 20) return null;
  const out: MonthlyItem[] = [];
  for (const x of v as Record<string, unknown>[]) {
    const label = typeof x?.label === 'string' ? x.label.trim().slice(0, 40) : '';
    const code = typeof x?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(x.code) ? x.code : 'CUSTOM';
    const amount = typeof x?.amount === 'number' ? x.amount : typeof x?.amount === 'string' ? Number(x.amount.replace(/,/g, '')) : NaN;
    if (!label || !Number.isInteger(amount) || amount <= 0 || amount > 1e9 || (x.kind !== 'TAXABLE' && x.kind !== 'NONTAX' && x.kind !== 'DEDUCTION')) return null;
    if ((AUTO_CODES as readonly string[]).includes(code)) return null; // 보험 · 세금은 자동 항목이다(조정으로 바꾼다)
    out.push({ code, label, kind: x.kind, amount });
  }
  return out;
}
