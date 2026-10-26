// 급여 설정의 형식과 검사 — 순수 함수 (PRD v1.3 17장). DB · 화면과 떨어져 있어 단위 검사로 확인한다.
// 금액은 원 단위 정수, 비율은 소수 문자열, 날짜는 YYYY-MM-DD. 빈 칸(null)과 0은 다르다.

import { cleanTaxDefaults, type TaxDefaults } from './tax-defaults';
import { cleanCommonItems, type CommonItem } from './common-items';
export const SETTING_SECTIONS = ['employee-defaults', 'ledger', 'masking', 'working-time'] as const;
export type SettingSection = (typeof SETTING_SECTIONS)[number];
/** 회사 설정 › 급여의 9개 화면 (주소의 ?section=) */
export const PAY_SECTIONS = ['employee-defaults', 'ledger', 'payment-items', 'deduction-items', 'insurance-rates', 'income-tax', 'allowances', 'masking', 'working-time'] as const;
export type PaySection = (typeof PAY_SECTIONS)[number];

export type EmployeeDefaults = { payType: 'MONTHLY' | 'HOURLY' | 'ANNUAL' | null; durunuri: boolean; smeTaxCut: boolean; commonItems?: CommonItem[]; taxDefaults?: TaxDefaults };
export type Ledger = {
  payMonth: 'CURRENT' | 'NEXT';
  payDayMode: 'FIXED_DAY' | 'MONTH_END';
  payDay: number | null; // FIXED_DAY일 때 1~31
  holidayShift: 'KEEP' | 'PREV_BUSINESS_DAY' | 'NEXT_BUSINESS_DAY' | null; // 회사 확인 전에는 비워 둔다
  insuranceBasis: 'NOTICE' | 'PAYROLL_BASE' | 'REPORTED_BASE';
  insuranceBasisOf?: Partial<Record<InsurerKey, 'NOTICE' | 'PAYROLL_BASE' | 'REPORTED_BASE'>>; // 보험마다 따로 고른 기준 (2026-10-20). 없는 보험은 insuranceBasis를 따른다
  withholdingRatio: 80 | 100 | 120;
  deductUnpaidLeave?: boolean;
  deductLateness?: boolean;
  premiumTimeBasis?: 'ACTUAL' | 'ROUNDED';
};
export const INSURER_KEYS = ['pension', 'health', 'employment'] as const;
export type InsurerKey = (typeof INSURER_KEYS)[number];
export type Masking = { enabled?: boolean; unmaskMinutes: number }; // enabled 없으면 켜짐(가림) — 2026-10-22 켜고 끌 수 있게
export type WorkingTime = { weeklyHours: number; weeklyOvertimeLimit: number; monthlyHours: number | null };
export type SettingPayload = EmployeeDefaults | Ledger | Masking | WorkingTime;

type Result<T> = { ok: true; value: T } | { ok: false; code: 'invalid_input' };
const bad = { ok: false, code: 'invalid_input' } as const;
const one = <T extends string | number>(v: unknown, list: readonly T[]): T | undefined => list.find((x) => x === v);
const int = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

