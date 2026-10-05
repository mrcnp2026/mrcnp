// 관리자 「기록」 › 직원 한 명의 날짜별 기록 (2026-10-05 시프티·샤플 대조: 두 제품 모두 직원×날짜 화면이 있다).
// 순수함수 — 화면이 그릴 값만 만든다. 판정은 새로 만들지 않고 기존 함수(period·lateness·leave)를 그대로 쓴다.
import { judgeLateness } from '@/lib/lateness';
import { isFullDayLeave, type LeaveOnDay } from '@/lib/leave';
import type { DayRow } from '@/lib/period';
import type { DayType, PunchCorrection, PunchKind, WorkRule } from '@/lib/types';
import type { WorkKind } from '@/lib/work-requests';

export type DayDetail = {
  workDate: string;
  dayType: DayType;
  firstIn: Date | null;
  lastOut: Date | null;
  open: boolean; // 출근만 있고 퇴근이 없다
  netMinutes: number;
  extraMinutes: number; // 연장 + 휴일
  lateMinutes: number; // 0이면 지각 아님
  leave: LeaveOnDay[];
  work: WorkKind | null;
  outside: boolean; // 첫 출근이 사무실 밖(미확인)이고 승인된 외근도 아니다
  corrected: boolean; // 직원 요청으로 승인된 정정이 있다
  pendingCorrection: boolean;
  proxy: boolean; // 관리자가 대신 넣은 기록이 있다 (②-3 7-6 요점 3: 화면에 보여야 한다)
  missing: PunchKind | null; // 'in' = 근무일인데 기록 없음(결근 후보), 'out' = 퇴근 미기록
  canAdd: PunchKind[]; // 대리 등록으로 넣을 수 있는 종류
};

/** 관리자가 대신 넣은 기록인가 — 요청자가 본인이 아닌, 승인된 '빠진 기록 추가' */
export const isProxyCorrection = (c: Pick<PunchCorrection, 'correctionType' | 'status' | 'employeeId'> & { requestedBy: string }) =>
  c.correctionType === 'add_missing' && c.status === 'approved' && c.requestedBy !== c.employeeId;

export function buildDayDetails(args: {
  days: DayRow[]; // 그 직원의 기간 계산 (daysFor)
  events: { workDate: string; kind: PunchKind; punchedAt: Date; ipVerified: boolean }[]; // 그 직원의 원본 기록
  corrections: (PunchCorrection & { requestedBy: string })[]; // 그 직원의 정정 (모든 상태)
  leave: Map<string, LeaveOnDay[]>;
  work: Map<string, WorkKind>;
  ruleAt: (date: string) => WorkRule | null;
  today: string;
  startsOn: string; // 입사일(없으면 계정 만든 날) — 그 전 날짜는 기록 없음으로 세지 않는다
}): DayDetail[] {
  const out: DayDetail[] = [];
  for (const d of args.days) {
    if (d.workDate > args.today) continue;
    const ins = d.pairs.map((p) => p.in).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
    const outs = d.pairs.map((p) => p.out).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
    const open = d.pairs.some((p) => p.in && !p.out);
    const leave = args.leave.get(d.workDate) ?? [];
    const work = args.work.get(d.workDate) ?? null;
    const mine = args.corrections.filter((c) => c.workDate === d.workDate);
    const hasRecord = d.pairs.length > 0 || args.events.some((e) => e.workDate === d.workDate);
    const expected = d.dayType === 'workday' && d.workDate >= args.startsOn;
    if (!hasRecord && !expected && leave.length === 0 && !work && mine.length === 0) continue;

    const rule = args.ruleAt(d.workDate);
    const late = ins[0] && d.dayType === 'workday' && rule ? judgeLateness({ punchedAt: ins[0], workDate: d.workDate, rule, isHoliday: false }) : null;
    const firstInEvent = args.events.filter((e) => e.workDate === d.workDate && e.kind === 'in').sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime())[0];
    const past = d.workDate < args.today;

    let missing: PunchKind | null = null;
    if (expected && ins.length === 0 && past && !isFullDayLeave(leave) && !work) missing = 'in';
    else if (open && past) missing = 'out';

    const canAdd: PunchKind[] = [];
    if (ins.length === 0) canAdd.push('in');
    // 오늘 근무 중인 사람의 퇴근은 넣지 않는다 — 본인이 아직 찍을 수 있다
    if (outs.length === 0 && past) canAdd.push('out');

    out.push({
      workDate: d.workDate,
      dayType: d.dayType,
      firstIn: ins[0] ?? null,
      lastOut: outs[outs.length - 1] ?? null,
      open,
      netMinutes: d.netMinutes,
      extraMinutes: d.overtimeMinutes + d.holidayMinutes,
      lateMinutes: late?.verdict === 'late' ? late.lateMinutes : 0,
      leave,
      work,
      outside: !!firstInEvent && !firstInEvent.ipVerified && !work,
      corrected: mine.some((c) => c.status === 'approved' && !isProxyCorrection(c)),
      pendingCorrection: mine.some((c) => c.status === 'pending'),
      proxy: mine.some(isProxyCorrection),
      missing,
      canAdd,
    });
  }
  return out;
}
