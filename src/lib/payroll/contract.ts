// 직원별 계약 · 세무 · 개인 항목의 입력 검사 (PRD v1.3 5 · 18.1장). 순수함수.
// ★ 추정하지 않는다: 연봉을 자동으로 12로 나누지 않고, 계약 이름에서 금액을 짐작하지 않고, 「모름」을 「아니오」로 치지 않는다.
//   빠진 값이 있으면 저장은 되지만 「설정 미완료」로 보이고, 그 직원의 급여 계산은 차단된다.
export const PAY_TYPES = ['MONTHLY', 'HOURLY', 'ANNUAL'] as const;
export type PayType = (typeof PAY_TYPES)[number];
export const TIME_BASES = ['ACTUAL', 'ROUNDED', 'SCHEDULE'] as const; // 실제 시간 / 끊은 급여용 시간 / 일정 시간
export type TimeBasis = (typeof TIME_BASES)[number];

export type ContractInput = {
  payType: PayType;
  amount: number; // 원. 월급 · 시급 · 연봉
  timeBasis: TimeBasis;
  monthlyHours: number | null; // 월 환산 시간 (월급 · 연봉에서 시급을 낼 때)
  annualDivisor: number | null; // 연봉을 월로 나누는 수
  included: { overtimeHours: number | null; holidayHours: number | null; note: string | null }; // 계약 금액에 이미 들어 있는 연장 · 휴일 시간
};
export type Result<T> = { ok: true; value: T } | { ok: false; code: string };

const num = (v: unknown): number | null | undefined => (v === null || v === undefined || v === '' ? null : typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const text = (v: unknown, max: number): string | null | undefined => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
  return s.length > max ? undefined : s || null;
};
const MAX_AMOUNT = 100_000_000_000; // 1천억 원 — 자릿수 실수를 막는 상한

export function validateContract(b: Record<string, unknown>): Result<ContractInput> {
  if (!(PAY_TYPES as readonly unknown[]).includes(b.payType)) return { ok: false, code: 'contract_pay_type' };
  if (!(TIME_BASES as readonly unknown[]).includes(b.timeBasis)) return { ok: false, code: 'contract_time_basis' };
  const amount = num(b.amount);
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return { ok: false, code: 'contract_amount' };
  const payType = b.payType as PayType;
  const monthlyHours = num(b.monthlyHours);
  if (monthlyHours === undefined || (monthlyHours !== null && (monthlyHours <= 0 || monthlyHours > 744 || !Number.isInteger(monthlyHours * 100)))) return { ok: false, code: 'contract_monthly_hours' };
  if (payType === 'HOURLY' && monthlyHours !== null) return { ok: false, code: 'contract_monthly_hours' }; // 시급제에는 월 환산 시간이 없다
  const annualDivisor = num(b.annualDivisor);
  if (annualDivisor === undefined || (annualDivisor !== null && (annualDivisor <= 0 || annualDivisor > 24 || !Number.isInteger(annualDivisor * 100)))) return { ok: false, code: 'contract_annual_divisor' };
  if (payType !== 'ANNUAL' && annualDivisor !== null) return { ok: false, code: 'contract_annual_divisor' };
  const inc = (b.included && typeof b.included === 'object' ? b.included : {}) as Record<string, unknown>;
  const ot = num(inc.overtimeHours), hol = num(inc.holidayHours), note = text(inc.note, 300);
  const hours = (v: number | null | undefined) => v === null || (typeof v === 'number' && v >= 0 && v <= 744 && Number.isInteger(v * 100));
  if (!hours(ot) || !hours(hol) || note === undefined) return { ok: false, code: 'contract_included' };
  return { ok: true, value: { payType, amount, timeBasis: b.timeBasis as TimeBasis, monthlyHours, annualDivisor, included: { overtimeHours: ot as number | null, holidayHours: hol as number | null, note } } };
}

