// 연차·휴가 (②-2 7-3, ②마스터 4-7). 순수함수.
// ★★ suggestAnnualDays의 결과를 자동으로 leave_grants에 넣지 마라 — 참고용. 관리자가 입력 칸에 직접 쓴다.
// ★ 유급휴가일은 결근이 아니다 — leaveByDate로 날짜별 휴가를 만들어 결근 판정에서 뺀다 (틀리면 급여가 깎인다).
// ★ pending(승인 대기)은 remaining에서 빼지 않고 따로 보여 준다.
import { addDays } from '@/lib/calendar';
import type { DayType, WorkRule } from '@/lib/types';

// 시간 단위 (2026-10-10): hours = 그 휴가의 길이(시간), dayUnit = 차감 일수(시간 ÷ 8, 최대 1). startTime·endTime = 종류에 정해 둔 시각 (없으면 null)
export type LeaveType = { code: string; name: string; isPaid: boolean; deductsBalance: boolean; dayUnit: number; hours?: number; startTime?: string | null; endTime?: string | null; groupName?: string | null; builtin?: boolean; active?: boolean };
export type LeaveGrant = { id: string; employeeId: string; periodLabel: string; grantedDays: number; carriedDays: number; basis: 'hire_date' | 'fiscal_year'; effectiveFrom: string; note: string | null };
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveRequest = { id: string; employeeId: string; typeCode: string; startDate: string; endDate: string; days: number; reason: string | null; status: LeaveStatus; startTime?: string | null; endTime?: string | null; createdAt?: string; decidedAt?: string | null; approvedBy?: string | null };

/** 소수 일수의 부동소수점 찌꺼기 제거. 30분 = 0.0625일이라 넷째 자리까지 둔다 */
export const roundDays = (n: number) => Math.round(n * 10000) / 10000;

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

/**
 * 입사일 기준 지금 연차 기간 (자동 채움용, 2026-10-02 의뢰인: "입사일을 넣으면 계산값이 채워지고 관리자가 확인").
 * 1년 미만: 입사일부터 (매월 1일씩 늘어나므로 달마다 다시 저장) · 1년 이상: 가장 최근 입사 기념일부터 1년.
 */
export function suggestGrant(hiredOn: string, asOf: string): { days: number; note: string; periodLabel: string; effectiveFrom: string; isReference: true } {
  const ref = suggestAnnualDays({ hiredOn, asOf, basis: 'hire_date' });
  const [hy, hm, hd] = hiredOn.split('-').map(Number);
  const [ay, am, ad] = asOf.split('-').map(Number);
  let years = ay - hy - (am < hm || (am === hm && ad < hd) ? 1 : 0);
  if (years < 0) years = 0;
  const anniv = (n: number) => `${hy + n}-${String(hm).padStart(2, '0')}-${String(hd).padStart(2, '0')}`;
  if (years < 1) return { ...ref, periodLabel: `${hiredOn.slice(0, 7)} 입사 첫해`, effectiveFrom: hiredOn };
  const start = anniv(years);
  const end = addDays(anniv(years + 1), -1);
  return { ...ref, periodLabel: `${start.slice(0, 7)}~${end.slice(0, 7)}`, effectiveFrom: start };
}

/** 신청 일수 = 기간 안의 근무일 수 × 종류 단위. 반차·반반차는 하루짜리만 (start = end) */
export function countLeaveDays(args: { type: LeaveType; startDate: string; endDate: string; dayTypeOf: (d: string) => DayType }): number {
  if (args.endDate < args.startDate) return 0;
  if (args.type.dayUnit < 1) return args.startDate === args.endDate && args.dayTypeOf(args.startDate) === 'workday' ? args.type.dayUnit : 0;
  let n = 0;
  for (let d = args.startDate; d <= args.endDate; d = addDays(d, 1)) if (args.dayTypeOf(d) === 'workday') n++;
  return roundDays(n * args.type.dayUnit);
}

export type LeaveOnDay = { typeCode: string; isPaid: boolean; unit: number; requestId: string; startTime?: string | null; endTime?: string | null };

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
      out.set(d, [...(out.get(d) ?? []), { typeCode: t.code, isPaid: t.isPaid, unit: t.dayUnit, requestId: r.id, startTime: r.startTime ?? null, endTime: r.endTime ?? null }]);
    }
  }
  return out;
}

/** 그날 하루 전부 휴가인가 (단위 합 1 이상) — 결근·출근 미기록에서 뺀다 */
export const isFullDayLeave = (l: LeaveOnDay[] | undefined) => !!l && l.reduce((a, x) => a + x.unit, 0) >= 1;

/** 하루 전부 휴가인 날짜들 */
export const fullLeaveSet = (m: Map<string, LeaveOnDay[]>) => new Set([...m].filter(([, l]) => isFullDayLeave(l)).map(([d]) => d));

// ── 시간 단위 휴가 (2026-10-10 의뢰인: "10시 반차 · 11시 반차 · 4시간 반차 등 상세히 구분") ──
export const DAY_HOURS = 8; // 하루 = 8시간 (차감 일수 = 시간 ÷ 8)
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 시간 → 차감 일수 (8시간 = 1일, 그 이상은 1일) */
export const unitOfHours = (hours: number) => Math.min(1, roundDays(hours / DAY_HOURS));

