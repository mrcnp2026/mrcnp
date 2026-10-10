// 출근/퇴근 누락 목록 (의뢰인 2026-10-10: 시프티의 「출근/퇴근 누락 기록」처럼 — 관리자가 기간을 골라 누가 언제 빠뜨렸는지 본다). 순수함수.
// 직원 홈의 미기록 배너(missing-punch.ts)와 같은 기준이되, 직원·날짜마다 그날 일정(틀·날짜별 일정·반차 반영)으로 본다.
// ★ 이 목록은 보여 주기만 한다 — 빠진 기록을 채우는 길은 정정 요청·관리자 대리 입력뿐이다 (4-8).
import { kstDateTime } from '@/lib/time';
import type { PunchPair } from '@/lib/types';

export type MissingKind = 'in' | 'out';

/**
 * 한 직원의 하루: 출근 누락('in') · 퇴근 누락('out') · 해당 없음(null).
 *   · 퇴근 누락: 출근만 있고 퇴근이 없는데, 일정 끝(또는 그보다 늦은 출근 시각) + 유예 시간이 지났다
 *   · 출근 누락: 그날 일정이 있는데 출근 기록이 하나도 없고, 일정 시작 + 유예 분이 지났다. 하루 휴가·외근·간주 근무는 뺀다
 */
export function missingOfDay(args: {
  workDate: string;
  pairs: readonly PunchPair[];
  plan: { startTime: string; endTime: string } | null; // 그날 일정 (없으면 쉬는 날)
  deemed: boolean; // 간주 근무 — 찍지 않아도 된다
  excused: boolean; // 하루 전부 휴가이거나 승인된 외근·출장·재택
  now: Date;
  outGraceHours: number;
  inGraceMin: number;
}): MissingKind | null {
  const openIns = args.pairs.filter((p) => p.in && !p.out).map((p) => (p.in as Date).getTime());
  if (openIns.length > 0) {
    const endAt = args.plan ? kstDateTime(args.workDate, args.plan.endTime).getTime() : 0;
    const due = Math.max(endAt, ...openIns) + args.outGraceHours * 3_600_000;
    return args.now.getTime() > due ? 'out' : null;
  }
  if (!args.plan || args.deemed || args.excused || args.pairs.some((p) => p.in)) return null;
  const due = kstDateTime(args.workDate, args.plan.startTime).getTime() + args.inGraceMin * 60_000;
  return args.now.getTime() > due ? 'in' : null;
}

/** 기간 고르기: 잘못된 값은 기본(오늘까지 14일), 앞날은 오늘로, 너무 길면 끝에서 maxDays일로 줄인다 */
export function missingRange(fromRaw: string | undefined, toRaw: string | undefined, today: string, addDays: (d: string, n: number) => string, maxDays = 62): { from: string; to: string } {
  const ok = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  let to = ok(toRaw) ? toRaw : today;
  if (to > today) to = today;
  let from = ok(fromRaw) ? fromRaw : addDays(to, -13);
  if (from > to) from = to;
  if (from < addDays(to, -(maxDays - 1))) from = addDays(to, -(maxDays - 1));
  return { from, to };
}
