// 지각 판정 (7-5). 순수함수 — DB도 네트워크도 건드리지 않는다.

import { hhmm, kstDateTime, toKstTime } from '@/lib/time';

export type LatenessInput = {
  punchedAt: Date;
  workDate: string;
  rule: { startTime: string; lateGraceMin: number; workdays: number[] };
  // 부르는 쪽이 dayType !== 'workday'로 넘긴다. 판정표를 두 군데 두지 않는다 (7-5 요점 2)
  isHoliday: boolean;
};

export type LatenessResult = {
  verdict: 'on_time' | 'late' | 'not_applicable';
  lateMinutes: number;
  lateSeconds: number; // 판정은 초 단위(09:10:01은 지각), 분은 내림 — 아래 주석
  reason: string; // 판정 근거 문장. 숫자만 있으면 틀렸을 때 왜 틀렸는지 모른다 (7-5 요점 3)
};

export function judgeLateness(i: LatenessInput): LatenessResult {
  if (i.isHoliday) {
    return {
      verdict: 'not_applicable',
      lateMinutes: 0,
      lateSeconds: 0,
      reason: `${i.workDate}은 근무일이 아님(휴일·휴무일) → 지각 판정 안 함`,
    };
  }

  const start = kstDateTime(i.workDate, i.rule.startTime);
  const deadline = new Date(start.getTime() + i.rule.lateGraceMin * 60_000);
  const actual = toKstTime(i.punchedAt);
  const base = `기준 ${hhmm(i.rule.startTime)} + 유예 ${i.rule.lateGraceMin}분 = ${toKstTime(deadline).slice(0, 5)}, 실제 ${actual}`;

  const diffMs = i.punchedAt.getTime() - deadline.getTime();
  if (diffMs <= 0) {
    return { verdict: 'on_time', lateMinutes: 0, lateSeconds: 0, reason: `${base} → 정시` };
  }

  // 13장: 지각은 실제 늦은 만큼만. 30분·1시간 단위로 올리지 않는다.
  // 1분이 안 되는 초는 내린다 — 올리면 실제보다 길게 잡혀 공제 근거가 부풀려진다.
  const lateSeconds = Math.floor(diffMs / 1000);
  const lateMinutes = Math.floor(lateSeconds / 60);
  return {
    verdict: 'late',
    lateMinutes,
    lateSeconds,
    reason: `${base} → ${lateMinutes}분 ${lateSeconds % 60}초 지각`,
  };
}
