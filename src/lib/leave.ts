// 연차·휴가 (②-2 7-3, ②마스터 4-7). 순수함수.
// ★★ suggestAnnualDays의 결과를 자동으로 leave_grants에 넣지 마라 — 참고용. 관리자가 입력 칸에 직접 쓴다.
// ★ 유급휴가일은 결근이 아니다 — leaveByDate로 날짜별 휴가를 만들어 결근 판정에서 뺀다 (틀리면 급여가 깎인다).
// ★ pending(승인 대기)은 remaining에서 빼지 않고 따로 보여 준다.
import { addDays } from '@/lib/calendar';
import type { DayType } from '@/lib/types';

export type LeaveType = { code: string; name: string; isPaid: boolean; deductsBalance: boolean; dayUnit: number };
export type LeaveGrant = { id: string; employeeId: string; periodLabel: string; grantedDays: number; carriedDays: number; basis: 'hire_date' | 'fiscal_year'; effectiveFrom: string; note: string | null };
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveRequest = { id: string; employeeId: string; typeCode: string; startDate: string; endDate: string; days: number; reason: string | null; status: LeaveStatus; createdAt?: string; decidedAt?: string | null; approvedBy?: string | null };

/** 소수 일수를 0.25 단위로 (부동소수점 찌꺼기 제거) */
export const roundDays = (n: number) => Math.round(n * 100) / 100;

/**
 * 지금 적용되는 부여(시작일이 asOf 이하인 것 중 가장 최근) 기준 잔여.
 * 사용·대기는 그 부여 시작일 ~ 다음 부여 시작일 전에 시작한 차감 대상 휴가만.
 */
export function calcLeaveBalance(args: { grants: LeaveGrant[]; requests: LeaveRequest[]; types: LeaveType[]; asOf: string }): {
  grant: LeaveGrant | null; granted: number; used: number; remaining: number; pending: number;
} {
  const sorted = [...args.grants].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const idx = sorted.map((g) => g.effectiveFrom <= args.asOf).lastIndexOf(true);
  if (idx < 0) return { grant: null, granted: 0, used: 0, remaining: 0, pending: 0 };
  const grant = sorted[idx];
  const until = sorted[idx + 1]?.effectiveFrom ?? '9999-12-31';
  const deducts = new Set(args.types.filter((t) => t.deductsBalance).map((t) => t.code));
  const inPeriod = args.requests.filter((r) => deducts.has(r.typeCode) && r.startDate >= grant.effectiveFrom && r.startDate < until);
  const sum = (s: LeaveStatus) => roundDays(inPeriod.filter((r) => r.status === s).reduce((a, r) => a + r.days, 0));
  const granted = roundDays(grant.grantedDays + grant.carriedDays);
  const used = sum('approved');
  return { grant, granted, used, remaining: roundDays(granted - used), pending: sum('pending') };
}

/**
 * ★ 참고용 계산기 (4-7). 입사일 기준 근로기준법 제60조의 일반 규칙만:
 * 1년 미만 = 1개월 개근마다 1일(최대 11일) · 1년 이상 = 15일 · 3년 이상부터 2년마다 1일 가산(최대 25일).
 * 개근 여부·출근율 80% 미만·회계연도 기준 정산은 따지지 않는다 → 관리자가 확인 후 직접 입력.
 */
export function suggestAnnualDays(args: { hiredOn: string; asOf: string; basis: 'hire_date' | 'fiscal_year' }): { days: number; note: string; isReference: true } {
  const [hy, hm, hd] = args.hiredOn.split('-').map(Number);
  const [ay, am, ad] = args.asOf.split('-').map(Number);
  let months = (ay - hy) * 12 + (am - hm) - (ad < hd ? 1 : 0);
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const days = years < 1 ? Math.min(months, 11) : Math.min(15 + Math.floor((years - 1) / 2), 25);
  const note =
    (years < 1 ? `입사 ${months}개월 — 1개월 개근마다 1일 (최대 11일)` : `근속 ${years}년 — 15일 + 3년차부터 2년마다 1일 (최대 25일)`) +
    (args.basis === 'fiscal_year' ? ' · 회계연도 기준은 입사 첫해 비례 계산이 달라 노무 확인 필요' : '') +
    ' · 출근율 80% 미만·개근 여부는 반영 안 됨';
  return { days, note, isReference: true };
}

/** 신청 일수 = 기간 안의 근무일 수 × 종류 단위. 반차·반반차는 하루짜리만 (start = end) */
export function countLeaveDays(args: { type: LeaveType; startDate: string; endDate: string; dayTypeOf: (d: string) => DayType }): number {
  if (args.endDate < args.startDate) return 0;
  if (args.type.dayUnit < 1) return args.startDate === args.endDate && args.dayTypeOf(args.startDate) === 'workday' ? args.type.dayUnit : 0;
  let n = 0;
  for (let d = args.startDate; d <= args.endDate; d = addDays(d, 1)) if (args.dayTypeOf(d) === 'workday') n++;
  return roundDays(n * args.type.dayUnit);
}

export type LeaveOnDay = { typeCode: string; isPaid: boolean; unit: number; requestId: string };

/** 승인된 휴가 → 날짜별 (근무일만). 같은 날 반차 2건이면 단위가 더해진다 */
export function leaveByDate(args: { requests: LeaveRequest[]; types: LeaveType[]; dayTypeOf: (d: string) => DayType; from?: string; to?: string }): Map<string, LeaveOnDay[]> {
  const typeOf = new Map(args.types.map((t) => [t.code, t]));
  const out = new Map<string, LeaveOnDay[]>();
  for (const r of args.requests) {
    if (r.status !== 'approved') continue;
    const t = typeOf.get(r.typeCode);
    if (!t) continue;
    for (let d = r.startDate; d <= r.endDate; d = addDays(d, 1)) {
      if ((args.from && d < args.from) || (args.to && d > args.to)) continue;
      if (args.dayTypeOf(d) !== 'workday') continue;
      out.set(d, [...(out.get(d) ?? []), { typeCode: t.code, isPaid: t.isPaid, unit: t.dayUnit, requestId: r.id }]);
    }
  }
  return out;
}

/** 그날 하루 전부 휴가인가 (단위 합 1 이상) — 결근·출근 미기록에서 뺀다 */
export const isFullDayLeave = (l: LeaveOnDay[] | undefined) => !!l && l.reduce((a, x) => a + x.unit, 0) >= 1;

/** 하루 전부 휴가인 날짜들 */
export const fullLeaveSet = (m: Map<string, LeaveOnDay[]>) => new Set([...m].filter(([, l]) => isFullDayLeave(l)).map(([d]) => d));
