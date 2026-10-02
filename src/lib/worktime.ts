// 근로시간 집계 (7-6). 순수함수 — 주간 상태는 밖에서 주입한다 (요점 3).
//
// 등식 (1.3판): regularMinutes + overtimeMinutes + holidayMinutes === netMinutes  (항상)
//              nightMinutes는 이 합에 더하지 않는다 — 같은 1분이 연장이면서 야간일 수 있다 (B-8)
// 금액은 다루지 않는다. 산출물은 분까지다 (4-4).

import { LABOR } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { FLAG } from '@/lib/flags';
import { kstDateTime, toKstDate } from '@/lib/time';
import type { DayType, PunchPair, WorkRule } from '@/lib/types';

export type WorkCalc = {
  grossMinutes: number; // 출근~퇴근 전체 (짝이 맞는 쌍만)
  breakMinutes: number; // 휴게시간대와 겹친 분만
  netMinutes: number; // gross - break
  regularMinutes: number; // 소정 (휴일이면 0)
  overtimeMinutes: number; // 연장 (휴일이면 0)
  holidayMinutes: number; // 휴일 근로 (휴일이 아니면 0)
  holidayWithin8Minutes: number;
  holidayOver8Minutes: number;
  nightMinutes: number; // 22:00~06:00 — 별도 축
  flags: string[];
};

export type WorkCtx = {
  workDate: string; // 휴게시간대를 어느 날짜에 놓을지 (그 근무일 KST 기준, 요점 1)
  dayType: DayType;
  weekRegularMinutesSoFar: number; // 그 주에 앞선 날들의 regularMinutes 합 (연장·휴일은 넣지 않는다)
  weekTotalMinutesSoFar: number; // 그 주에 앞선 날들의 regular+overtime+holiday 합 — 52시간 판정용 (요점 5)
};

type Iv = [number, number]; // [시작ms, 끝ms)

function subtract(ivs: Iv[], cut: Iv): Iv[] {
  const out: Iv[] = [];
  for (const [s, e] of ivs) {
    if (cut[1] <= s || cut[0] >= e) {
      out.push([s, e]);
      continue;
    }
    if (cut[0] > s) out.push([s, cut[0]]);
    if (cut[1] < e) out.push([cut[1], e]);
  }
  return out;
}

function overlapMs(ivs: Iv[], win: Iv): number {
  let ms = 0;
  for (const [s, e] of ivs) ms += Math.max(0, Math.min(e, win[1]) - Math.max(s, win[0]));
  return ms;
}

function sumMs(ivs: Iv[]): number {
  return ivs.reduce((a, [s, e]) => a + (e - s), 0);
}

/**
 * 야간 구간을 날짜마다 **두 조각**으로 만든다: [d 00:00, d 06:00) 과 [d 22:00, d+1 00:00).
 * 22:00~06:00을 한 조각으로 계산하면 자정에서 음수나 0이 된다 (요점 4, B-10).
 */
export function nightWindows(fromMs: number, toMs: number): Iv[] {
  const out: Iv[] = [];
  const last = toKstDate(new Date(toMs));
  for (let d = addDays(toKstDate(new Date(fromMs)), -1); d <= last; d = addDays(d, 1)) {
    out.push([kstDateTime(d, '00:00').getTime(), kstDateTime(d, LABOR.nightEnd).getTime()]);
    out.push([kstDateTime(d, LABOR.nightStart).getTime(), kstDateTime(addDays(d, 1), '00:00').getTime()]);
  }
  return out;
}

const toMin = (ms: number) => Math.floor(ms / 60_000);

