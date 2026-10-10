// 오늘 상태 분류 (①-4 7-9 요점 8). 순수함수.
// 직원 홈의 상태 칩(부록 R-10-1)과 관리자 현황판(게이트 6)이 **같은 판정**을 쓴다 — 두 곳에 따로 두지 않는다.
// 현황판 전체(buildTodayBoard)는 게이트 6에서 이 함수 위에 만든다.
import { judgeLateness, type LatenessResult } from '@/lib/lateness';
import { kstDateTime } from '@/lib/time';
import type { DayType, PunchPair, WorkRule } from '@/lib/types';
import type { WorkKind } from '@/lib/work-requests';

export type DayStatus = 'working' | 'late' | 'absent' | 'done' | 'overtime' | 'off';

export type BoardPerson = {
  id: string;
  name: string;
  employeeNo: string | null;
  pairs: PunchPair[];
  firstInVerified: boolean | null; // 첫 출근의 사무실 확인 여부 (4-3: 미검증은 눈에 띄게)
  adminEntered: boolean; // 대리 등록 기록이 있는가 (요점 7, ②)
  weekMinutes: number | null; // 이번 주 누적 (요점 6)
  onLeave?: boolean; // 오늘 하루 전부 승인된 휴가 — 출근 기록이 없으면 미출근이 아니라 휴무 칸 (②-2 B-2)
  rule?: WorkRule | null; // 그 직원의 근무일정 틀을 끼운 규칙 (2026-10-10). 없으면 회사 규칙
  work?: WorkKind | null; // 오늘 승인된 외근·출장·재택 — 기록이 없어도 미출근이 아니고, 사무실 밖 경고 대신 "승인된 외근" (②-3 7-11)
};

export type BoardRow = Omit<BoardPerson, 'pairs'> & {
  status: DayStatus;
  firstIn: Date | null;
  lastOut: Date | null;
  late: boolean; // 칸과 별개의 지각 배지 (야근중 칸이어도)
  lateMinutes: number;
};

/**
 * 7-9 오늘 현황판. 한 사람은 한 칸에만 (요점 8). 숫자 칸은 5개(근무중·지각·미출근·퇴근·야근중), off는 접어 둔다.
 * 연습 기록 제외(요점 1)는 부르는 쪽이 기록을 읽을 때 한다.
 */
export function buildTodayBoard(args: {
  people: BoardPerson[];
  rule: WorkRule | null;
  dayType: DayType;
  workDate: string;
  now: Date;
}): Record<DayStatus, BoardRow[]> {
  const board: Record<DayStatus, BoardRow[]> = { working: [], late: [], absent: [], done: [], overtime: [], off: [] };
  for (const p of args.people) {
    const c = classifyDay({ pairs: p.pairs, rule: p.rule ?? args.rule, dayType: args.dayType, workDate: args.workDate, now: args.now });
    const { pairs: _pairs, ...rest } = p;
    void _pairs;
    const status: DayStatus = c.status === 'absent' && (p.onLeave || p.work) ? 'off' : c.status;
    board[status].push({
      ...rest,
      status,
      firstIn: c.firstIn,
      lastOut: c.lastOut,
      late: c.lateness?.verdict === 'late',
      lateMinutes: c.lateness?.verdict === 'late' ? c.lateness.lateMinutes : 0,
    });
  }
  for (const k of Object.keys(board) as DayStatus[]) board[k].sort((a, b) => a.name.localeCompare(b.name));
  return board;
}

/**
 * 한 사람은 한 칸에만. 위에서부터 먼저 맞는 칸 (7-9 요점 8):
 * 1 off(근무일 아님 + 출근 없음) → 2 done(퇴근까지 찍음) → 3 overtime(기준 퇴근 지남 + 퇴근 없음)
 * → 4 late → 5 working → 6 absent.
 * 지각 사실은 칸과 별개로 lateness에 남는다 (야근중 칸이어도 "지각" 배지).
 * 근무규칙이 아직 없으면(②의 설정 전) 지각·야근중을 판정하지 않는다 — 추측하지 않는다 (7-14와 같은 원칙).
 */
export function classifyDay(args: {
  pairs: PunchPair[];
  rule: WorkRule | null;
  dayType: DayType;
  workDate: string;
  now: Date;
}): { status: DayStatus; firstIn: Date | null; lastOut: Date | null; lateness: LatenessResult | null } {
  const ins = args.pairs.map((p) => p.in).filter((x): x is Date => !!x);
  const firstIn = ins.length ? new Date(Math.min(...ins.map((d) => d.getTime()))) : null;
  const open = args.pairs.some((p) => p.in && !p.out);
  const outs = args.pairs.map((p) => p.out).filter((x): x is Date => !!x);
  const lastOut = outs.length ? new Date(Math.max(...outs.map((d) => d.getTime()))) : null;

  const lateness =
    firstIn && args.rule
      ? judgeLateness({ punchedAt: firstIn, workDate: args.workDate, rule: args.rule, isHoliday: args.dayType !== 'workday' })
      : null;

  let status: DayStatus;
  if (args.dayType !== 'workday' && !firstIn) status = 'off';
  else if (firstIn && !open && lastOut) status = 'done';
  else if (firstIn && open && args.rule && args.now >= kstDateTime(args.workDate, args.rule.endTime)) status = 'overtime';
  else if (firstIn && lateness?.verdict === 'late') status = 'late';
  else if (firstIn) status = 'working';
  else status = 'absent';
  return { status, firstIn, lastOut, lateness };
}