export type LeaveTypeInput = { name: string; hours: number; dayUnit: number; startTime: string | null; endTime: string | null; groupName: string | null; isPaid: boolean; deductsBalance: boolean };

/** 휴가 종류 입력값 검사. 시간은 0.5시간 단위(0.5~8). 시각은 둘 다 적거나 둘 다 비운다 */
export function validateLeaveType(b: Record<string, unknown>): { ok: true; value: LeaveTypeInput } | { ok: false; code: 'invalid_name' | 'invalid_hours' | 'invalid_time' | 'invalid_input' } {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 1 || name.length > 40) return { ok: false, code: 'invalid_name' };
  const hours = typeof b.hours === 'number' ? b.hours : typeof b.hours === 'string' && b.hours.trim() !== '' ? Number(b.hours) : NaN;
  if (!Number.isFinite(hours) || hours < 0.5 || hours > DAY_HOURS || !Number.isInteger(hours * 2)) return { ok: false, code: 'invalid_hours' };
  const st = b.startTime === undefined || b.startTime === null || b.startTime === '' ? null : b.startTime;
  const et = b.endTime === undefined || b.endTime === null || b.endTime === '' ? null : b.endTime;
  if ((st === null) !== (et === null)) return { ok: false, code: 'invalid_time' };
  if (st !== null && (typeof st !== 'string' || typeof et !== 'string' || !HM.test(st) || !HM.test(et) || st >= et)) return { ok: false, code: 'invalid_time' };
  const g = b.groupName === undefined || b.groupName === null ? '' : typeof b.groupName === 'string' ? b.groupName.trim() : null;
  if (g === null || g.length > 40) return { ok: false, code: 'invalid_input' };
  if (typeof b.isPaid !== 'boolean' || typeof b.deductsBalance !== 'boolean') return { ok: false, code: 'invalid_input' };
  return { ok: true, value: { name, hours, dayUnit: unitOfHours(hours), startTime: st as string | null, endTime: et as string | null, groupName: g || null, isPaid: b.isPaid, deductsBalance: b.deductsBalance } };
}

/**
 * 신청 한 건의 시각. 종류에 시각이 정해져 있으면 그것, 아니면 하루보다 짧은 종류에 한해 직원이 적은 시작 시각 + 길이.
 * 하루짜리 종류나 시작 시각을 적지 않은 신청은 시각이 없다 (null).
 */
export function leaveWindow(type: LeaveType, startInput: unknown): { ok: true; startTime: string | null; endTime: string | null } | { ok: false } {
  if (type.startTime && type.endTime) return { ok: true, startTime: type.startTime.slice(0, 5), endTime: type.endTime.slice(0, 5) };
  if (type.dayUnit >= 1 || startInput === undefined || startInput === null || startInput === '') return { ok: true, startTime: null, endTime: null };
  if (typeof startInput !== 'string' || !HM.test(startInput)) return { ok: false };
  const end = toMin(startInput) + Math.round((type.hours ?? type.dayUnit * DAY_HOURS) * 60);
  if (end > 23 * 60 + 59) return { ok: false };
  return { ok: true, startTime: startInput, endTime: toHm(end) };
}

/**
 * 시각이 있는 휴가를 그날 일정에 반영한다 — 판정(지각·조퇴·미기록)에 쓰는 시작·끝 시각만 바꾼다.
 *   · 휴가가 일정의 시작을 덮으면 → 시작 = 휴가 끝 (그 시각이 휴게시간 안이면 휴게 끝)
 *   · 휴가가 일정의 끝을 덮으면   → 끝 = 휴가 시작 (그 시각이 휴게시간 안이면 휴게 시작)
 * 일정 한가운데의 휴가(외출)와 일정 전체를 덮는 휴가는 일정을 바꾸지 않는다.
 */
export function trimRuleByLeave(rule: WorkRule, leaves: readonly { startTime?: string | null; endTime?: string | null }[]): WorkRule {
  let start = rule.startTime.slice(0, 5);
  let end = rule.endTime.slice(0, 5);
  const bs = rule.breakStart?.slice(0, 5) ?? null;
  const be = rule.breakEnd?.slice(0, 5) ?? null;
  const timed = leaves.filter((l) => l.startTime && l.endTime).map((l) => ({ s: l.startTime!.slice(0, 5), e: l.endTime!.slice(0, 5) })).sort((a, b) => a.s.localeCompare(b.s));
  for (const l of timed) {
    if (l.s <= start && start < l.e) {
      start = l.e;
      if (bs && be && start >= bs && start < be) start = be;
    }
  }
  for (const l of [...timed].reverse()) {
    if (l.s < end && end <= l.e) {
      end = l.s;
      if (bs && be && end > bs && end <= be) end = bs;
    }
  }
  if (start >= end) return rule; // 일정 전체가 휴가 — 하루 휴가 판정(isFullDayLeave)에 맡긴다
  return start === rule.startTime.slice(0, 5) && end === rule.endTime.slice(0, 5) ? rule : { ...rule, startTime: start, endTime: end };
}

/** 휴가 종류 이름 — 기본 종류는 번역(leave.type.코드), 관리자가 만든 종류는 적어 둔 이름 */
export function leaveTypeName(types: readonly { code: string; name: string }[], code: string, tr: { (key: string): string; has: (key: string) => boolean }): string {
  return tr.has(`type.${code}`) ? tr(`type.${code}`) : (types.find((x) => x.code === code)?.name ?? code);
}
