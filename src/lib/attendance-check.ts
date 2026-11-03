// 근태 점검 — 하루의 「확인 필요」 판정 (결정 급여-69, 루트 문서 「근태 점검 — 확인 필요 항목 처리 흐름과 담당자 배정」). 순수 함수, DB에 쓰지 않는다.
//
// 원칙: 그날 기준 일정(승인 휴가 · 일정 변경 반영)과 실제 근무(정정 반영 + 회사 올림 · 내림)가 다른 구간은 전부 확인 필요.
//   승인 휴가로 덮인 구간은 기준 일정에서 이미 빠져 있어 저절로 걸리지 않는다.
//   앱은 지각인지 아닌지 판정하지 않는다 — 구간 · 분 · 덮는 승인만 돌려주고, 판단은 담당자가 한다.
// 차이를 잡는 기준값(15분 등)은 따로 두지 않는다: 출근은 끊는 단위로 올리고 퇴근은 내린 「계산 시각」으로 비교한다(확정-9).
//   → 끊는 단위 15분이면 늦은 출근 · 이른 퇴근은 1분부터, 이른 출근 · 늦은 퇴근은 15분부터 걸린다.
import { kstDateTime } from '@/lib/time';
import type { LateRound, PunchPair } from '@/lib/types';

export const CHECK_KINDS = ['pending_request', 'record_error', 'missing_out', 'missing_in', 'leave_day_punch', 'no_plan_work', 'before_start', 'late_in', 'early_out', 'after_end', 'break_check'] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];
/** block = 마감 막음(기록을 고치거나 요청을 처리해야 빠짐) · decide = 판단 필요 · confirm = 확인만(승인이 전부 덮음) */
export type CheckState = 'block' | 'decide' | 'confirm';
export type CheckPart = {
  kind: CheckKind;
  minutes: number; // 차이 구간의 분 (휴게시간대와 겹친 분은 뺀다). 누락 · 기록 오류 · 대기 요청은 0
  covered: number; // 그중 승인된 요청이 덮는 분
  state: CheckState;
  plan?: string; // 비교한 일정 시각 'HH:MM'
  punched?: string; // 찍힌 시각 'HH:MM'
  counted?: string; // 계산 시각 'HH:MM' (올림 · 내림 뒤)
  quiet?: boolean; // 회사 설정 기준 이내의 일찍 출근 — 숫자에서 빠지고 기록 화면에만 흐리게 (check.early_ignore_min)
  bundled?: boolean; // 한 달 1건(일정 확인 필요 · 일찍 출근 묶음)으로 옮겨 감 — 그날 숫자에서는 빠진다
};
export type DayCheck = { workDate: string; state: CheckState | null; parts: CheckPart[] };

export type DayCheckInput = {
  workDate: string;
  plan: { startTime: string; endTime: string } | null; // 그날 기준 일정. 없으면 쉬는 날 · 일정 없는 날
  breaks: readonly { start: string; end: string }[]; // 그날 휴게시간대 (휴게 안 함으로 표시한 것은 이미 뺀 것)
  roundStepMin: number; // 회사 끊는 단위(분). 0 = 끊지 않음
  pairs: readonly PunchPair[]; // 정정을 반영한 출퇴근 짝
  deemed: boolean; // 간주 근무 — 판정 대상 아님
  fullLeave: boolean; // 하루 휴가 · 종일 외근 · 출장 · 재택으로 승인된 날
  missing: 'in' | 'out' | null; // 누락 목록과 같은 기준
  recordError: boolean; // 출근 없는 퇴근 · 겹침 · 연달아 두 번
  pending: boolean; // 그날 처리 전 요청(휴가 · 정정 · 연장 · 외근 · 일정)이 있다
  approvedExtraMin: number; // 승인된 연장 · 휴일근로 인정 분 — 일정 후 근무 · 일정 없는 날 근무를 덮는다
  waivedBreakMin: number; // 관리자가 표시한 「휴게 안 함」 분 — 늦은 출근 · 이른 퇴근을 덮는다
  clipStart?: string | null; // 일정 없는 날: 이 시각 전 근무는 세지 않는다 — 급여 계산과 같게 평소 근무 틀 시작 (급여-59 ①: 쉬는 날 특근은 08:00부터)
  breakCheck?: { start: string; end: string } | null; // 평소보다 일찍 퇴근한 날 — 이 휴게를 정말 했는지 담당자가 확인 (2026-11-03 의뢰인: 10/7 휴게 없이 일함). 「휴게 안 함」 표시가 있으면 넘기지 않는다
  lateRound?: LateRound; // 늦은 출근 끊기 (회사 설정 pay.late_round) — 급여 계산과 같게. 없으면 올림
  earlyIgnoreMin?: number; // 그날 유효한 「일찍 출근 — 확인 필요에서 빼는 시간」(분). 없으면 0 = 다 띄움
};