export function validateSetting(section: SettingSection, b: Record<string, unknown>): Result<SettingPayload> {
  if (section === 'employee-defaults') {
    const payType = b.payType === undefined || b.payType === null || b.payType === '' ? null : one(b.payType, ['MONTHLY', 'HOURLY', 'ANNUAL'] as const);
    // 두루누리 칸은 화면에서 뺐다(2026-10-22) — 오지 않으면 꺼짐으로 남긴다
    if (payType === undefined || (b.durunuri !== undefined && typeof b.durunuri !== 'boolean') || typeof b.smeTaxCut !== 'boolean') return bad;
    const commonItems = cleanCommonItems(b.commonItems); // 회사 공통 고정 수당 · 공제 (2026-10-25)
    if (!commonItems) return bad;
    const taxDefaults = cleanTaxDefaults(b.taxDefaults); // 4대보험 · 세무 회사 기본값 (2026-10-25)
    if (taxDefaults === undefined) return bad;
    return { ok: true, value: { payType, durunuri: false, smeTaxCut: b.smeTaxCut, ...(commonItems.length ? { commonItems } : {}), ...(taxDefaults ? { taxDefaults } : {}) } };
  }
  if (section === 'ledger') {
    const payMonth = one(b.payMonth, ['CURRENT', 'NEXT'] as const);
    const payDayMode = one(b.payDayMode, ['FIXED_DAY', 'MONTH_END'] as const);
    const insuranceBasis = one(b.insuranceBasis, ['NOTICE', 'PAYROLL_BASE', 'REPORTED_BASE'] as const);
    const withholdingRatio = one(Number(b.withholdingRatio), [80, 100, 120] as const);
    const holidayShift = b.holidayShift === null || b.holidayShift === '' ? null : one(b.holidayShift, ['KEEP', 'PREV_BUSINESS_DAY', 'NEXT_BUSINESS_DAY'] as const);
    if (!payMonth || !payDayMode || !insuranceBasis || !withholdingRatio || holidayShift === undefined) return bad;
    const payDay = payDayMode === 'FIXED_DAY' ? int(b.payDay, 1, 31) : null;
    if (payDay === undefined) return bad;
    const deductUnpaidLeave = b.deductUnpaidLeave ?? false;
    const deductLateness = b.deductLateness ?? false;
    const premiumTimeBasis = b.premiumTimeBasis ?? 'ACTUAL';
    if (typeof deductUnpaidLeave !== 'boolean' || typeof deductLateness !== 'boolean' || !one(premiumTimeBasis, ['ACTUAL', 'ROUNDED'])) return bad;
    // 보험마다 따로: 빈 칸은 「기본 기준과 같게」 — 저장하지 않는다. 기본과 같은 값도 저장하지 않는다
    const each = b.insuranceBasisOf ?? {};
    if (typeof each !== 'object' || each === null || Array.isArray(each)) return bad;
    const insuranceBasisOf: Partial<Record<InsurerKey, Ledger['insuranceBasis']>> = {};
    for (const [k, v] of Object.entries(each as Record<string, unknown>)) {
      if (!(INSURER_KEYS as readonly string[]).includes(k)) return bad;
      if (v === null || v === '' || v === undefined) continue;
      const picked = one(v, ['NOTICE', 'PAYROLL_BASE', 'REPORTED_BASE'] as const);
      if (!picked) return bad;
      if (picked !== insuranceBasis) insuranceBasisOf[k as InsurerKey] = picked;
    }
    return { ok: true, value: { payMonth, payDayMode, payDay, holidayShift, insuranceBasis, ...(Object.keys(insuranceBasisOf).length ? { insuranceBasisOf } : {}), withholdingRatio, deductUnpaidLeave, deductLateness, premiumTimeBasis: premiumTimeBasis as 'ACTUAL' | 'ROUNDED' } };
  }
  if (section === 'masking') {
    const unmaskMinutes = int(b.unmaskMinutes, 1, 60);
    const enabled = b.enabled ?? true;
    if (typeof enabled !== 'boolean') return bad;
    return unmaskMinutes === undefined ? bad : { ok: true, value: { enabled, unmaskMinutes } };
  }
  const weeklyHours = int(b.weeklyHours, 1, 52);
  const weeklyOvertimeLimit = int(b.weeklyOvertimeLimit, 0, 40);
  const monthlyHours = b.monthlyHours === null || b.monthlyHours === '' ? null : int(b.monthlyHours, 1, 400);
  if (weeklyHours === undefined || weeklyOvertimeLimit === undefined || monthlyHours === undefined) return bad;
  return { ok: true, value: { weeklyHours, weeklyOvertimeLimit, monthlyHours } };
}

/**
 * 급여대장의 처음 값 (2026-10-13 의뢰인: 일단 지정해 두고 화면에서 바꾼다) — 「임시」로 들어간다.
 * 당월 · 말일 지급, 휴일 처리는 정하지 않음, 공제는 요율로 계산(월 과세합계 기준 — 공단 고지 자료 없이도 계산이 된다), 원천징수 100%.
 */
export const DEFAULT_LEDGER: Ledger = { payMonth: 'CURRENT', payDayMode: 'MONTH_END', payDay: null, holidayShift: null, insuranceBasis: 'PAYROLL_BASE', withholdingRatio: 100, deductUnpaidLeave: false, deductLateness: false, premiumTimeBasis: 'ACTUAL' };