export const INSURERS = ['pension', 'health', 'employment', 'accident'] as const; // 국민연금 · 건강보험(장기요양은 건강보험을 따른다) · 고용보험 · 산재보험
export type Insurer = (typeof INSURERS)[number];
export type Tri = 'YES' | 'NO' | 'UNKNOWN';
export type InsuranceState = { state: Tri; reportedWage: number | null; note: string | null }; // 신고 보수(기준소득월액 · 보수월액), 제외 근거
export type TaxInput = {
  withholdingRatio: 80 | 100 | 120;
  familyCount: number; // 본인 포함
  childCount: number; // 8세 이상 20세 이하 자녀 (가족 수에 포함된 사람)
  insurance: Record<Insurer, InsuranceState>;
  studentLoan: { state: Tri; monthlyAmount: number | null; from: string | null; to: string | null }; // 상환 기간(끝은 그 날까지)
  reliefs: Reliefs;
};
/** 감면 · 지원 (DB 묶음 8, 2026-10-14). 회사 설정(사원급여 기본)에서 켠 것만 화면에 보이고 계산에 쓴다. 옛 판은 「모름」 */
export type SmeRelief = { state: Tri; rate: number | null; from: string | null; to: string | null; note: string | null }; // 중소기업 취업자 소득세 감면 — 감면율 %
export type DurunuriRelief = { state: Tri; pensionRate: number | null; employmentRate: number | null; from: string | null; to: string | null; note: string | null }; // 두루누리 — 근로자 보험료 지원율 %
export type Flat19Relief = { state: 'YES' | 'NO'; from: string | null; to: string | null; note: string | null }; // 외국인 단일세율 19%(조세특례제한법 제18조의2) — 본인 신청. 회사 설정 스위치 없이 직원마다 (묶음 31, 2026-10-20)
export type Reliefs = { sme: SmeRelief; durunuri: DurunuriRelief; flat19?: Flat19Relief }; // flat19가 없는 예전 판 = 아니오
export const UNKNOWN_RELIEFS: Reliefs = {
  sme: { state: 'UNKNOWN', rate: null, from: null, to: null, note: null },
  durunuri: { state: 'UNKNOWN', pensionRate: null, employmentRate: null, from: null, to: null, note: null },
  flat19: { state: 'NO', from: null, to: null, note: null },
};
export const SME_RATES = [50, 70, 90, 100] as const; // 감면율 고르기(임시 — 검증 대기 기록). 대상에 따라 다르다
/** 그 달(첫날~마지막 날)에 감면 · 지원 기간이 걸치는가 — 끝은 그 날까지 */
export const reliefCovers = (r: { from: string | null; to: string | null }, from: string, last: string) => !!r.from && r.from <= last && (r.to === null || r.to >= from);
export const UNKNOWN_TAX: TaxInput = {
  withholdingRatio: 100, familyCount: 1, childCount: 0,
  insurance: { pension: { state: 'UNKNOWN', reportedWage: null, note: null }, health: { state: 'UNKNOWN', reportedWage: null, note: null }, employment: { state: 'UNKNOWN', reportedWage: null, note: null }, accident: { state: 'UNKNOWN', reportedWage: null, note: null } },
  studentLoan: { state: 'UNKNOWN', monthlyAmount: null, from: null, to: null },
  reliefs: UNKNOWN_RELIEFS,
};
const tri = (v: unknown): v is Tri => v === 'YES' || v === 'NO' || v === 'UNKNOWN';

export function validateTax(b: Record<string, unknown>): Result<TaxInput> {
  if (b.withholdingRatio !== 80 && b.withholdingRatio !== 100 && b.withholdingRatio !== 120) return { ok: false, code: 'tax_ratio' };
  const family = num(b.familyCount), child = num(b.childCount);
  if (typeof family !== 'number' || !Number.isInteger(family) || family < 1 || family > 11) return { ok: false, code: 'tax_family' };
  if (typeof child !== 'number' || !Number.isInteger(child) || child < 0 || child > family - 1) return { ok: false, code: 'tax_child' }; // 자녀는 가족 수 안의 사람이다
  const src = (b.insurance && typeof b.insurance === 'object' ? b.insurance : {}) as Record<string, unknown>;
  const insurance = {} as Record<Insurer, InsuranceState>;
  for (const k of INSURERS) {
    const o = (src[k] && typeof src[k] === 'object' ? src[k] : {}) as Record<string, unknown>;
    const wage = num(o.reportedWage), note = text(o.note, 200);
    if (!tri(o.state) || wage === undefined || note === undefined || (wage !== null && (!Number.isInteger(wage) || wage < 0 || wage > MAX_AMOUNT))) return { ok: false, code: 'tax_insurance' };
    if (o.state === 'NO' && !note) return { ok: false, code: 'tax_insurance_reason' }; // 가입하지 않는다면 근거를 적는다
    insurance[k] = { state: o.state, reportedWage: wage, note };
  }
  const loan = (b.studentLoan && typeof b.studentLoan === 'object' ? b.studentLoan : {}) as Record<string, unknown>;
  const amt = num(loan.monthlyAmount);
  if (!tri(loan.state) || amt === undefined || (amt !== null && (!Number.isInteger(amt) || amt < 0 || amt > MAX_AMOUNT))) return { ok: false, code: 'tax_loan' };
  if (loan.state === 'YES' && amt === null) return { ok: false, code: 'tax_loan' };
  const lf = date(loan.from), lt = date(loan.to);
  if (lf === undefined || lt === undefined || (lf && lt && lt < lf)) return { ok: false, code: 'tax_loan_period' };
  const reliefs = validateReliefs(b.reliefs);
  if (!reliefs.ok) return reliefs;
  return { ok: true, value: { withholdingRatio: b.withholdingRatio, familyCount: family, childCount: child, insurance, studentLoan: { state: loan.state, monthlyAmount: loan.state === 'YES' ? amt : null, from: loan.state === 'YES' ? lf : null, to: loan.state === 'YES' ? lt : null }, reliefs: reliefs.value } };
}