const MIN = 60_000;
const hm = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(11, 16);
// 초는 먼저 버린다 (확정-9, worktime.ts와 같게 — 05:00:39 출근은 05:00)
const ceilTo = (ms: number, step: number) => { const m = Math.floor(ms / MIN) * MIN; return step > 1 ? Math.ceil(m / (step * MIN)) * step * MIN : m; };
const floorTo = (ms: number, step: number) => (step > 1 ? Math.floor(ms / (step * MIN)) * step * MIN : Math.floor(ms / MIN) * MIN);

const minutesBetween = (s: string, e: string) => { const [a, b] = s.split(':').map(Number); const [c, d] = e.split(':').map(Number); return c * 60 + d - (a * 60 + b); };

/** [s, e) 구간의 분에서 휴게시간대와 겹친 분을 뺀다 */
function netMinutes(s: number, e: number, breaks: readonly [number, number][]): number {
  if (e <= s) return 0;
  let ms = e - s;
  for (const [bs, be] of breaks) ms -= Math.max(0, Math.min(e, be) - Math.max(s, bs));
  return Math.max(0, Math.round(ms / MIN));
}

/** 그날 상태 — 흐리게만 남은 것 · 한 달 1건으로 옮겨 간 것은 세지 않는다 */
function stateOf(parts: readonly CheckPart[]): CheckState | null {
  const live = parts.filter((p) => !p.quiet && !p.bundled);
  return live.some((p) => p.state === 'block') ? 'block' : live.some((p) => p.state === 'decide') ? 'decide' : live.length ? 'confirm' : null;
}

