// 급여 계산 모듈 (PRD v1.3 7.3 · 20장). 순수 계산 — DB · 화면 · 파일을 모른다. 화면 · 명세서 · 엑셀이 각자 금액식을 갖지 않고 전부 이 결과를 쓴다.
// 순서: 계약 확인 → 지급 항목 → (지급 조정) → 과세 · 보험 기준 → 보험 공제 → 소득세 · 지방소득세 → 그 밖의 공제 → (공제 조정) → 합계 검산.
// ★ 요율 · 세액 · 가산율 숫자는 이 파일에 없다. 전부 입력(기준 자료 · 회사 정책)으로 받는다.
// ★ 추정하지 않는다. 필요한 값이 없으면 0으로 채우지 않고 「차단」으로 돌려준다 — 차단된 직원은 금액이 없다(0원과 다르다).
// ★ 끝수는 항목마다 한 번, 정한 방식으로 끊는다(먼저 단가를 잘라 놓고 곱하지 않는다).
import { AUTO_PAYMENT_CODES, canonicalItemCode } from './reserved-items';
import { add, dec, div, hoursOf, isNeg, max, min, mul, sub, text, toWon, type Dec, type Rounding } from './decimal';

export const ENGINE_VERSION = 'engine-1.5'; // 1.5 (2026-10-20): 일부 비과세(식대 등)의 비과세분을 보험 기준에서 뺌 · 건강보험 월 보험료 상한 · 하한. 1.4 (2026-10-20): 보험마다 공제 기준을 따로(국민연금 · 건강 · 고용, 비우면 기본 기준). 1.3 (2026-10-19): 비과세 연간 한도 · 누적. 1.2 (2026-10-16): 시급제 주휴 · 유급휴일, 시급제 기본급은 소정 시간만 + 연장 · 휴일 줄에 1배 포함