const date = (v: unknown): string | null | undefined => (v === null || v === undefined || v === '' ? null : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : undefined);
const pct = (v: unknown): number | null | undefined => {
  const x = num(v);
  return x === null ? null : x === undefined || !Number.isInteger(x) || x < 0 || x > 100 ? undefined : x;
};
/**
 * 감면 · 지원 입력. 보내지 않으면 「모름」. 「예」면 비율 · 시작일 · 근거가 있어야 한다(대상인지는 사람이 근거를 보고 정한다 — 국적 · 나이로 추정하지 않는다).
 * 「아니오」 · 「모름」이면 비율 · 기간은 버린다.
 */
export function validateReliefs(v: unknown): Result<Reliefs> {
  if (v === undefined || v === null) return { ok: true, value: UNKNOWN_RELIEFS };
  if (typeof v !== 'object') return { ok: false, code: 'tax_relief' };
  const o = v as Record<string, unknown>;
  const s = (o.sme && typeof o.sme === 'object' ? o.sme : {}) as Record<string, unknown>;
  const d = (o.durunuri && typeof o.durunuri === 'object' ? o.durunuri : {}) as Record<string, unknown>;
  const sState = s.state ?? 'UNKNOWN', dState = d.state ?? 'UNKNOWN';
  if (!tri(sState) || !tri(dState)) return { ok: false, code: 'tax_relief' };
  const [sf, st, df, dt] = [date(s.from), date(s.to), date(d.from), date(d.to)];
  const [sn, dn] = [text(s.note, 200), text(d.note, 200)];
  const [sr, pr, er] = [pct(s.rate), pct(d.pensionRate), pct(d.employmentRate)];
  if ([sf, st, df, dt, sn, dn, sr, pr, er].some((x) => x === undefined)) return { ok: false, code: 'tax_relief' };
  if (sState === 'YES' && (sr === null || !(SME_RATES as readonly number[]).includes(sr!) || !sf || !sn || (st && st < sf!))) return { ok: false, code: 'tax_relief_sme' };
  if (dState === 'YES' && (pr === null || er === null || (pr === 0 && er === 0) || !df || !dn || (dt && dt < df!))) return { ok: false, code: 'tax_relief_durunuri' };
  // 단일세율 19%: 「예」면 시작일(신청한 달) · 근거(신청서 제출일 등)가 있어야 한다. 보내지 않으면 「아니오」
  const g = (o.flat19 && typeof o.flat19 === 'object' ? o.flat19 : {}) as Record<string, unknown>;
  const gState = g.state ?? 'NO';
  const [gf, gt, gn] = [date(g.from), date(g.to), text(g.note, 200)];
  if ((gState !== 'YES' && gState !== 'NO') || gf === undefined || gt === undefined || gn === undefined) return { ok: false, code: 'tax_relief' };
  if (gState === 'YES' && (!gf || !gn || (gt && gt < gf))) return { ok: false, code: 'tax_relief_flat19' };
  const flat19: Flat19Relief = gState === 'YES' ? { state: 'YES', from: gf!, to: gt ?? null, note: gn! } : { state: 'NO', from: null, to: null, note: gn ?? null };
  return {
    ok: true,
    value: {
      flat19,
      sme: sState === 'YES' ? { state: 'YES', rate: sr!, from: sf!, to: st ?? null, note: sn! } : { state: sState, rate: null, from: null, to: null, note: sn ?? null },
      durunuri: dState === 'YES' ? { state: 'YES', pensionRate: pr!, employmentRate: er!, from: df!, to: dt ?? null, note: dn! } : { state: dState, pensionRate: null, employmentRate: null, from: null, to: null, note: dn ?? null },
    },
  };
}

/**
 * 한 달 계산에 쓸 감면 · 지원을 정한다. 회사 설정에서 끈 것은 보지 않는다.
 * 켜져 있는데 그 직원이 「모름」이면 0원으로 넘어가지 않고 막는다(relief_unknown). 「예」라도 기간이 그 달에 걸치지 않으면 적용하지 않는다.
 */
