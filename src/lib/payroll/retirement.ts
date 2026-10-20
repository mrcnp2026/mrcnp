// 퇴직급여 계산 — 순수 계산 (PRD v1.3 9장 · 18.6 W08). 화면과 서버가 같이 쓴다.
// ★ 수동 검산용이다. 넣은 값으로 통상 산식을 따라 계산해 과정을 보여 줄 뿐, 법정 정산이 맞는지는 노무 확인이 필요하다(검증 대기 기록).
// ★ 필수 입력이 빠지면 금액을 내지 않는다(null). 0원으로 적지 않는다. 계속근로 1년 미만도 금액을 내지 않고 사유를 적는다.
// ★ 퇴직소득세는 계산하지 않는다 — 확인된 값을 손으로 넣는다.
// 산식(통상 방식 · 임시):
//   1일 평균임금 = (퇴직 전 3개월 임금 총액 + 직전 1년 상여 × 3/12 + 연차수당 × 3/12) ÷ 그 3개월의 총 일수
//   1일 통상임금이 더 크면 통상임금을 쓴다
//   퇴직급여 = 1일 평균임금 × 30일 × (계속근로일수 ÷ 365)   — 원 미만 버림
import { dec, div, mul, text, toWon, type Dec } from './engine/decimal';

export const RETIREMENT_RULE = 'retirement-manual-1'; // 산식이 바뀌면 올린다 (계산 근거에 남는다)
export type RetirementInput = {
  periodFrom: string | null;   // 계속근로 시작일(입사일 · 중간정산 다음날)
  periodTo: string | null;     // 계속근로 마지막 날(퇴직일 전날 · 중간정산 기준일)
  excludedDays: number;        // 계속근로에서 빼는 날수 (담당자가 확인한 제외 기간)
  wage3m: number | null;       // 퇴직 전 3개월 임금 총액
  days3m: number | null;       // 그 3개월의 총 일수 (89 ~ 92)
  bonus1y: number;             // 직전 1년 상여 총액
  leavePay1y: number;          // 직전 1년 연차수당
  ordinaryDaily: number | null; // 1일 통상임금 (넣으면 평균임금과 비교한다)
  departureInsurance?: number | null; // E-9 · H-2 출국만기보험 받은 금액 (묶음 31) — 있으면 회사가 줄 차액 = 퇴직급여 − 이 금액
};
export type RetirementMissing = 'period' | 'wage3m' | 'days3m' | 'under_one_year' | 'bad_period' | 'bad_days3m';
export type RetirementResult = {
  missing: RetirementMissing[];
  serviceDays: number | null;      // 계속근로일수 (제외 기간을 뺀)
  averageDaily: string | null;     // 1일 평균임금 (소수 포함 문자열)
  dailyUsed: string | null;        // 실제로 쓴 1일 임금
  usedOrdinary: boolean;           // 통상임금이 더 커서 그것을 썼는가
  amount: number | null;           // 퇴직급여 (원). 빠진 입력이 있으면 null
  companyPays?: number | null;     // 출국만기보험을 넣었으면 회사가 더 줄 차액(0 이상). 넣지 않았으면 없음
  rule: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** 두 날짜 사이의 날수 (양 끝 포함) */
export const daysBetween = (from: string, to: string): number => Math.round((ms(to) - ms(from)) / 86400000) + 1;
/** 기준일 전 3개월 구간 [시작, 끝] — 끝은 기준일 전날, 시작은 석 달 전 같은 날 */
export function last3Months(lastDay: string): { from: string; to: string; days: number } {
  const end = new Date(ms(lastDay) + 86400000); // 퇴직일(마지막 날 다음날)
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 3, end.getUTCDate()));
  // 석 달 전에 그 날짜가 없으면(예: 5/31 → 2/31) 달이 넘어간다 → 그 달 1일로 당긴다
  if (start.getUTCDate() !== end.getUTCDate()) start.setUTCDate(1);
  const from = start.toISOString().slice(0, 10);
  return { from, to: lastDay, days: daysBetween(from, lastDay) };
}

export function calcRetirement(i: RetirementInput): RetirementResult {
  const missing: RetirementMissing[] = [];
  let serviceDays: number | null = null;
  if (!i.periodFrom || !i.periodTo || !DAY.test(i.periodFrom) || !DAY.test(i.periodTo)) missing.push('period');
  else if (i.periodTo < i.periodFrom) missing.push('bad_period');
  else {
    serviceDays = daysBetween(i.periodFrom, i.periodTo) - Math.max(0, Math.floor(i.excludedDays || 0));
    if (serviceDays < 365) missing.push('under_one_year');
  }
  if (i.wage3m === null || !(i.wage3m > 0)) missing.push('wage3m');
  if (i.days3m === null) missing.push('days3m');
  else if (!(i.days3m >= 28 && i.days3m <= 92)) missing.push('bad_days3m');
  const base = { serviceDays, rule: RETIREMENT_RULE };
  if (i.wage3m === null || !(i.wage3m > 0) || i.days3m === null || !(i.days3m >= 28 && i.days3m <= 92)) return { ...base, missing, averageDaily: null, dailyUsed: null, usedOrdinary: false, amount: null };
  const quarter = (v: number): Dec => div(mul(dec(Math.max(0, v || 0)), dec(3)), dec(12));
  const average = div(dec(i.wage3m) + quarter(i.bonus1y) + quarter(i.leavePay1y), dec(i.days3m));
  const ordinary = i.ordinaryDaily !== null && i.ordinaryDaily > 0 ? dec(i.ordinaryDaily) : null;
  const usedOrdinary = ordinary !== null && ordinary > average;
  const daily = usedOrdinary ? ordinary! : average;
  const amount = missing.length === 0 && serviceDays !== null ? Number(toWon(div(mul(mul(daily, dec(30)), dec(serviceDays)), dec(365)), { mode: 'FLOOR', unit: 1 })) : null;
  // 출국만기보험(외국인고용법 제13조): 보험금이 법정 퇴직금보다 적으면 회사가 차액을 준다. 많으면 0
  const dep = i.departureInsurance ?? null;
  const companyPays = dep === null ? undefined : amount === null ? null : Math.max(0, amount - dep);
  return { ...base, missing, averageDaily: text(average), dailyUsed: text(daily), usedOrdinary, amount, ...(companyPays === undefined ? {} : { companyPays }) };
}

/** 저장 · 요청에서 온 값을 입력 모양으로 맞춘다 (모르는 값은 버린다) */
export function toRetirementInput(v: unknown): RetirementInput {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const date = (x: unknown) => (typeof x === 'string' && DAY.test(x) && !Number.isNaN(ms(x)) ? x : null);
  const num = (x: unknown): number | null => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x.replace(/,/g, '')) : NaN;
    return Number.isFinite(n) && n >= 0 && n <= 1e12 ? Math.round(n) : null;
  };
  return { periodFrom: date(o.periodFrom), periodTo: date(o.periodTo), excludedDays: num(o.excludedDays) ?? 0, wage3m: num(o.wage3m), days3m: num(o.days3m), bonus1y: num(o.bonus1y) ?? 0, leavePay1y: num(o.leavePay1y) ?? 0, ordinaryDaily: num(o.ordinaryDaily), departureInsurance: num(o.departureInsurance) };
}
