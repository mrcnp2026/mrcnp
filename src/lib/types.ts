// 계산 모듈이 함께 쓰는 모양. DB 행(snake_case)을 그대로 쓰지 않고, 서버가 읽어서 이 모양으로 바꿔 넘긴다.
// 순수함수가 DB를 모르게 하려는 것이다 (7-5 요점 1).

export type DayType = 'workday' | 'rest_off' | 'holiday'; // 7-6 요점 7

export type WorkRule = {
  startTime: string; // 'HH:MM' 또는 'HH:MM:SS' (DB time 그대로)
  endTime: string;
  lateGraceMin: number;
  breakStart: string | null; // 1.3판: 휴게시간대. 둘 다 있거나 둘 다 null
  breakEnd: string | null;
  workdays: number[]; // ISO 1=월 … 7=일
  weeklyRestDay: number; // 주휴일 (기본 7=일)
};

export type HolidayRow = {
  date: string; // 'YYYY-MM-DD'
  kind: 'public' | 'company' | 'weekly_rest';
};

export type PunchKind = 'in' | 'out';

export type PunchEvent = {
  id: string;
  employeeId: string;
  kind: PunchKind;
  punchedAt: Date;
  workDate: string;
};

export type PunchCorrection = {
  id: string;
  correctionType: 'modify' | 'void' | 'add_missing';
  targetId: string | null;
  employeeId: string;
  workDate: string;
  kind: PunchKind | null;
  newPunchedAt: Date | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'; // cancelled: 승인됐다가 취소됨 (0016) — 집계에 쓰이지 않는다
};

/** 한 근무일 안의 출근–퇴근 한 쌍. 한쪽이 없으면 null — 0이나 추정값으로 채우지 않는다 (4-8). */
export type PunchPair = {
  in: Date | null;
  out: Date | null;
};