export function reliefsForMonth(raw: unknown, on: { sme: boolean; durunuri: boolean }, from: string, last: string): { reliefs: { smeRate: number | null; durunuri: { pension: number; employment: number } | null; flat19: boolean }; blockers: { code: string; detail: string }[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Reliefs>;
  const sme = { ...UNKNOWN_RELIEFS.sme, ...(r.sme ?? {}) }, duru = { ...UNKNOWN_RELIEFS.durunuri, ...(r.durunuri ?? {}) };
  const blockers: { code: string; detail: string }[] = [];
  let smeRate: number | null = null;
  let durunuri: { pension: number; employment: number } | null = null;
  if (on.sme) {
    if (sme.state === 'UNKNOWN') blockers.push({ code: 'relief_unknown', detail: 'sme' });
    else if (sme.state === 'YES' && sme.rate && reliefCovers(sme, from, last)) smeRate = sme.rate;
  }
  if (on.durunuri) {
    if (duru.state === 'UNKNOWN') blockers.push({ code: 'relief_unknown', detail: 'durunuri' });
    else if (duru.state === 'YES' && reliefCovers(duru, from, last)) durunuri = { pension: duru.pensionRate ?? 0, employment: duru.employmentRate ?? 0 };
  }
  // 단일세율 19%는 회사 스위치와 상관없이 그 직원이 「예」이고 기간이 그 달에 걸치면 쓴다. 감면(중소기업)과 함께 쓰지 않는다 — 19%를 고르면 감면 · 공제가 없다
  const g = r.flat19;
  const flat19 = !!g && g.state === 'YES' && reliefCovers(g, from, last);
  if (flat19 && smeRate) { blockers.push({ code: 'flat19_with_sme', detail: 'sme' }); smeRate = null; }
  return { reliefs: { smeRate, durunuri, flat19 }, blockers };
}

export type ItemAssign = { itemCode: string; amount: number | null; note: string | null };
export function validateItemAssign(b: Record<string, unknown>): Result<ItemAssign> {
  const amount = num(b.amount), note = text(b.note, 300);
  if (typeof b.itemCode !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(b.itemCode)) return { ok: false, code: 'item_code' };
  if (amount === undefined || (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT)) || note === undefined) return { ok: false, code: 'item_amount' };
  return { ok: true, value: { itemCode: b.itemCode, amount, note } };
}

/** 급여 계산을 하려면 더 필요한 것. 비어 있으면 준비됨 */
export type SetupGap = 'no_contract' | 'no_monthly_hours' | 'no_annual_divisor' | 'no_tax' | 'insurance_unknown' | 'no_joined_on';
export function setupGaps(args: { contract: Pick<ContractInput, 'payType' | 'monthlyHours' | 'annualDivisor'> | null; tax: Pick<TaxInput, 'insurance'> | null; joinedOn: string | null }): SetupGap[] {
  const out: SetupGap[] = [];
  if (!args.contract) out.push('no_contract');
  else {
    if (args.contract.payType !== 'HOURLY' && args.contract.monthlyHours === null) out.push('no_monthly_hours'); // 시급을 낼 수 없어 연장 · 야간 · 휴일 수당을 계산하지 못한다
    if (args.contract.payType === 'ANNUAL' && args.contract.annualDivisor === null) out.push('no_annual_divisor');
  }
  if (!args.tax) out.push('no_tax');
  else if (INSURERS.some((k) => args.tax!.insurance[k].state === 'UNKNOWN')) out.push('insurance_unknown');
  if (!args.joinedOn) out.push('no_joined_on');
  return out;
}

/** 참고용 통상시급(원, 반올림) — 화면에 보여 주기만 한다. 급여 계산은 정밀 계산 모듈이 따로 한다 */
export function referenceHourly(c: Pick<ContractInput, 'payType' | 'amount' | 'monthlyHours' | 'annualDivisor'>): number | null {
  if (c.payType === 'HOURLY') return c.amount;
  if (c.monthlyHours === null) return null;
  if (c.payType === 'MONTHLY') return Math.round(c.amount / c.monthlyHours);
  return c.annualDivisor === null ? null : Math.round(c.amount / c.annualDivisor / c.monthlyHours);
}

/** 그 날 적용되는 판 (시작일 ≤ 그 날 < 끝나는 날) */
export function versionAt<T extends { validFrom: string; validTo: string | null }>(rows: readonly T[], date: string): T | null {
  return rows.find((r) => r.validFrom <= date && (r.validTo === null || date < r.validTo)) ?? null;
}