export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const cleanText = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length <= max ? s || null : undefined;
};

/**
 * 귀속월 → 지급 예정일 (S02의 한 줄 예시). 고정일이 그 달에 없으면 말일.
 * 휴일 이동은 여기서 하지 않는다 — 영업일 규칙이 정해지기 전이라 달력 날짜만 돌려준다.
 */
export function payDateFor(ym: string, l: Pick<Ledger, 'payMonth' | 'payDayMode' | 'payDay'>): string {
  const [y, m] = ym.split('-').map(Number);
  const month = l.payMonth === 'NEXT' ? m + 1 : m; // Date.UTC가 13월을 다음 해 1월로 넘긴다
  const last = new Date(Date.UTC(y, month, 0)).getUTCDate();
  const day = l.payDayMode === 'MONTH_END' ? last : Math.min(l.payDay ?? last, last);
  return new Date(Date.UTC(y, month - 1, day)).toISOString().slice(0, 10);
}

// ── 지급 · 공제 항목 ──
export const CALC_KINDS = ['FIXED', 'MANUAL', 'TIME', 'RULE', 'NOTICE'] as const;
export const TAX_TREATMENTS = ['TAXABLE', 'EXEMPT', 'PARTIAL', 'NOT_APPLICABLE'] as const;
export const ORDINARY = ['INCLUDED', 'EXCLUDED', 'UNKNOWN'] as const;
export const AVERAGE_KINDS = ['MONTHLY', 'BONUS', 'EXCLUDED'] as const; // 퇴직금 평균임금에서: 월 임금 / 연 상여 / 뺌 (묶음 36, 2026-10-26). 비어 있으면 아직 안 정함
export type ItemInput = {
  code: string; kind: 'PAYMENT' | 'DEDUCTION'; koName: string; enName: string; calcKind: (typeof CALC_KINDS)[number];
  defaultAmount: number | null; fixedAllowance: boolean; taxTreatment: (typeof TAX_TREATMENTS)[number]; taxExemptLimit: number | null;
  taxExemptAnnualLimit?: number | null; // 연간 비과세 한도(원) — 묶음 28 (2026-10-19). 없으면 연간 한도 없음
  ordinaryWage: (typeof ORDINARY)[number]; sort: number;
  averageWageKind?: (typeof AVERAGE_KINDS)[number] | null; // 지급 항목만. 없으면 null(정하지 않음)
};
const won = (v: unknown): number | null | undefined => {
  if (v === null || v === undefined || v === '') return null;
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.replace(/,/g, '').trim() : '';
  return /^\d{1,12}$/.test(s) ? Number(s) : undefined;
};

export function validateItem(b: Record<string, unknown>): Result<ItemInput> {
  const code = typeof b.code === 'string' && /^[A-Za-z0-9_]{2,40}$/.test(b.code) ? b.code.toUpperCase() : null;
  const kind = one(b.kind, ['PAYMENT', 'DEDUCTION'] as const);
  const koName = cleanText(b.koName, 60);
  const enName = cleanText(b.enName, 60);
  const calcKind = one(b.calcKind, CALC_KINDS);
  const defaultAmount = won(b.defaultAmount);
  const taxExemptLimit = won(b.taxExemptLimit);
  const taxExemptAnnualLimit = won(b.taxExemptAnnualLimit);
  const ordinaryWage = one(b.ordinaryWage ?? 'UNKNOWN', ORDINARY);
  const averageRaw = b.averageWageKind === undefined || b.averageWageKind === null || b.averageWageKind === '' ? null : one(b.averageWageKind, AVERAGE_KINDS);
  if (averageRaw === undefined) return bad;
  const averageWageKind = kind === 'DEDUCTION' ? null : averageRaw;
  // 공제 항목에는 과세 구분이 없다. 지급 항목은 꼭 골라야 한다
  const taxTreatment = kind === 'DEDUCTION' ? 'NOT_APPLICABLE' : one(b.taxTreatment, ['TAXABLE', 'EXEMPT', 'PARTIAL'] as const);
  const sort = b.sort === undefined || b.sort === '' ? 0 : int(b.sort, 0, 9999);
  if (!code || !kind || !koName || !enName || !calcKind || defaultAmount === undefined || taxExemptLimit === undefined || taxExemptAnnualLimit === undefined || !ordinaryWage || !taxTreatment || sort === undefined) return bad;
  if (taxTreatment !== 'PARTIAL' && taxTreatment !== 'EXEMPT' && (taxExemptLimit !== null || taxExemptAnnualLimit !== null)) return bad; // 한도는 비과세 · 일부 비과세에만
  return { ok: true, value: { code, kind, koName, enName, calcKind, defaultAmount, fixedAllowance: b.fixedAllowance === true, taxTreatment, taxExemptLimit, taxExemptAnnualLimit, ordinaryWage, averageWageKind, sort } };
}

