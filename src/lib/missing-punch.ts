// 미기록 배너 대상 찾기 (7-8). 순수함수 — 직원이 앱을 열 때 서버가 부른다.
//
// ★ 의뢰인 결정: 알림은 앱 화면 배너뿐이다. 푸시·문자·예약 작업(cron)을 만들지 않는다 (3장).
//   열 때 계산하므로 정해진 시각에 돌리는 작업이 필요 없다.
// ★ 배너를 띄웠다고 퇴근 처리하지 마라 (4-8). 이 함수는 아무것도 쓰지 않는다.

import { addDays } from '@/lib/calendar';
import { pairsByWorkDate } from '@/lib/pairs';
import { kstDateTime, toKstDate } from '@/lib/time';
import type { DayType, PunchCorrection, PunchEvent, PunchKind, WorkRule } from '@/lib/types';

export type MissingPunch = { workDate: string; kind: PunchKind; hasPendingRequest: boolean };

export function findMissingPunches(args: {
  employeeId: string;
  events: PunchEvent[]; // 최근 14일. 연습/운영 구분은 부르는 쪽이 운영 모드에 맞춰 거른다
  approvedCorrections: PunchCorrection[];
  pendingCorrections: PunchCorrection[];
  rule: WorkRule;
  dayTypes: Record<string, DayType>; // 확인할 날짜마다. 없는 날짜는 건너뛴다(판정 불가 → 추측하지 않음)
  now: Date;
  outGraceHours: number; // office.ts missingOutGraceHours
  inGraceMin: number; // office.ts missingInGraceMin
  joinedOn?: string | null; // 입사 전 날짜는 제외 (요점 3)
  lookbackDays?: number; // 기본 14
  fullLeaveDates?: Set<string>; // 하루 전부 승인된 휴가인 날 — 출근 미기록이 아니다 (②-2)
}): MissingPunch[] {
  const mine = args.events.filter((e) => e.employeeId === args.employeeId);
  const approved = args.approvedCorrections.filter((c) => c.employeeId === args.employeeId && c.status === 'approved');
  const byDate = pairsByWorkDate(mine, approved);
  const today = toKstDate(args.now);
  const lookback = args.lookbackDays ?? 14;

  const hasPending = (workDate: string, kind: PunchKind) =>
    args.pendingCorrections.some(
      (c) => c.employeeId === args.employeeId && c.status === 'pending' && c.workDate === workDate && c.kind === kind,
    );

  const out: MissingPunch[] = [];
  for (let i = lookback - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    if (args.joinedOn && d < args.joinedOn) continue;
    const day = byDate.get(d);
    const pairs = day?.pairs ?? [];

    // 요점 2 — 퇴근 미기록: 기준 퇴근(또는 그보다 늦은 출근 시각) + 유예가 지나도 짝이 되는 퇴근이 없다.
    // 출근이 기준 퇴근보다 늦으면(야간 근무) 출근 시각부터 유예를 잰다 — 일하는 중인 사람에게 배너를 띄우지 않게.
    // 승인된 add_missing 퇴근은 pairsByWorkDate가 이미 짝에 끼워 넣었다.
    const openIns = pairs.filter((p) => p.in && !p.out).map((p) => p.in as Date);
    if (openIns.length > 0) {
      const endAt = kstDateTime(d, args.rule.endTime).getTime();
      const lastIn = Math.max(...openIns.map((t) => t.getTime()));
      const due = Math.max(endAt, lastIn) + args.outGraceHours * 3_600_000;
      if (args.now.getTime() > due) out.push({ workDate: d, kind: 'out', hasPendingRequest: hasPending(d, 'out') });
    }

    // 요점 3 — 출근 미기록: workday에만. 휴일·휴무일은 제외. 판정표 값이 없는 날은 추측하지 않고 건너뛴다.
    // 오늘은 제외한다 — 오늘 출근은 첫 화면의 출근 버튼이 해결하므로 배너를 겹쳐 띄우지 않는다.
    if (d === today || args.dayTypes[d] !== 'workday' || args.fullLeaveDates?.has(d)) continue;
    const hasIn = pairs.some((p) => p.in);
    const due = kstDateTime(d, args.rule.startTime).getTime() + args.inGraceMin * 60_000;
    if (!hasIn && args.now.getTime() > due) {
      out.push({ workDate: d, kind: 'in', hasPendingRequest: hasPending(d, 'in') });
    }
  }
  return out;
}