export type EngineContract = { payType: 'MONTHLY' | 'HOURLY' | 'ANNUAL'; amount: number; monthlyHours: number | null; annualDivisor: number | null; included: { overtimeHours: number | null; holidayHours: number | null } };
export type Tri = 'YES' | 'NO' | 'UNKNOWN';
export type EngineTax = {
  withholdingRatio: 80 | 100 | 120;
  familyCount: number;
  childCount: number;
  insurance: Record<'pension' | 'health' | 'employment' | 'accident', { state: Tri; reportedWage: number | null }>;
  studentLoan: { state: Tri; monthlyAmount: number | null };
  /** 그 달에 적용하는 감면 · 지원(넘겨주는 쪽이 회사 설정 · 기간을 보고 정한다). 없으면 적용 안 함 */
  reliefs?: { smeRate: number | null; durunuri: { pension: number; employment: number } | null };
};
/** 한 가지 시간 축에서 나눈 분(分). 실제 시간에서 구한 연장과 끊은 총시간을 섞지 않는다 — 넘겨주는 쪽이 한 축으로 맞춰서 준다 */
export type EngineTime = {
  workedMinutes: number; overtimeMinutes: number; nightMinutes: number; holidayMinutes: number; holidayOver8Minutes: number; paidLeaveMinutes: number; unpaidLeaveMinutes?: number; lateMinutes?: number;
  weeklyRestMinutes?: number; paidHolidayMinutes?: number; // 시급제의 주휴 · 유급휴일 시간 (weekly-rest.ts) — 월급 · 연봉제는 쓰지 않는다
  workDays?: number; // 일한 날 수 — 명세서의 근로일수 (계산에는 쓰지 않는다)
};
// exemptAnnualLimit: 그 해 비과세로 뺄 수 있는 합계(예: 생산직 연장근로수당 240만원). 없으면 연간 한도 없음 (2026-10-19)
export type EngineItem = { code: string; kind: 'PAYMENT' | 'DEDUCTION'; label: string; amount: number; taxable: 'TAXABLE' | 'EXEMPT' | 'PARTIAL'; exemptLimit: number | null; exemptAnnualLimit?: number | null; insurable: boolean; itemVersionId?: string | null; ordinaryWage?: 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN' };
export type EnginePolicy = {
  deductUnpaidLeave?: boolean;
  deductLateness?: boolean;
  overtimePremium: string | null; // 연장의 추가 가산 (예: "0.5")
  nightPremium: string | null;
  holidayPremium: string | null;
  holidayOver8Premium: string | null;
  rounding: { pay: Rounding; insurance: Rounding };
};
export type InsuranceRef = { employeeRate: string; employerRate: string; floor: number | null; ceiling: number | null; baseUnit: number | null; premiumFloor?: number | null; premiumCeiling?: number | null }; // 기준액의 하한 · 상한, 기준액을 끊는 단위(예: 1000). premium* = 한쪽(근로자 · 사업주 각각) 월 보험료의 하한 · 상한(건강보험 고시)
export type EngineReference = { pension: InsuranceRef | null; health: InsuranceRef | null; ltcOfHealth: string | null; employment: InsuranceRef | null; accidentEmployerRate: string | null };
export type Withholding = (a: { taxable: number; family: number; children: number; ratio: number }) => { ok: true; incomeTax: number; localTax: number; trace?: Record<string, unknown> } | { ok: false; why: string };
export type EngineOverride = { itemCode: string; kind: 'PAYMENT' | 'DEDUCTION'; amount: number; label?: string; id?: string };
export type EngineInput = {
  runKind: 'REGULAR' | 'BONUS';
  contract: EngineContract | null;
  tax: EngineTax | null;
  time: EngineTime | null; // 근태 마감에서 온 시간. 없으면 시간으로 계산하는 항목을 만들지 못한다
  partialMonth: boolean; // 귀속 기간 중간에 입사 · 퇴사 — 일할 계산 정책이 없으면 자동으로 나누지 않는다
  items: EngineItem[];
  policy: EnginePolicy;
  reference: EngineReference;
  insuranceBasis: 'PAYROLL_BASE' | 'REPORTED' | 'NOTICE'; // 그 달 급여 기준 / 신고 보수 / 고지 보험료 — 기본값. 산재(사업주)는 이 기준을 따른다
  insuranceBasisOf?: Partial<Record<'pension' | 'health' | 'employment', 'PAYROLL_BASE' | 'REPORTED' | 'NOTICE'>>; // 보험마다 따로 고른 기준 (2026-10-20 — 예: 연금 · 건강은 신고 보수, 고용은 그 달 급여). 없으면 기본값
  withholding: Withholding | null;
  overrides: EngineOverride[];
  notices?: Partial<Record<'pension' | 'health' | 'employment' | 'accident', { employee: number; employer: number | null; id: string }>>;
  prior?: { taxable: number; incomeTax: number; localTax: number } | null; // 상여: 같은 징수 묶음에서 앞서 낸 명세의 과세 합계와 세액
  skipInsurance?: boolean; // 상여 대장: 4대보험을 여기서 계산하지 않는다(정기 급여에서 이미 냈거나 정산으로 맞춘다) — 경고로 알린다
  exemptYtd?: Record<string, number>; // 같은 해(귀속 연도) 앞서 확정한 명세에서 항목마다 이미 비과세로 뺀 합계 — 연간 한도 계산에 쓴다 (2026-10-19)
  minimumHourly?: number | null; // 그 달에 적용되는 최저시급(승인된 기준 자료). 계약의 시간당 임금이 이보다 낮으면 「참고」로 알린다(막지 않는다)
};

export type LineKind = 'PAYMENT' | 'DEDUCTION' | 'EMPLOYER';
export type Line = { code: string; kind: LineKind; label: string; quantity: string | null; unitPrice: string | null; factor: string | null; rawValue: string | null; amount: number; source: 'AUTO' | 'MANUAL' | 'OVERRIDE'; trace: Record<string, unknown>; itemVersionId?: string | null; overrideId?: string | null };
export type Blocker = { code: string; detail?: string };
export type EngineResult =
  | { state: 'OK'; lines: Line[]; totals: { pay: number; deduction: number; net: number; employer: number; taxable: number; insuranceBase: number }; blockers: []; warnings: Blocker[]; engineVersion: string }
  | { state: 'BLOCKED'; lines: []; totals: null; blockers: Blocker[]; warnings: Blocker[]; engineVersion: string };

const won = (v: bigint): number => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error('engine: amount out of range');
  return n;
};
const sum = (lines: Line[], kind: LineKind) => lines.filter((l) => l.kind === kind).reduce((a, l) => a + l.amount, 0);