/**
 * 통상 쓰는 기본 항목 (2026-10-13 의뢰인: 통상 방식으로 먼저 넣고 검증은 경영지원실에서 — 전부 「임시」로 들어간다).
 * 통상임금: 기본급과 고정수당은 포함, 나머지는 제외로 임시 표시. 금액은 넣지 않는다(직원 계약에서 정한다).
 */
export const STANDARD_ITEMS: ItemInput[] = [
  { code: 'BASE_PAY', kind: 'PAYMENT', koName: '기본급', enName: 'Base pay', calcKind: 'FIXED', taxTreatment: 'TAXABLE', ordinaryWage: 'INCLUDED', fixedAllowance: false },
  { code: 'OVERTIME_PAY', kind: 'PAYMENT', koName: '연장근로수당', enName: 'Overtime pay', calcKind: 'TIME', taxTreatment: 'TAXABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'NIGHT_PAY', kind: 'PAYMENT', koName: '야간근로수당', enName: 'Night work pay', calcKind: 'TIME', taxTreatment: 'TAXABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'HOLIDAY_PAY', kind: 'PAYMENT', koName: '휴일근로수당', enName: 'Holiday work pay', calcKind: 'TIME', taxTreatment: 'TAXABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'ANNUAL_LEAVE_PAY', kind: 'PAYMENT', koName: '연차수당', enName: 'Unused annual leave pay', calcKind: 'RULE', taxTreatment: 'TAXABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'BONUS', kind: 'PAYMENT', koName: '상여금', enName: 'Bonus', calcKind: 'MANUAL', taxTreatment: 'TAXABLE', ordinaryWage: 'UNKNOWN', fixedAllowance: false },
  { code: 'MEAL_ALLOWANCE', kind: 'PAYMENT', koName: '식대', enName: 'Meal allowance', calcKind: 'FIXED', taxTreatment: 'PARTIAL', ordinaryWage: 'INCLUDED', fixedAllowance: true, taxExemptLimit: 200000 },
  // 자주 쓰는 비과세 (2026-10-22 의뢰인 ④) — 한도는 소득세법 시행령 기준 임시 값(검증 대기 기록). 조건(본인 차량 · 6세 이하 자녀)은 담당자가 확인하고 직원 계약에 넣는다
  { code: 'CAR_ALLOWANCE', kind: 'PAYMENT', koName: '자가운전보조금', enName: 'Own-car allowance', calcKind: 'FIXED', taxTreatment: 'PARTIAL', ordinaryWage: 'UNKNOWN', fixedAllowance: true, taxExemptLimit: 200000 },
  { code: 'CHILDCARE_ALLOWANCE', kind: 'PAYMENT', koName: '출산·보육수당', enName: 'Childbirth & childcare allowance', calcKind: 'FIXED', taxTreatment: 'PARTIAL', ordinaryWage: 'UNKNOWN', fixedAllowance: true, taxExemptLimit: 200000 },
  { code: 'ABSENCE_CUT', kind: 'PAYMENT', koName: '결근차감', enName: 'Absence deduction', calcKind: 'MANUAL', taxTreatment: 'TAXABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'INCOME_TAX', kind: 'DEDUCTION', koName: '근로소득세', enName: 'Income tax', calcKind: 'RULE', taxTreatment: 'NOT_APPLICABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'LOCAL_INCOME_TAX', kind: 'DEDUCTION', koName: '근로지방소득세', enName: 'Local income tax', calcKind: 'RULE', taxTreatment: 'NOT_APPLICABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'NATIONAL_PENSION', kind: 'DEDUCTION', koName: '국민연금', enName: 'National pension', calcKind: 'RULE', taxTreatment: 'NOT_APPLICABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'HEALTH_INSURANCE', kind: 'DEDUCTION', koName: '건강보험', enName: 'Health insurance', calcKind: 'RULE', taxTreatment: 'NOT_APPLICABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'LONG_TERM_CARE', kind: 'DEDUCTION', koName: '장기요양보험', enName: 'Long-term care insurance', calcKind: 'RULE', taxTreatment: 'NOT_APPLICABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'EMPLOYMENT_INSURANCE', kind: 'DEDUCTION', koName: '고용보험', enName: 'Employment insurance', calcKind: 'RULE', taxTreatment: 'NOT_APPLICABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'STUDENT_LOAN', kind: 'DEDUCTION', koName: '학자금상환', enName: 'Student loan repayment', calcKind: 'MANUAL', taxTreatment: 'NOT_APPLICABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
  { code: 'YEAR_END_TAX', kind: 'DEDUCTION', koName: '연말정산소득세', enName: 'Year-end tax settlement', calcKind: 'MANUAL', taxTreatment: 'NOT_APPLICABLE', ordinaryWage: 'EXCLUDED', fixedAllowance: false },
].map((x, i) => ({ ...x, defaultAmount: null, taxExemptLimit: ('taxExemptLimit' in x ? x.taxExemptLimit : null) ?? null, sort: (i + 1) * 10 }) as ItemInput);

// ── 회사 정책 (법정수당의 회사 기준 · 연차 산정) ──
export const ALLOWANCE_KINDS = ['overtime', 'night', 'holiday', 'annual-leave', 'menstrual', 'maternity', 'shutdown'] as const;
export type AllowanceKind = (typeof ALLOWANCE_KINDS)[number];
/** 가산율은 "추가로 얹는 비율"이다 (기본임금 100%는 따로). 예: 0.5 = 50% 가산 */
export type AllowancePolicy = { premium: string | null; premiumOver8h: string | null; note: string | null };
export type AnnualLeavePolicy = { basis: 'hire_date' | 'fiscal_year'; firstYearMonthly: number; firstYearMax: number; baseDays: number; extraEveryYears: number; extraFromYear: number; maxDays: number; minAttendance: string };

const ratio = (v: unknown): string | null | undefined => {
  if (v === null || v === undefined || v === '') return null;
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  return /^\d(\.\d{1,4})?$/.test(s) && Number(s) <= 3 ? s : undefined;
};

export function validateAllowance(b: Record<string, unknown>): Result<AllowancePolicy> {
  const premium = ratio(b.premium);
  const premiumOver8h = ratio(b.premiumOver8h);
  const note = cleanText(b.note, 300);
  if (premium === undefined || premiumOver8h === undefined || note === undefined) return bad;
  return { ok: true, value: { premium, premiumOver8h, note } };
}

/**
 * 통상 쓰는 기준 (전부 「임시」로 들어간다 — `검증 대기 기록.md`).
 * 휴일근로는 8시간 이내 50%, 초과분 100% 가산(공식 상담 안내). 다우오피스 화면처럼 전부 50%로 두지 않는다.
 */
export const STANDARD_ALLOWANCES: Record<AllowanceKind, AllowancePolicy> = {
  overtime: { premium: '0.5', premiumOver8h: null, note: null },
  night: { premium: '0.5', premiumOver8h: null, note: null },
  holiday: { premium: '0.5', premiumOver8h: '1', note: null },
  'annual-leave': { premium: null, premiumOver8h: null, note: null },
  menstrual: { premium: null, premiumOver8h: null, note: null },
  maternity: { premium: null, premiumOver8h: null, note: null },
  shutdown: { premium: '0.7', premiumOver8h: null, note: null },
};
/** 연차 산정의 통상 방식 — 입사일 기준 (2026-10-13 의뢰인: 통상 방식으로) */
export const STANDARD_ANNUAL_LEAVE: AnnualLeavePolicy = { basis: 'hire_date', firstYearMonthly: 1, firstYearMax: 11, baseDays: 15, extraEveryYears: 2, extraFromYear: 3, maxDays: 25, minAttendance: '0.8' };