export function judgeDay(a: DayCheckInput): DayCheck {
  const parts: CheckPart[] = [];
  const out = (): DayCheck => ({ workDate: a.workDate, state: stateOf(parts), parts });
  if (a.deemed) return out();
  const done = a.pairs.filter((p): p is { in: Date; out: Date } => !!p.in && !!p.out);
  const ins = a.pairs.filter((p) => p.in).map((p) => (p.in as Date).getTime());
  const breaks = a.breaks.map((b) => [kstDateTime(a.workDate, b.start).getTime(), kstDateTime(a.workDate, b.end).getTime()] as [number, number]);
  const step = a.roundStepMin;

  if (a.pending) parts.push({ kind: 'pending_request', minutes: 0, covered: 0, state: 'block' });
  if (a.recordError) parts.push({ kind: 'record_error', minutes: 0, covered: 0, state: 'block' });
  if (a.missing === 'out') parts.push({ kind: 'missing_out', minutes: 0, covered: 0, state: 'block' });
  if (a.missing === 'in') parts.push({ kind: 'missing_in', minutes: 0, covered: 0, state: 'decide' });

  if (a.fullLeave) {
    if (ins.length) parts.push({ kind: 'leave_day_punch', minutes: 0, covered: 0, state: 'decide' });
    return out();
  }

  // 덮는 승인 — 분 단위로 앞 구간부터 쓴다. 일부만 덮으면 남은 분이 판단 필요
  let extra = Math.max(0, a.approvedExtraMin);
  let waived = Math.max(0, a.waivedBreakMin);
  const push = (kind: CheckKind, minutes: number, pool: 'extra' | 'waived' | null, at: Pick<CheckPart, 'plan' | 'punched' | 'counted'>) => {
    if (minutes <= 0) return;
    let covered = 0;
    if (pool === 'extra') { covered = Math.min(extra, minutes); extra -= covered; }
    if (pool === 'waived') { covered = Math.min(waived, minutes); waived -= covered; }
    parts.push({ kind, minutes, covered, state: covered >= minutes ? 'confirm' : 'decide', ...at });
  };

  if (!a.plan) {
    // 쉬는 날 · 일정 없는 날 근무 — 계산 시각으로 센 근무 분 전부
    const clip = a.clipStart ? kstDateTime(a.workDate, a.clipStart).getTime() : null;
    const worked = done.reduce((n, p) => { const s = clip !== null && p.in.getTime() <= clip ? clip : ceilTo(p.in.getTime(), step); return n + netMinutes(s, floorTo(p.out.getTime(), step), breaks); }, 0);
    if (worked > 0) push('no_plan_work', worked, 'extra', {});
    return out();
  }

  const start = kstDateTime(a.workDate, a.plan.startTime).getTime();
  const end = kstDateTime(a.workDate, a.plan.endTime).getTime();
  if (ins.length) {
    const first = Math.floor(Math.min(...ins) / MIN) * MIN;
    // 일정 시작 전(포함)에 오면 계산은 일정 시작부터 — 시작이 끊는 단위에 맞지 않아도(07:40) 늦은 출근이 아니다 (2026-11-03 의뢰인)
    const up = ceilTo(first, step);
    const c = first <= start ? (up > start ? start : up) : a.lateRound === 'minute' ? first : a.lateRound === 'floor' ? Math.max(start, floorTo(first, step)) : up;
    const at = { plan: a.plan.startTime.slice(0, 5), punched: hm(new Date(first)), counted: hm(new Date(c)) };
    if (c < start) {
      push('before_start', netMinutes(c, start, breaks), null, at); // 일찍 시작을 덮는 요청은 없다 — 일정 변경으로만 기준이 바뀐다
      const last = parts[parts.length - 1];
      if (last?.kind === 'before_start' && last.minutes <= Math.max(0, a.earlyIgnoreMin ?? 0)) last.quiet = true;
    }
    if (c > start) push('late_in', netMinutes(start, Math.min(c, end), breaks), 'waived', at);
  }
  const open = a.pairs.some((p) => p.in && !p.out);
  if (!open && done.length) {
    const last = Math.max(...done.map((p) => p.out.getTime()));
    const f = floorTo(last, step);
    const at = { plan: a.plan.endTime.slice(0, 5), punched: hm(new Date(last)), counted: hm(new Date(f)) };
    if (f < end) push('early_out', netMinutes(Math.max(f, start), end, breaks), 'waived', at);
    if (f > end) push('after_end', netMinutes(end, f, breaks), 'extra', at);
    // 저녁 휴게를 가로질러 일했고 평소보다 일찍 나간 날 — 앱은 휴게를 뺐지만 실제로 쉬었는지는 모른다
    const bc = a.breakCheck;
    if (bc && f > kstDateTime(a.workDate, bc.end).getTime() && Math.min(...ins) < kstDateTime(a.workDate, bc.start).getTime()) {
      parts.push({ kind: 'break_check', minutes: minutesBetween(bc.start, bc.end), covered: 0, state: 'decide', plan: `${bc.start}–${bc.end}` });
    }
  }
  return out();
}

/** 한 달 1건 — 일정 확인 필요(같은 시간대로 매일 일찍 옴) · 일찍 출근 묶음(기준 넘은 날들) */
export type MonthKind = 'schedule_check' | 'early_bundle';
export type MonthCheck = { kind: MonthKind; month: string; dates: string[]; fromMin: number; toMin: number; patternDays: number; workedDays: number };
/** 「비슷한 분」 = 15분 폭 안 (2026-11-03 의뢰인: 정재호 님 30~45분) · 「80% 이상」 = 그달 일정 있고 출근한 날 기준 */
export const PATTERN_WINDOW_MIN = 15;
export const PATTERN_SHARE = 0.8;

