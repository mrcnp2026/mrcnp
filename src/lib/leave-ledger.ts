// 휴가 원장 (PRD v1.3 36 · 37.1 · 38장). 순수함수 — DB를 모른다.
// 지급 건(lot) = 발생한 휴가 한 묶음. 원장(ledger) = 지급 · 사용 · 취소 · 소멸 … 한 줄씩. 잔여 = 지급 건마다 원장 분(分)의 합.
// ★ 여기서 만든 발생 계획은 「후보」다 — 관리자가 승인해야 잔여에 들어간다(자동 반영 없음).
// ★ 통상 방식(근로기준법 제60조의 일반 규칙)만 계산한다. 출근율 80% · 개근 여부는 따지지 않는다 → 관리자가 후보를 보고 승인/반려한다.
import { addDays } from '@/lib/calendar';

export const DAY_MINUTES = 480; // 하루 = 8시간 (기존 휴가 신청의 일수와 같은 기준)

export type LeavePolicy = {
  basis: 'hire_date' | 'fiscal_year';
  fiscalStart: string; // 회계연도 시작 'MM-DD'
  dayMinutes: number;
  monthlyMax: number; // 1년 미만: 1개월마다 1일, 최대
  baseDays: number; // 1년 이상: 기본 일수
  extraEveryYears: number; // 3년차부터 이 햇수마다 1일 가산
  maxDays: number;
  rounding: 'none' | 'ceil_half' | 'ceil_day'; // 회계연도 첫해 비례 계산의 끝수
  carryMaxDays: number; // 사용 기간이 끝난 연차를 다음으로 넘길 수 있는 최대 일수. 0 = 이월 없음(전부 소멸)
  carryValidMonths: number; // 이월한 연차를 쓸 수 있는 개월 수
  advanceMaxDays: number; // 지급 건 없이 미리 쓸 수 있는 최대 일수. 0 = 선사용을 허용하지 않음(생기면 「한도 초과」로 표시)
};
/** 통상 방식 — 임시 입력(검증 대기 기록.md). 경영지원실의 노무 확인 뒤 「검증됨」으로 바꾼다 */
export const STANDARD_LEAVE_POLICY: LeavePolicy = { basis: 'hire_date', fiscalStart: '01-01', dayMinutes: DAY_MINUTES, monthlyMax: 11, baseDays: 15, extraEveryYears: 2, maxDays: 25, rounding: 'ceil_day', carryMaxDays: 0, carryValidMonths: 12, advanceMaxDays: 0 };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function validateLeavePolicy(b: unknown): LeavePolicy | null {
  if (!b || typeof b !== 'object') return null;
  const p = b as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  if (p.basis !== 'hire_date' && p.basis !== 'fiscal_year') return null;
  if (typeof p.fiscalStart !== 'string' || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(p.fiscalStart) || p.fiscalStart === '02-29') return null;
  if (!int(p.dayMinutes, 60, 1440) || !int(p.monthlyMax, 0, 11) || !int(p.baseDays, 1, 40) || !int(p.extraEveryYears, 1, 10) || !int(p.maxDays, 1, 60)) return null;
  if ((p.maxDays as number) < (p.baseDays as number)) return null;
  if (p.rounding !== 'none' && p.rounding !== 'ceil_half' && p.rounding !== 'ceil_day') return null;
  // 이월 · 선사용 칸은 나중에 생겼다 — 없는 옛 판은 「이월 없음 · 선사용 없음」으로 읽는다
  const carryMaxDays = p.carryMaxDays ?? 0, carryValidMonths = p.carryValidMonths ?? 12, advanceMaxDays = p.advanceMaxDays ?? 0;
  const half = (v: unknown, hi: number) => typeof v === 'number' && v >= 0 && v <= hi && Number.isInteger(v * 2);
  if (!half(carryMaxDays, 60) || !int(carryValidMonths, 1, 36) || !half(advanceMaxDays, 60)) return null;
  return { basis: p.basis, fiscalStart: p.fiscalStart, dayMinutes: p.dayMinutes as number, monthlyMax: p.monthlyMax as number, baseDays: p.baseDays as number, extraEveryYears: p.extraEveryYears as number, maxDays: p.maxDays as number, rounding: p.rounding, carryMaxDays: carryMaxDays as number, carryValidMonths: carryValidMonths as number, advanceMaxDays: advanceMaxDays as number };
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** n개월 뒤 같은 날. 그 달에 그 날이 없으면 말일 (1/31 + 1개월 = 2/28) */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12);
  const nm = (t % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDay(ny, nm)))}`;
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** 근속 n년(1 이상)의 연차 일수: 기본 + 3년차부터 가산, 최대까지 */
export const annualDays = (p: LeavePolicy, years: number) => Math.min(p.baseDays + Math.floor((years - 1) / p.extraEveryYears), p.maxDays);

export type LotKind = 'annual' | 'monthly' | 'carry' | 'compensatory' | 'manual' | 'migrated' | 'periodic' | 'on_request';
export type PlannedLot = {
  kind: 'annual' | 'monthly';
  accrualFrom: string;
  accrualTo: string;
  grantedOn: string;
  usableFrom: string;
  usableTo: string; // 이 날 전날까지
  minutes: number;
  dayMinutes: number;
  basis: { rule: 'monthly' | 'annual' | 'fiscal_prorate' | 'fiscal_annual'; hiredOn: string; years?: number; month?: number; days: number; serviceDays?: number; yearDays?: number };
  key: string; // 중복 방지 열쇠의 뒷부분 (종류:산정 시작일)
};

function roundDaysBy(p: LeavePolicy, days: number): number {
  if (p.rounding === 'ceil_day') return Math.ceil(days - 1e-9);
  if (p.rounding === 'ceil_half') return Math.ceil(days * 2 - 1e-9) / 2;
  return Math.round(days * 100) / 100;
}

/**
 * 입사일 → asOf까지 발생한 지급 건 계획. liveOnly면 asOf에 아직 쓸 수 있는 건만(지난 건은 만들지 않는다).
 *   · 1년 미만: 1개월이 찰 때마다 1일(최대 monthlyMax). 입사 1년이 되는 날 전날까지 쓴다.
 *   · 입사일 기준: 입사 n주년마다 annualDays(n). 다음 주년 전날까지.
 *   · 회계연도 기준: 입사 뒤 첫 회계연도 시작일에 기본 일수 × (그때까지 재직일수 ÷ 그 한 해의 날수), 그다음부터 회계연도마다 annualDays(n). 그 회계연도 끝까지.
 */
export function planAccrual(args: { hiredOn: string; asOf: string; policy: LeavePolicy; liveOnly?: boolean }): PlannedLot[] {
  const { hiredOn, asOf, policy: p } = args;
  if (!DATE.test(hiredOn) || !DATE.test(asOf) || hiredOn > asOf) return [];
  const out: PlannedLot[] = [];
  const firstAnniv = addMonths(hiredOn, 12);
  for (let k = 1; k <= p.monthlyMax; k++) {
    const on = addMonths(hiredOn, k);
    if (on > asOf || on >= firstAnniv) break;
    out.push({
      kind: 'monthly', accrualFrom: addMonths(hiredOn, k - 1), accrualTo: addDays(on, -1), grantedOn: on, usableFrom: on, usableTo: firstAnniv,
      minutes: p.dayMinutes, dayMinutes: p.dayMinutes, basis: { rule: 'monthly', hiredOn, month: k, days: 1 }, key: `monthly:${addMonths(hiredOn, k - 1)}`,
    });
  }
  if (p.basis === 'hire_date') {
    for (let n = 1; ; n++) {
      const on = addMonths(hiredOn, 12 * n);
      if (on > asOf) break;
      const days = annualDays(p, n);
      out.push({
        kind: 'annual', accrualFrom: addMonths(hiredOn, 12 * (n - 1)), accrualTo: addDays(on, -1), grantedOn: on, usableFrom: on, usableTo: addMonths(hiredOn, 12 * (n + 1)),
        minutes: days * p.dayMinutes, dayMinutes: p.dayMinutes, basis: { rule: 'annual', hiredOn, years: n, days }, key: `annual:${addMonths(hiredOn, 12 * (n - 1))}`,
      });
    }
  } else {
    const hy = Number(hiredOn.slice(0, 4));
    let first = `${hy}-${p.fiscalStart}`;
    if (first <= hiredOn) first = `${hy + 1}-${p.fiscalStart}`;
    for (let k = 0; ; k++) {
      const on = addMonths(first, 12 * k);
      if (on > asOf) break;
      const end = addMonths(first, 12 * (k + 1));
      if (k === 0) {
        const yearStart = addMonths(first, -12);
        const serviceDays = daysBetween(hiredOn, first);
        const yearDays = daysBetween(yearStart, first);
        const days = roundDaysBy(p, Math.min(p.baseDays, (p.baseDays * serviceDays) / yearDays));
        if (days <= 0) continue;
        out.push({
          kind: 'annual', accrualFrom: hiredOn, accrualTo: addDays(on, -1), grantedOn: on, usableFrom: on, usableTo: end,
          minutes: Math.round(days * p.dayMinutes), dayMinutes: p.dayMinutes, basis: { rule: 'fiscal_prorate', hiredOn, days, serviceDays, yearDays }, key: `annual:${hiredOn}`,
        });
      } else {
        const days = annualDays(p, k);
        out.push({
          kind: 'annual', accrualFrom: addMonths(first, 12 * (k - 1)), accrualTo: addDays(on, -1), grantedOn: on, usableFrom: on, usableTo: end,
          minutes: days * p.dayMinutes, dayMinutes: p.dayMinutes, basis: { rule: 'fiscal_annual', hiredOn, years: k, days }, key: `annual:${addMonths(first, 12 * (k - 1))}`,
        });
      }
    }
  }
  return args.liveOnly ? out.filter((l) => l.usableTo > asOf) : out;
}

// ── 잔여 ──
export type LotState = 'CANDIDATE' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type Lot = { id: string; employeeId: string; typeCode: string; kind: LotKind; grantedOn: string; usableFrom: string; usableTo: string | null; quantityMinutes: number; dayMinutes: number; state: LotState };
export type LedgerEvent = 'grant' | 'use' | 'reserve' | 'release' | 'cancel' | 'expire' | 'carry_out' | 'carry_in' | 'advance' | 'offset' | 'settle' | 'adjust';
export type Entry = { id: number; employeeId: string; lotId: string | null; event: LedgerEvent; minutes: number; effectiveOn: string; isTest: boolean; requestId: string | null };

/** 연습 화면이면 연습 신청에서 나온 줄만, 운영 화면이면 운영 신청에서 나온 줄만. 신청과 무관한 줄(지급 · 소멸 · 조정)은 늘 센다 */
// 선사용 상계(offset)는 운영 기준으로만 넣는다 — 연습 화면에서는 세지 않는다(연습 신청의 선사용과 섞이지 않게)
export const entriesFor = (entries: readonly Entry[], practice: boolean) => entries.filter((e) => (e.event === 'offset' ? !practice : e.requestId === null ? !e.isTest : e.isTest === practice));

/** 승인된 지급 건마다 남은 분 */
export function lotRemaining(lots: readonly Lot[], entries: readonly Entry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lots) if (l.state === 'APPROVED') out.set(l.id, 0);
  for (const e of entries) if (e.lotId && out.has(e.lotId)) out.set(e.lotId, out.get(e.lotId)! + e.minutes);
  return out;
}
const liveAt = (l: Lot, d: string) => l.state === 'APPROVED' && l.usableFrom <= d && (l.usableTo === null || d < l.usableTo);

export type LedgerBalance = { granted: number; used: number; expired: number; remaining: number; advance: number; upcoming: number };
/** asOf에 쓸 수 있는 지급 건 기준의 요약(분). remaining = 쓸 수 있는 잔여 − 선사용(지급 건 없이 쓴 분) */
export function ledgerBalance(lots: readonly Lot[], entries: readonly Entry[], asOf: string): LedgerBalance {
  const rem = lotRemaining(lots, entries);
  const live = new Set(lots.filter((l) => liveAt(l, asOf)).map((l) => l.id));
  let granted = 0, used = 0, expired = 0, advance = 0;
  for (const e of entries) {
    if (e.lotId === null) { advance -= e.minutes; continue; }
    if (!live.has(e.lotId)) continue;
    if (e.event === 'use' || e.event === 'cancel' || e.event === 'reserve' || e.event === 'release') used -= e.minutes;
    else if (e.event === 'expire') expired -= e.minutes;
    else granted += e.minutes;
  }
  let remaining = 0, upcoming = 0;
  for (const l of lots) {
    if (live.has(l.id)) remaining += rem.get(l.id) ?? 0;
    else if (l.state === 'APPROVED' && l.usableFrom > asOf) upcoming += rem.get(l.id) ?? 0;
  }
  return { granted, used, expired, remaining: remaining - advance, advance, upcoming };
}

/** 쓸 분을 지급 건에 나눈다 — 먼저 끝나는 건부터. 모자라는 분은 shortage(선사용) */
export function allocate(args: { lots: readonly Lot[]; remaining: ReadonlyMap<string, number>; minutes: number; on: string }): { parts: { lotId: string; minutes: number }[]; shortage: number } {
  const pool = args.lots
    .filter((l) => liveAt(l, args.on) && (args.remaining.get(l.id) ?? 0) > 0)
    .sort((a, b) => (a.usableTo ?? '9999-12-31').localeCompare(b.usableTo ?? '9999-12-31') || a.grantedOn.localeCompare(b.grantedOn) || a.id.localeCompare(b.id));
  let need = args.minutes;
  const parts: { lotId: string; minutes: number }[] = [];
  for (const l of pool) {
    if (need <= 0) break;
    const take = Math.min(need, args.remaining.get(l.id)!);
    parts.push({ lotId: l.id, minutes: take });
    need -= take;
  }
  return { parts, shortage: Math.max(0, need) };
}

export type RequestFact = { id: string; startDate: string; days: number; approved: boolean; deducts: boolean; isTest: boolean };
export type NewEntry = { lotId: string | null; event: LedgerEvent; minutes: number; effectiveOn: string; isTest: boolean; requestId: string | null; dedupeKey: string; reason?: string };

/**
 * 신청 한 건을 원장에 맞춘다(여러 번 불러도 같은 결과).
 *   · 승인 + 차감 대상인데 원장에 없으면 → 사용 줄(지급 건별) · 모자라면 선사용 줄
 *   · 승인이 아닌데 원장에 사용이 남아 있으면 → 되돌리는 줄(cancel)
 *   · 일수가 달라졌으면 → 전부 되돌리고 다시 넣는다
 * 열쇠의 seq = 그 신청의 줄 수 — 승인 → 취소 → 다시 승인해도 겹치지 않는다.
 */
export function planRequest(args: { req: RequestFact; lots: readonly Lot[]; entries: readonly Entry[] }): NewEntry[] {
  const { req } = args;
  const mine = args.entries.filter((e) => e.requestId === req.id);
  const byLot = new Map<string | null, number>();
  for (const e of mine) byLot.set(e.lotId, (byLot.get(e.lotId) ?? 0) + e.minutes);
  const usedNow = -[...byLot.values()].reduce((a, b) => a + b, 0);
  const target = req.approved && req.deducts ? Math.round(req.days * DAY_MINUTES) : 0;
  if (usedNow === target) return [];
  const seq = mine.length;
  const out: NewEntry[] = [];
  const base = { effectiveOn: req.startDate, isTest: req.isTest, requestId: req.id };
  for (const [lotId, sum] of byLot) if (sum !== 0) out.push({ ...base, lotId, event: 'cancel', minutes: -sum, dedupeKey: `req:${req.id}:${seq}:${lotId ?? 'adv'}:cancel` });
  if (target > 0) {
    // 되돌린 분을 돌려놓은 잔여에서 다시 나눈다. 다른 방식(연습/운영)의 사용은 세지 않는다
    const others = entriesFor(args.entries, req.isTest).filter((e) => e.requestId !== req.id);
    const { parts, shortage } = allocate({ lots: args.lots, remaining: lotRemaining(args.lots, others), minutes: target, on: req.startDate });
    for (const p of parts) out.push({ ...base, lotId: p.lotId, event: 'use', minutes: -p.minutes, dedupeKey: `req:${req.id}:${seq}:${p.lotId}:use` });
    if (shortage > 0) out.push({ ...base, lotId: null, event: 'advance', minutes: -shortage, dedupeKey: `req:${req.id}:${seq}:adv:use` });
  }
  return out;
}

/** 사용 기간이 끝났는데 남은 분 → 소멸 줄. 끝나는 날(usableTo)에 소멸한 것으로 적는다 */
export function planExpiry(lots: readonly Lot[], entries: readonly Entry[], asOf: string): NewEntry[] {
  const rem = lotRemaining(lots, entries);
  const out: NewEntry[] = [];
  for (const l of lots) {
    const left = rem.get(l.id) ?? 0;
    if (l.state !== 'APPROVED' || l.usableTo === null || l.usableTo > asOf || left <= 0) continue;
    out.push({ lotId: l.id, event: 'expire', minutes: -left, effectiveOn: l.usableTo, isTest: false, requestId: null, dedupeKey: `expire:${l.id}` });
  }
  return out;
}

/** 분 → 일 (넷째 자리까지) */
export const minutesToDays = (m: number, dayMinutes = DAY_MINUTES) => Math.round((m / dayMinutes) * 10000) / 10000;

// ── 이월 · 선사용 상계 · 퇴사 정산 (M5) ──
/** 사용 기간이 끝난 지급 건의 남은 분 → 이월할 분(정책 한도까지)과 소멸할 분 */
export function splitCarry(leftMinutes: number, policy: LeavePolicy): { carry: number; expire: number } {
  const carry = Math.max(0, Math.min(leftMinutes, Math.round(policy.carryMaxDays * policy.dayMinutes)));
  return { carry, expire: Math.max(0, leftMinutes - carry) };
}

/** 선사용(지급 건 없이 쓴 분)이 남아 있고 쓸 수 있는 지급 건이 생겼으면 그 지급 건에서 갚는다 — 선사용 쪽 +, 지급 건 쪽 − 한 쌍씩 */
export function planOffset(lots: readonly Lot[], entries: readonly Entry[], asOf: string, isTest: boolean): NewEntry[] {
  const debt = -entries.filter((e) => e.lotId === null).reduce((a, e) => a + e.minutes, 0);
  if (debt <= 0) return [];
  const { parts } = allocate({ lots, remaining: lotRemaining(lots, entries), minutes: debt, on: asOf });
  const seq = entries.filter((e) => e.event === 'offset').length;
  return parts.flatMap((p, i) => [
    { lotId: null, event: 'offset' as const, minutes: p.minutes, effectiveOn: asOf, isTest, requestId: null, dedupeKey: `offset:${p.lotId}:${seq + i}:${isTest ? 't' : 'l'}:in` },
    { lotId: p.lotId, event: 'offset' as const, minutes: -p.minutes, effectiveOn: asOf, isTest, requestId: null, dedupeKey: `offset:${p.lotId}:${seq + i}:${isTest ? 't' : 'l'}:out` },
  ]);
}

export type Settlement = { lots: { lotId: string; kind: LotKind; grantedOn: string; usableTo: string | null; minutes: number }[]; unusedMinutes: number; advanceMinutes: number; hireBasisMinutes: number | null; grantedMinutes: number };
/**
 * 퇴사일 기준 연차 정산 내역. 미사용 = 퇴사일에 쓸 수 있던 지급 건의 남은 분. 선사용 미상계는 따로 적는다(임금에서 자동으로 빼지 않는다).
 * hireBasisMinutes: 회계연도 기준 회사에서 「입사일 기준으로 계산했다면 받았을 총 연차」 — 받은 것(grantedMinutes)보다 많으면 차이를 더 줘야 하는지 노무 확인이 필요하다(참고 값).
 */
export function settleLeave(args: { lots: readonly Lot[]; entries: readonly Entry[]; retireOn: string; hiredOn: string | null; policy: LeavePolicy }): Settlement {
  const rem = lotRemaining(args.lots, args.entries);
  const live = args.lots.filter((l) => l.state === 'APPROVED' && l.usableFrom <= args.retireOn && (l.usableTo === null || args.retireOn < l.usableTo) && (rem.get(l.id) ?? 0) > 0);
  const lots = live.map((l) => ({ lotId: l.id, kind: l.kind, grantedOn: l.grantedOn, usableTo: l.usableTo, minutes: rem.get(l.id)! })).sort((a, b) => a.grantedOn.localeCompare(b.grantedOn));
  const advanceMinutes = Math.max(0, -args.entries.filter((e) => e.lotId === null).reduce((a, e) => a + e.minutes, 0));
  const grantedMinutes = args.lots.filter((l) => l.state === 'APPROVED' && (l.kind === 'annual' || l.kind === 'monthly')).reduce((a, l) => a + l.quantityMinutes, 0);
  const hireBasisMinutes = args.hiredOn && args.policy.basis === 'fiscal_year' ? planAccrual({ hiredOn: args.hiredOn, asOf: args.retireOn, policy: { ...args.policy, basis: 'hire_date' } }).reduce((a, l) => a + l.minutes, 0) : null;
  return { lots, unusedMinutes: lots.reduce((a, l) => a + l.minutes, 0), advanceMinutes, hireBasisMinutes, grantedMinutes };
}

// ── 휴가 종류별 신청 규칙 (M5) ──
export type LeaveTypeRule = { maxDaysPerRequest: number | null; minNoticeDays: number | null; reasonRequired: boolean };
export const NO_TYPE_RULE: LeaveTypeRule = { maxDaysPerRequest: null, minNoticeDays: null, reasonRequired: false };
export function validateTypeRule(v: unknown): LeaveTypeRule | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown, hi: number) => x === null || x === undefined || x === '' ? null : typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= hi ? x : NaN;
  const max = num(o.maxDaysPerRequest, 365), notice = num(o.minNoticeDays, 365);
  if (Number.isNaN(max) || Number.isNaN(notice) || (max !== null && (max <= 0 || !Number.isInteger(max * 16))) || (notice !== null && !Number.isInteger(notice))) return null;
  if (typeof o.reasonRequired !== 'boolean') return null;
  return { maxDaysPerRequest: max, minNoticeDays: notice, reasonRequired: o.reasonRequired };
}
/** 신청이 그 종류의 규칙에 맞는가. 맞으면 null, 아니면 오류 코드 */
export function checkTypeRule(rule: LeaveTypeRule, req: { days: number; startDate: string; today: string; reason: string }): 'leave_too_long' | 'leave_notice' | 'leave_reason_required' | null {
  if (rule.maxDaysPerRequest !== null && req.days > rule.maxDaysPerRequest) return 'leave_too_long';
  if (rule.minNoticeDays !== null && req.startDate < addDays(req.today, rule.minNoticeDays)) return 'leave_notice';
  if (rule.reasonRequired && req.reason.trim().length < 2) return 'leave_reason_required';
  return null;
}