export function calcWorkMinutes(pairs: PunchPair[], rule: WorkRule, ctx: WorkCtx): WorkCalc {
  const flags = new Set<string>();
  const work: Iv[] = [];
  for (const p of pairs) {
    // 4-8, 요점 6: 짝이 안 맞으면 0으로 조용히 넘기지 않고 flags에 남긴다
    if (p.in && !p.out) flags.add(FLAG.MISSING_OUT);
    else if (!p.in && p.out) flags.add(FLAG.ORPHAN_OUT);
    else if (p.in && p.out && p.out > p.in) work.push([p.in.getTime(), p.out.getTime()]);
  }

  // 요점 1: 휴게시간대와 실제 근무가 **겹친 분만** 뺀다. 휴게시간대가 없으면 공제 0.
  // 근무가 4시간 미만이면 공제하지 않는다 (labor-rules.ts breakDeductionMinGrossMin — 문서 모순을 메운 값)
  let net = work;
  if (rule.breakStart && rule.breakEnd && toMin(sumMs(work)) >= LABOR.breakDeductionMinGrossMin) {
    const brk: Iv = [
      kstDateTime(ctx.workDate, rule.breakStart).getTime(),
      kstDateTime(ctx.workDate, rule.breakEnd).getTime(),
    ];
    net = subtract(work, brk);
  }

  const grossMinutes = toMin(sumMs(work));
  const netMinutes = toMin(sumMs(net));
  const breakMinutes = grossMinutes - netMinutes;

  // 요점 1: 법정 최소치에 못 미치면 **더 빼지 않고** 표시만 (미검증 — 노무 확인 필요)
  const need = LABOR.legalBreak.find((b) => netMinutes >= b.workMin);
  if (need && breakMinutes < need.breakMin) flags.add(FLAG.LEGAL_BREAK_UNCONFIRMED);

  // 요점 2·3: 휴일이면 전부 휴일 축, 아니면 1일 8시간·주 40시간을 한 번만 센다
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let holidayMinutes = 0;
  if (ctx.dayType === 'holiday') {
    holidayMinutes = netMinutes;
  } else {
    const weekLeft = Math.max(0, LABOR.weeklyRegularLimitMin - ctx.weekRegularMinutesSoFar);
    regularMinutes = Math.min(netMinutes, LABOR.dailyRegularLimitMin, weekLeft);
    overtimeMinutes = netMinutes - regularMinutes;
  }
  const holidayWithin8Minutes = Math.min(holidayMinutes, LABOR.holidaySplitMin);
  const holidayOver8Minutes = holidayMinutes - holidayWithin8Minutes;

  // 요점 2·4: 야간은 휴게를 뺀 실근로 위에서 센다 (휴게가 야간과 겹치면 야간에서도 빠진다)
  let nightMs = 0;
  if (net.length > 0) {
    const from = Math.min(...net.map((i) => i[0]));
    const to = Math.max(...net.map((i) => i[1]));
    for (const w of nightWindows(from, to)) nightMs += overlapMs(net, w);
  }
  const nightMinutes = toMin(nightMs);

  // 요점 5: 주 52시간 초과는 막지 않고 표시만. 합계에 휴일근로 포함 (미검증)
  const todayTotal = regularMinutes + overtimeMinutes + (LABOR.weeklyTotalIncludesHoliday ? holidayMinutes : 0);
  if (ctx.weekTotalMinutesSoFar + todayTotal > OFFICE.weeklyLimitHours * 60) flags.add(FLAG.WEEKLY_LIMIT_EXCEEDED);

  return {
    grossMinutes,
    breakMinutes,
    netMinutes,
    regularMinutes,
    overtimeMinutes,
    holidayMinutes,
    holidayWithin8Minutes,
    holidayOver8Minutes,
    nightMinutes,
    flags: [...flags],
  };
}

export type WeekDayInput = {
  workDate: string;
  pairs: PunchPair[];
  dayType: DayType;
  flags?: string[]; // 짝짓기 단계의 flags (중복 출근 등)를 함께 싣는다
};

/**
 * 한 주를 **월요일부터 순서대로** 다시 계산한다.
 * ⚠️ 앞선 날이 정정되면 뒤쪽 날의 소정·연장이 전부 바뀐다. 정정 승인 후 하루만 다시 계산하면
 *    주 40시간 판정이 조용히 틀린다 (요점 3, B-25). 그래서 재계산은 항상 이 함수로 주 단위로 한다.
 * 결과에 weekRegularMinutesSoFar를 함께 싣는다 — 숫자가 이상할 때 날짜별로 한 줄씩 보려고 (9-6).
 */
export function calcWeek(
  days: WeekDayInput[],
  rule: WorkRule,
): (WorkCalc & { workDate: string; dayType: DayType; weekRegularMinutesSoFar: number })[] {
  const sorted = [...days].sort((a, b) => (a.workDate < b.workDate ? -1 : 1));
  let regSoFar = 0;
  let totalSoFar = 0;
  return sorted.map((d) => {
    const r = calcWorkMinutes(d.pairs, rule, {
      workDate: d.workDate,
      dayType: d.dayType,
      weekRegularMinutesSoFar: regSoFar,
      weekTotalMinutesSoFar: totalSoFar,
    });
    const row = {
      ...r,
      flags: [...new Set([...(d.flags ?? []), ...r.flags])],
      workDate: d.workDate,
      dayType: d.dayType,
      weekRegularMinutesSoFar: regSoFar,
    };
    regSoFar += r.regularMinutes;
    totalSoFar += r.regularMinutes + r.overtimeMinutes + (LABOR.weeklyTotalIncludesHoliday ? r.holidayMinutes : 0);
    return row;
  });
}
