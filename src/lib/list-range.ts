// 목록의 기간 고르기 — 앞날도 고를 수 있는 목록용 (근무일정). 순수함수.
// 지난 날만 보는 목록(출퇴근기록·누락)은 missing-list.ts의 missingRange를 쓴다.
const ok = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** 잘못된 값은 기본 기간으로, 끝이 시작보다 이르면 시작 하루로, 너무 길면 시작에서 maxDays일까지로 줄인다 */
export function listRange(fromRaw: string | undefined, toRaw: string | undefined, def: { from: string; to: string }, addDays: (d: string, n: number) => string, maxDays = 31): { from: string; to: string } {
  const from = ok(fromRaw) ? fromRaw : def.from;
  let to = ok(toRaw) ? toRaw : from <= def.to ? def.to : from;
  if (to < from) to = from;
  const last = addDays(from, maxDays - 1);
  if (to > last) to = last;
  return { from, to };
}