export function calculateStatement(input: EngineInput): EngineResult {
  input = { ...input, overrides: input.overrides.map((o) => ({ ...o, itemCode: canonicalItemCode(o.itemCode) })) };
  const blockers: Blocker[] = [];
  const block = (code: string, detail?: string) => {
    if (!blockers.some((b) => b.code === code && b.detail === detail)) blockers.push({ code, detail });
  };
  for (const o of input.overrides) if (input.overrides.filter((x) => x.kind === o.kind && x.itemCode === o.itemCode).length > 1) block('duplicate_item', o.itemCode);
  const warnings: Blocker[] = []; // 계산은 되지만 담당자가 알아야 하는 것 (직원 실지급에는 영향이 없는 빠진 자료 등)
  const lines: Line[] = [];
  const { contract: c, tax, time, policy, reference: ref } = input;
  const payRound = policy.rounding.pay;
  const overridden = (code: string, kind: 'PAYMENT' | 'DEDUCTION') => input.overrides.find((o) => o.itemCode === code && o.kind === kind);
  /** 계산한 값을 한 줄로. 조정이 있으면 조정 금액을 쓰고 원래 값은 근거에 남긴다 */
  const push = (l: { code: string; kind: LineKind; label: string; raw: Dec; rounding: Rounding; quantity?: Dec; unitPrice?: Dec; factor?: Dec; trace?: Record<string, unknown>; itemVersionId?: string | null }) => {
    const auto = won(toWon(l.raw, l.rounding));
    const o = l.kind === 'EMPLOYER' ? undefined : overridden(l.code, l.kind);
    lines.push({
      code: l.code, kind: l.kind, label: l.label, quantity: l.quantity === undefined ? null : text(l.quantity), unitPrice: l.unitPrice === undefined ? null : text(l.unitPrice), factor: l.factor === undefined ? null : text(l.factor), rawValue: text(l.raw),
      amount: o ? o.amount : auto, source: o ? 'OVERRIDE' : 'AUTO', trace: { ...l.trace, rounding: l.rounding, ...(o ? { autoAmount: auto } : {}) }, itemVersionId: l.itemVersionId ?? null, overrideId: o?.id ?? null,
    });
  };

  // ── 1. 계약 ──
  const regular = input.runKind === 'REGULAR'; // 상여 대장은 기본급 · 시간 수당을 만들지 않는다(직접 넣은 지급만)
  if (!c && regular) block('no_contract');
  if (!tax) block('no_tax');
  let hourly: Dec | null = null; // 시간당 임금 — 끝수를 끊지 않은 값
  if (c) {
    if (c.payType === 'HOURLY') hourly = dec(c.amount);
    else if (c.monthlyHours !== null && (c.payType === 'MONTHLY' || c.annualDivisor !== null)) {
      const monthly = c.payType === 'MONTHLY' ? dec(c.amount) : div(dec(c.amount), dec(String(c.annualDivisor)));
      hourly = div(monthly, dec(String(c.monthlyHours)));
    }
  }
  const contractHourly = hourly;
  // 통상임금 포함 여부는 저장된 항목 설정을 따른다. 지급할 때와 같은 조정 금액을 쓴다.
  const ordinaryItems = input.items.filter((i) => i.kind === 'PAYMENT' && !AUTO_PAYMENT_CODES.has(i.code));
  const ordinaryExtra = ordinaryItems.filter((i) => i.ordinaryWage === 'INCLUDED').reduce((a, i) => add(a, dec(overridden(i.code, 'PAYMENT')?.amount ?? i.amount)), dec(0));
  const needsPremium = !!time && time.overtimeMinutes + time.nightMinutes + time.holidayMinutes > 0;
  if (regular && needsPremium && ordinaryItems.some((i) => i.ordinaryWage === 'UNKNOWN')) block('ordinary_wage_unknown');
  if (Number(text(ordinaryExtra)) !== 0) {
    if (!c?.monthlyHours) { if (needsPremium) block('no_monthly_hours', 'ordinary'); }
    else if (hourly !== null) hourly = add(hourly, div(ordinaryExtra, dec(c.monthlyHours)));
  }
  // 최저임금 참고 (2026-10-14): 계약의 시간당 임금(시급 · 월급 ÷ 월 환산 시간)이 최저시급보다 낮으면 알린다.
  // 실제 최저임금 판단은 산입 범위(고정 수당 · 상여 등)를 따져야 해서 여기서 막지 않는다 — 담당자가 확인할 신호다
  if (hourly !== null && input.minimumHourly && Number(text(hourly)) < input.minimumHourly) warnings.push({ code: 'below_minimum_wage', detail: `${Math.floor(Number(text(hourly))).toLocaleString('en-US')} < ${input.minimumHourly.toLocaleString('en-US')}` });
  const needHourly = (what: string): Dec | null => {
    if (hourly === null && c) block(c.payType === 'ANNUAL' && c.annualDivisor === null ? 'no_annual_divisor' : 'no_monthly_hours', what);
    return hourly;
  };

  // ── 2. 지급 항목 ──
  if (c && regular) {
    if (c.payType === 'HOURLY') {
      if (!time) block('no_attendance');
      else {
        // 기본급은 소정 근로(정규) 시간만 — 연장 · 휴일 시간은 그 줄에서 1배를 포함해 1.5배로 준다(회사 대장 모양, 2026-10-16). 금액은 예전(기본에 1배 + 가산 0.5)과 같다
        const regularMinutes = Math.max(0, time.workedMinutes - time.overtimeMinutes - time.holidayMinutes);
        push({ code: 'BASE', kind: 'PAYMENT', label: 'base', raw: mul(hoursOf(regularMinutes), contractHourly!), rounding: payRound, quantity: hoursOf(regularMinutes), unitPrice: contractHourly!, trace: { minutes: regularMinutes, workedMinutes: time.workedMinutes, payType: c.payType } });
        // 시급제의 유급휴가: 일한 시간에 더해 지급한다(월급제는 기본급에 이미 들어 있어 더하지 않는다)
        if (time.paidLeaveMinutes > 0) push({ code: 'PAID_LEAVE', kind: 'PAYMENT', label: 'paidLeave', raw: mul(hoursOf(time.paidLeaveMinutes), contractHourly!), rounding: payRound, quantity: hoursOf(time.paidLeaveMinutes), unitPrice: contractHourly!, trace: { minutes: time.paidLeaveMinutes } });
        // 주휴 · 유급휴일 (대장의 「주차」 · 「유휴」): 시간 × 시급. 통상임금에 넣는 수당이 있으면 그 시급(통상시급)으로
        for (const [code, label, minutes] of [['WEEKLY_REST', 'weeklyRest', time.weeklyRestMinutes ?? 0], ['PAID_HOLIDAY', 'paidHoliday', time.paidHolidayMinutes ?? 0]] as const) {
          if (minutes <= 0) continue;
          const rate = overridden(code, 'PAYMENT') ? contractHourly! : needHourly(code);
          if (rate === null) continue;
          push({ code, kind: 'PAYMENT', label, raw: mul(hoursOf(minutes), rate), rounding: payRound, quantity: hoursOf(minutes), unitPrice: rate, trace: { minutes } });
        }
      }
    } else {
      if (input.partialMonth && !overridden('BASE', 'PAYMENT')) block('proration_policy'); // 중간 입사 · 퇴사의 일할 계산은 자동으로 추정하지 않는다
      if (c.payType === 'ANNUAL' && c.annualDivisor === null) block('no_annual_divisor');
      else push({ code: 'BASE', kind: 'PAYMENT', label: 'base', raw: c.payType === 'MONTHLY' ? dec(c.amount) : div(dec(c.amount), dec(String(c.annualDivisor))), rounding: payRound, trace: { payType: c.payType, contractAmount: c.amount, annualDivisor: c.annualDivisor } });
    }
    // 연장 · 야간 · 휴일: 기본 1 + 가산분 (시급제도 기본급에 연장 · 휴일 시간을 넣지 않으므로 1배를 여기서 준다 — 2026-10-16). 야간은 겹치는 가산분만
    // ⚠️ 시급제 연장 · 휴일 줄을 「조정」으로 바꿀 때는 1배까지 포함한 금액을 넣는다
    const baseFactor = dec(1);
    const premiumLine = (code: string, label: string, minutes: number, premium: string | null, includedHours: number | null, withBase: boolean) => {
      if (minutes <= 0) return;
      if (overridden(code, 'PAYMENT')) {
        // 조정으로 금액을 정한 항목은 계산에 필요한 값이 없어도 막지 않는다
        push({ code, kind: 'PAYMENT', label, raw: dec(0), rounding: payRound, quantity: hoursOf(minutes), trace: { minutes, manual: true } });
        return;
      }
      if (premium === null) return block('policy_missing', code);
      const rate = needHourly(code);
      if (rate === null) return;
      let payMinutes = minutes;
      if (includedHours !== null && includedHours > 0) {
        // 계약 금액에 이미 들어 있는 시간까지는 더 주지 않는다. 넘는 시간의 처리는 회사 정책이 정해지기 전에는 자동으로 계산하지 않는다
        if (minutes > Math.round(includedHours * 60)) return block('included_hours_exceeded', code);
        payMinutes = 0;
      }
      if (payMinutes === 0) return;
      const factor = add(withBase ? baseFactor : dec(0), dec(premium));
      push({ code, kind: 'PAYMENT', label, raw: mul(mul(hoursOf(payMinutes), rate), factor), rounding: payRound, quantity: hoursOf(payMinutes), unitPrice: rate, factor, trace: { minutes: payMinutes, premium, includesBase: withBase } });
    };
    if (time) {
      premiumLine('OVERTIME', 'overtime', time.overtimeMinutes, policy.overtimePremium, c.included.overtimeHours, true);
      premiumLine('NIGHT', 'night', time.nightMinutes, policy.nightPremium, null, false); // 야간은 겹치는 가산만 따로
      const within8 = time.holidayMinutes - time.holidayOver8Minutes;
      premiumLine('HOLIDAY', 'holiday', within8, policy.holidayPremium, c.included.holidayHours, true);
      if (time.holidayOver8Minutes > 0) {
        if (c.included.holidayHours) block('included_hours_exceeded', 'HOLIDAY_OVER8');
        else premiumLine('HOLIDAY_OVER8', 'holidayOver8', time.holidayOver8Minutes, policy.holidayOver8Premium, null, true);
      }
    } else if (c.payType !== 'HOURLY') block('no_attendance'); // 월급제도 연장 · 휴일이 있었는지 알아야 한다
  }
  if (regular && c && c.payType !== 'HOURLY' && time) {
    for (const [code, label, minutes, enabled] of [
      ['UNPAID_LEAVE_CUT', 'unpaidLeaveCut', time.unpaidLeaveMinutes ?? 0, policy.deductUnpaidLeave],
      ['LATENESS_CUT', 'latenessCut', time.lateMinutes ?? 0, policy.deductLateness],
    ] as const) {
      if (!enabled || minutes <= 0) continue;
      if (contractHourly === null) { block('no_monthly_hours', code); continue; }
      push({ code, kind: 'PAYMENT', label, raw: sub(dec(0), mul(hoursOf(minutes), contractHourly)), rounding: payRound, quantity: hoursOf(minutes), unitPrice: contractHourly, trace: { minutes, basis: 'CONTRACT_HOURLY', enabled: true } });
    }
  }
  for (const it of input.items.filter((x) => x.kind === 'PAYMENT')) {
    if (regular && AUTO_PAYMENT_CODES.has(it.code)) { block('duplicate_auto_item', it.code); continue; }
    if (lines.some((l) => l.kind === 'PAYMENT' && l.code === it.code)) { block('duplicate_item', it.code); continue; }
    if (it.amount < 0) block('negative_item', it.code);
    push({ code: it.code, kind: 'PAYMENT', label: it.label, raw: dec(it.amount), rounding: { mode: 'HALF_UP', unit: 1 }, trace: { fixed: true, taxable: it.taxable, insurable: it.insurable }, itemVersionId: it.itemVersionId });
  }
  for (const o of input.overrides.filter((x) => x.kind === 'PAYMENT' && !lines.some((l) => l.code === x.itemCode && l.kind === 'PAYMENT'))) {
    lines.push({ code: o.itemCode, kind: 'PAYMENT', label: o.label ?? o.itemCode, quantity: null, unitPrice: null, factor: null, rawValue: null, amount: o.amount, source: 'MANUAL', trace: { manual: true }, overrideId: o.id ?? null });
  }
  const base = lines.find((l) => l.code === 'BASE');
  if (base && base.amount < 0) block('negative_base');

  // ── 3. 과세 · 보험 기준 ──
  const itemOf = new Map(input.items.map((i) => [i.code, i]));
  let taxable = 0, insurable = 0;
  for (const l of lines.filter((x) => x.kind === 'PAYMENT')) {
    const it = itemOf.get(l.code);
    const mode = it?.taxable ?? 'TAXABLE'; // 기본급 · 시간 수당 · 직접 넣은 지급은 과세
    if (mode === 'TAXABLE') taxable += l.amount;
    else if (mode === 'PARTIAL' && it!.exemptLimit === null) block('exempt_limit_missing', l.code);
    else {
      // 비과세분 = 이 달 한도(PARTIAL) 안에서, 연간 한도가 있으면 그 해 남은 만큼만. 넘는 부분은 과세로 돌린다
      let exempt = mode === 'PARTIAL' ? Math.min(l.amount, it!.exemptLimit!) : l.amount; // 연간 한도가 없으면 예전 계산과 같다(과세 = 금액 − 한도, 음수면 0)
      const annual = it!.exemptAnnualLimit ?? null;
      if (annual !== null) {
        const used = input.exemptYtd?.[l.code] ?? 0;
        const left = Math.max(0, annual - used);
        if (exempt > left) {
          exempt = left;
          warnings.push({ code: 'exempt_annual_reached', detail: l.code });
        }
        l.trace = { ...l.trace, exemptAnnualLimit: annual, exemptYtdBefore: used };
      }
      l.trace = { ...l.trace, exempt };
      taxable += l.amount - exempt;
      // 보험 기준(보수)도 비과세분을 뺀다 — 일부 비과세는 과세로 돌린 부분만 들어간다 (2026-10-20, engine-1.5)
      if (it!.insurable) insurable += l.amount - exempt;
      continue;
    }
    if (it ? it.insurable : true) insurable += l.amount;
  }

  // ── 4. 보험 ──
  if (tax && input.skipInsurance) warnings.push({ code: 'insurance_not_calculated' });
  if (tax) {
    const basisOf = (key: 'pension' | 'health' | 'employment') => input.insuranceBasisOf?.[key] ?? input.insuranceBasis;
    const insure = (key: 'pension' | 'health' | 'employment', r: InsuranceRef | null): { employee: bigint; employer: bigint } | null => {
      const st = tax.insurance[key];
      const basis = basisOf(key);
      if (st.state === 'UNKNOWN') return block('insurance_unknown', key), null;
      if (st.state === 'NO') return null;
      if (basis === 'NOTICE') {
        const notice = input.notices?.[key];
        if (!notice) return block('notice_required', key), null;
        const code = key.toUpperCase();
        push({ code, kind: 'DEDUCTION', label: key, raw: dec(notice.employee), rounding: { mode: 'HALF_UP', unit: 1 }, trace: { basis: 'NOTICE', noticeId: notice.id, includesLtc: key === 'health' } });
        if (notice.employer !== null) push({ code: code + '_EMPLOYER', kind: 'EMPLOYER', label: key + 'Employer', raw: dec(notice.employer), rounding: { mode: 'HALF_UP', unit: 1 }, trace: { basis: 'NOTICE', noticeId: notice.id } });
        else warnings.push({ code: 'employer_notice_missing', detail: key });
        return { employee: BigInt(notice.employee), employer: BigInt(notice.employer ?? 0) };
      } // 고지 자료 없이 요율 계산으로 조용히 대신하지 않는다
      if (!r) return block('reference_missing', key), null;
      let baseAmt: Dec;
      if (basis === 'REPORTED') {
        if (st.reportedWage === null) return block('reported_wage_missing', key), null;
        baseAmt = dec(st.reportedWage);
      } else baseAmt = dec(insurable);
      if (r.floor !== null) baseAmt = max(baseAmt, dec(r.floor));
      if (r.ceiling !== null) baseAmt = min(baseAmt, dec(r.ceiling));
      if (r.baseUnit) baseAmt = dec(toWon(baseAmt, { mode: 'FLOOR', unit: r.baseUnit }));
      // 두루누리: 지원율만큼 근로자 · 사업주 보험료를 줄여 뗀다(국민연금 · 고용보험만). 지원율은 사원별 입력값 — 임시(검증 대기 기록)
      const support = key === 'pension' ? (tax.reliefs?.durunuri?.pension ?? 0) : key === 'employment' ? (tax.reliefs?.durunuri?.employment ?? 0) : 0;
      const keep = support > 0 ? sub(dec(1), div(dec(support), dec(100))) : dec(1);
      const trace = { basis, base: text(baseAmt), floor: r.floor, ceiling: r.ceiling, ...(support > 0 ? { durunuriPct: support } : {}) };
      const code = key.toUpperCase();
      // 월 보험료 상한 · 하한(건강보험 고시) — 근로자 · 사업주 각각. 두루누리 지원 전 금액에 적용한다
      const clamp = (v: Dec): Dec => {
        let out = v;
        if (r.premiumFloor != null) out = max(out, dec(r.premiumFloor));
        if (r.premiumCeiling != null) out = min(out, dec(r.premiumCeiling));
        return out;
      };
      const capTrace = r.premiumFloor != null || r.premiumCeiling != null ? { ...trace, premiumFloor: r.premiumFloor ?? null, premiumCeiling: r.premiumCeiling ?? null } : trace;
      push({ code, kind: 'DEDUCTION', label: key, raw: mul(clamp(mul(baseAmt, dec(r.employeeRate))), keep), rounding: policy.rounding.insurance, quantity: baseAmt, factor: dec(r.employeeRate), trace: capTrace });
      push({ code: `${code}_EMPLOYER`, kind: 'EMPLOYER', label: `${key}Employer`, raw: mul(clamp(mul(baseAmt, dec(r.employerRate))), keep), rounding: policy.rounding.insurance, quantity: baseAmt, factor: dec(r.employerRate), trace: capTrace });
      if (support > 0) warnings.push({ code: `durunuri_${key}`, detail: `${support}%` });
      const mine = lines.find((l) => l.code === code && l.kind === 'DEDUCTION')!;
      const theirs = lines.find((l) => l.code === `${code}_EMPLOYER`)!;
      return { employee: BigInt(mine.amount), employer: BigInt(theirs.amount) };
    };
    const on = !input.skipInsurance;
    if (on) insure('pension', ref.pension);
    const health = on ? insure('health', ref.health) : null;
    if (health && basisOf('health') !== 'NOTICE') {
      // 장기요양 = 건강보험료 × 비율 (보수에 비율을 곱하지 않는다)
      if (ref.ltcOfHealth === null) block('reference_missing', 'ltc');
      else {
        push({ code: 'LTC', kind: 'DEDUCTION', label: 'ltc', raw: mul(dec(health.employee), dec(ref.ltcOfHealth)), rounding: policy.rounding.insurance, quantity: dec(health.employee), factor: dec(ref.ltcOfHealth), trace: { of: 'HEALTH' } });
        push({ code: 'LTC_EMPLOYER', kind: 'EMPLOYER', label: 'ltcEmployer', raw: mul(dec(health.employer), dec(ref.ltcOfHealth)), rounding: policy.rounding.insurance, quantity: dec(health.employer), factor: dec(ref.ltcOfHealth), trace: { of: 'HEALTH_EMPLOYER' } });
      }
    }
    if (on) insure('employment', ref.employment);
    // 산재보험은 사업주만 낸다 — 직원 실지급에서 빼지 않는다
    const acc = tax.insurance.accident;
    if (!on) {
      // 상여 대장에서는 건너뛴다
    } else if (acc.state === 'UNKNOWN') block('insurance_unknown', 'accident');
    else if (acc.state === 'YES') {
      // 산재 요율(업종별)이 없어도 직원 명세는 계산된다 — 사업주 부담 합계에서 빠진다는 것만 알린다
      if (input.insuranceBasis === 'NOTICE') {
        const notice = input.notices?.accident;
        if (notice?.employer != null) push({ code: 'ACCIDENT_EMPLOYER', kind: 'EMPLOYER', label: 'accidentEmployer', raw: dec(notice.employer), rounding: { mode: 'HALF_UP', unit: 1 }, trace: { basis: 'NOTICE', noticeId: notice.id } });
        else warnings.push({ code: 'employer_notice_missing', detail: 'accident' });
      } else if (ref.accidentEmployerRate === null) warnings.push({ code: 'employer_rate_missing', detail: 'accident' });
      else push({ code: 'ACCIDENT_EMPLOYER', kind: 'EMPLOYER', label: 'accidentEmployer', raw: mul(dec(insurable), dec(ref.accidentEmployerRate)), rounding: policy.rounding.insurance, quantity: dec(insurable), factor: dec(ref.accidentEmployerRate), trace: {} });
    }

    // ── 5. 소득세 · 지방소득세 ──
    if (!input.withholding) block('reference_missing', 'income-tax');
    else if (input.runKind === 'BONUS' && !input.prior) block('bonus_prior_missing');
    else {
      // 상여: 같은 징수 묶음 전체의 세액에서 앞서 낸 세액을 뺀 차액만 (정기 급여의 세금을 또 더하지 않는다)
      const group = taxable + (input.runKind === 'BONUS' ? input.prior!.taxable : 0);
      const w = input.withholding({ taxable: group, family: tax.familyCount, children: tax.childCount, ratio: tax.withholdingRatio });
      if (!w.ok) block('withholding_failed', w.why);
      else {
        const already = input.runKind === 'BONUS' ? input.prior! : { incomeTax: 0, localTax: 0 };
        const one: Rounding = { mode: 'HALF_UP', unit: 1 }; // 세액은 세액표 · 규칙이 이미 끊어서 준다
        // 중소기업 취업자 감면: 세액표 소득세에 (1 − 감면율)을 곱해 10원 미만을 버린다. 지방소득세는 감면 뒤 소득세의 10%(10원 미만 버림). 임시 — 검증 대기 기록
        const smeRate = tax.reliefs?.smeRate ?? null;
        const groupIncome = smeRate ? Math.floor((w.incomeTax * (100 - smeRate)) / 100 / 10) * 10 : w.incomeTax;
        const groupLocal = smeRate ? Math.floor(groupIncome / 100) * 10 : w.localTax;
        if (smeRate) warnings.push({ code: 'sme_applied', detail: `${smeRate}%, -${(w.incomeTax - groupIncome).toLocaleString('en-US')}` });
        push({ code: 'INCOME_TAX', kind: 'DEDUCTION', label: 'incomeTax', raw: sub(dec(groupIncome), dec(already.incomeTax)), rounding: one, trace: { taxable: group, groupTax: groupIncome, already: already.incomeTax, ...w.trace, ...(smeRate ? { smePct: smeRate, beforeRelief: w.incomeTax } : {}) } });
        push({ code: 'LOCAL_TAX', kind: 'DEDUCTION', label: 'localTax', raw: sub(dec(groupLocal), dec(already.localTax)), rounding: one, trace: { groupTax: groupLocal, already: already.localTax } });
      }
    }
    // ── 6. 그 밖의 공제 ──
    if (tax.studentLoan.state === 'YES') {
      if (tax.studentLoan.monthlyAmount === null) block('student_loan_amount_missing');
      else push({ code: 'STUDENT_LOAN', kind: 'DEDUCTION', label: 'studentLoan', raw: dec(tax.studentLoan.monthlyAmount), rounding: { mode: 'HALF_UP', unit: 1 }, trace: { fixed: true } });
    }
  }
  for (const it of input.items.filter((x) => x.kind === 'DEDUCTION')) {
    if (lines.some((l) => l.kind === 'DEDUCTION' && l.code === canonicalItemCode(it.code))) { block('duplicate_item', it.code); continue; }
    push({ code: it.code, kind: 'DEDUCTION', label: it.label, raw: dec(it.amount), rounding: { mode: 'HALF_UP', unit: 1 }, trace: { fixed: true }, itemVersionId: it.itemVersionId });
  }
  for (const o of input.overrides.filter((x) => x.kind === 'DEDUCTION' && !lines.some((l) => l.code === x.itemCode && l.kind === 'DEDUCTION'))) {
    lines.push({ code: o.itemCode, kind: 'DEDUCTION', label: o.label ?? o.itemCode, quantity: null, unitPrice: null, factor: null, rawValue: null, amount: o.amount, source: 'MANUAL', trace: { manual: true }, overrideId: o.id ?? null });
  }

  // ── 7. 합계 · 검산 ──
  const pay = sum(lines, 'PAYMENT'), deduction = sum(lines, 'DEDUCTION'), employer = sum(lines, 'EMPLOYER');
  if (!regular && pay === 0) block('no_bonus_amount'); // 상여 금액을 넣지 않은 직원
  if (pay < 0 || isNeg(dec(pay - deduction))) block('negative_net');
  if (blockers.length > 0) return { state: 'BLOCKED', lines: [], totals: null, blockers, warnings, engineVersion: ENGINE_VERSION };
  return { state: 'OK', lines, totals: { pay, deduction, net: pay - deduction, employer, taxable, insuranceBase: insurable }, blockers: [], warnings, engineVersion: ENGINE_VERSION };
}

/** 세액표의 구간 조회: [from, to) 에 든 구간의 그 가족 수 세액. 구간이 없으면 null — 앞뒤 구간으로 메우지 않는다 */
export function bandTax(bands: readonly { from: number; to: number | null; taxes: readonly number[] }[], wage: number, family: number): number | null {
  const b = bands.find((x) => wage >= x.from && (x.to === null || wage < x.to));
  const v = b?.taxes[family - 1];
  return typeof v === 'number' ? v : null;
}

/** 보험 고지 정산: 고지액 − 이미 공제한 금액. 양수면 더 공제, 음수면 환급. 같은 고지를 두 번 반영하는 것은 저장하는 쪽이 막는다 */
export const settleNotice = (noticed: number, deducted: number): number => noticed - deducted;
