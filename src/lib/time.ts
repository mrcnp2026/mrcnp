// 시간 처리 (7-2). 순수함수.
//
// ⚠️ 서버(Vercel·Supabase)는 UTC로 돈다. "오늘"을 시간대 없이 계산하면 한국시간 오전 9시 이전 기록이
//    전부 전날로 잡힌다 (4-5, B-1). 그래서 모든 날짜 경계는 여기 함수를 거친다.
// ⚠️ getTimezoneOffset()을 쓰지 마라 — 실행 환경(PC·서버)마다 다르다 (7-2 요점 2).
//    Intl에 OFFICE.timezone을 명시해서 계산한다.

import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import type { HolidayRow, PunchEvent, PunchKind, WorkRule } from '@/lib/types';

export { addDays, isoWeekday, weekStartOf } from '@/lib/calendar';

const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: OFFICE.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function zonedParts(ts: Date) {
  const out: Record<string, string> = {};
  for (const p of partsFormat.formatToParts(ts)) out[p.type] = p.value;
  return out as { year: string; month: string; day: string; hour: string; minute: string; second: string };
}

/** 'YYYY-MM-DD' (사무실 시간대 기준) */
export function toKstDate(ts: Date): string {
  const p = zonedParts(ts);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 'HH:MM:SS' (사무실 시간대 기준) — 사람이 읽는 reason 문장용 */
export function toKstTime(ts: Date): string {
  const p = zonedParts(ts);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** 지금 시각. Date는 시간대가 없는 절대 시각이므로 그대로 쓴다 — 날짜로 바꿀 때만 toKstDate를 거친다 */
export function kstNow(): Date {
  return new Date();
}

// 그 시각에 사무실 시간대가 UTC에서 몇 ms 떨어져 있는가 (Intl로 측정)
function offsetMs(ts: Date): number {
  const p = zonedParts(ts);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - (ts.getTime() - ts.getUTCMilliseconds());
}

/** 'HH:MM' 또는 'HH:MM:SS' → 자정부터 초 */
export function timeToSeconds(time: string): number {
  const [h, m, s = 0] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/** 'HH:MM:SS' → 'HH:MM' (화면·문장용) */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** 사무실 시간대의 날짜 + 시각 → 절대 시각. 예: ('2026-10-05', '09:00') → 그날 한국시간 09:00 */
export function kstDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d) + timeToSeconds(time) * 1000;
  // 두 번 맞추는 이유: 서머타임이 있는 시간대로 바꿔도 경계에서 틀리지 않게 (서울은 지금 서머타임 없음)
  let ts = guess - offsetMs(new Date(guess));
  ts = guess - offsetMs(new Date(ts));
  return new Date(ts);
}

/** 지각 판정 대상인 근무일인가. 판정표(labor-rules.ts) 한 곳을 그대로 쓴다 (7-5 요점 2) */
export function isWorkday(d: string, rule: WorkRule, holidays: HolidayRow[]): boolean {
  return resolveDayType(d, rule, holidays) === 'workday';
}

/**
 * 근무일 결정 (6장 work_date 규칙).
 * - 출근: 찍은 시각의 사무실 날짜
 * - 퇴근: 짝이 없는 직전 출근의 work_date를 **상속**한다. 자정 넘긴 야근이 둘로 갈라지지 않게 (B-4)
 * - 짝 없는 퇴근: 퇴근 시각의 날짜. 이때 부르는 쪽(punch.ts)이 note='짝 없는 퇴근'을 남긴다 (7-2 요점 1)
 */
export function resolveWorkDate(
  kind: PunchKind,
  punchedAt: Date,
  openInEvent: Pick<PunchEvent, 'workDate'> | null,
): string {
  if (kind === 'out' && openInEvent) return openInEvent.workDate;
  return toKstDate(punchedAt);
}
