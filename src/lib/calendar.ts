// 달력 날짜('YYYY-MM-DD') 계산. 시간대와 무관한 순수 날짜 연산만 둔다.
// 판정표(labor-rules.ts)와 시간 처리(time.ts)가 함께 쓰므로 어느 쪽도 import하지 않는다 (순환 방지).

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** ISO 요일: 1=월 … 7=일 */
export function isoWeekday(date: string): number {
  const [y, m, d] = parseDate(date);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일
  return js === 0 ? 7 : js;
}

/** 그 날짜가 속한 주의 월요일 (7-13 요점 1: 주의 시작은 월요일 00:00 KST) */
export function weekStartOf(date: string): string {
  return addDays(date, -(isoWeekday(date) - 1));
}