export function bundleMonth(month: string, days: readonly DayCheck[], workedDays: number, patternMinEarly = 0): { days: DayCheck[]; monthly: MonthCheck[] } {
  const early = days.flatMap((d) => d.parts.filter((p) => p.kind === 'before_start').map((p) => ({ date: d.workDate, minutes: p.minutes, quiet: !!p.quiet })));
  const steady = early.filter((e) => e.minutes >= patternMinEarly); // 「매일 30분 이상」 — 이보다 적게 일찍 온 날은 일정 확인 필요의 근거가 아니다 (회사 설정 check.pattern_min_early)
  if (!early.length) return { days: [...days], monthly: [] };
  // 가장 많은 날이 들어가는 15분 폭
  let best = { from: 0, n: 0 };
  for (const m of [...new Set(steady.map((e) => e.minutes))].sort((x, y) => x - y)) {
    const n = steady.filter((e) => e.minutes >= m && e.minutes <= m + PATTERN_WINDOW_MIN).length;
    if (n > best.n) best = { from: m, n };
  }
  const pattern = workedDays > 0 && best.n / workedDays >= PATTERN_SHARE;
  const inWindow = (e: { minutes: number }) => e.minutes >= best.from && e.minutes <= best.from + PATTERN_WINDOW_MIN;
  const take = (e: { minutes: number; quiet: boolean }) => !e.quiet || (pattern && e.minutes >= patternMinEarly && inWindow(e));
  const picked = early.filter(take);
  if (!picked.length) return { days: [...days], monthly: [] };
  const dates = [...new Set(picked.map((e) => e.date))].sort();
  const mins = picked.map((e) => e.minutes);
  const item: MonthCheck = { kind: pattern ? 'schedule_check' : 'early_bundle', month, dates, fromMin: pattern ? best.from : Math.min(...mins), toMin: pattern ? Math.max(...steady.filter(inWindow).map((e) => e.minutes)) : Math.max(...mins), patternDays: pattern ? best.n : 0, workedDays };
  const out = days.map((d) => {
    if (!dates.includes(d.workDate)) return d;
    const parts = d.parts.map((p) => (p.kind === 'before_start' && take({ minutes: p.minutes, quiet: !!p.quiet }) ? { ...p, bundled: true } : p));
    return { ...d, parts, state: stateOf(parts) };
  });
  return { days: out, monthly: [item] };
}

/** 여러 날을 직원 줄 숫자로 — 근태 마감 · 근태 점검 · 이상자 관리가 같은 숫자를 쓰게 한 곳에서 센다 */
export function countDays(days: readonly DayCheck[], handled: ReadonlySet<string> = new Set(), monthly: readonly MonthCheck[] = []): { block: number; decide: number; confirm: number; monthly: number; open: number; top: CheckKind | MonthKind | null } {
  let block = 0, decide = 0, confirm = 0;
  const kinds = new Map<CheckKind, number>();
  for (const d of days) {
    if (!d.state) continue;
    // 처리한 날은 빠진다. 막음은 처리 표시로 풀리지 않는다 — 기록을 고쳐야 한다
    if (d.state !== 'block' && handled.has(d.workDate)) continue;
    if (d.state === 'block') block++;
    else if (d.state === 'decide') decide++;
    else confirm++;
    for (const p of d.parts) if (!p.quiet && !p.bundled && (p.state !== 'confirm' || d.state === 'confirm')) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
  }
  // 한 달 1건은 판단 필요 1건으로 센다 — 처리 표시는 'YYYY-MM:종류'로 (마감을 막는다)
  const openMonthly = monthly.filter((m) => !handled.has(`${m.month}:${m.kind}`));
  const month = openMonthly.length;
  const dayTop = [...kinds].sort((x, y) => y[1] - x[1] || CHECK_KINDS.indexOf(x[0]) - CHECK_KINDS.indexOf(y[0]))[0]?.[0] ?? null;
  // 대표 사유: 막음이 있으면 그날 사유, 아니면 한 달 1건(판단 필요)이 먼저
  const top = block ? dayTop : (openMonthly[0]?.kind ?? dayTop);
  return { block, decide, confirm, monthly: month, open: block + decide + confirm + month, top };
}
