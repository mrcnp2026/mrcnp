// 홈 화면의 순수 계산 (의뢰인 2026-10-11: 시프티 홈의 「현재 근무 상황」 · 주 고르기 · 홈 설정).
// 화면은 이 결과만 그린다.

/** 홈에서 켜고 끌 수 있는 카드. 「오늘 근무」(출퇴근 버튼)는 끌 수 없다 — 찍는 길이 사라지면 안 된다 */
export const HOME_CARDS = ['report', 'missing', 'situation', 'week', 'note'] as const;
export type HomeCard = (typeof HOME_CARDS)[number];
export const HOME_COOKIE = 'home_off'; // 꺼 둔 카드 이름을 쉼표로 (이 기기에만 저장)

/** 쿠키 값 → 켜진 카드. 모르는 이름은 무시하고, 값이 없으면 전부 켜짐 */
export function homeCardsOn(raw: string | undefined): Set<HomeCard> {
  const off = new Set((raw ?? '').split(',').map((x) => x.trim()));
  return new Set(HOME_CARDS.filter((k) => !off.has(k)));
}

/** 켜진 카드 → 쿠키 값 */
export function homeCookieValue(on: ReadonlySet<HomeCard>): string {
  return HOME_CARDS.filter((k) => !on.has(k)).join(',');
}

export type SituationPerson = {
  working: boolean; // 찍은 출근이 있고 아직 퇴근 전
  hasPlan: boolean; // 그날 일정이 있다
  deemed: boolean; // 간주 근무 (찍지 않아도 근무로 본다) — 찍은 기록이 없을 때만
  late: boolean; // 오늘 지각
  onLeave: boolean; // 하루 전부 휴가
};

/**
 * 「현재 근무 상황」 인원수. 한 사람이 여러 칸에 들어갈 수 있다 (지각하고 근무중).
 *   근무중 = 지금 일하는 사람(무일정 포함) · 무일정 = 그중 오늘 일정이 없는 사람 · 간주근로 · 지각 · 휴가
 * ★ 시프티의 「휴게」「조퇴」 칸은 없다 — 기준이 정해지지 않았다 (결정 문서 알-2)
 */
export function workSituation(people: readonly SituationPerson[]): { working: number; unscheduled: number; deemed: number; late: number; leave: number } {
  const n = (f: (p: SituationPerson) => boolean) => people.filter(f).length;
  return { working: n((p) => p.working), unscheduled: n((p) => p.working && !p.hasPlan), deemed: n((p) => p.deemed && !p.onLeave), late: n((p) => p.late), leave: n((p) => p.onLeave) };
}

export const WEEKS_BACK = 12;
export const WEEKS_AHEAD = 4;

/** 주 고르기: 주소의 날짜가 속한 주의 월요일. 잘못된 값은 이번 주, 너무 멀면 범위 끝으로 */
export function pickWeek(raw: string | undefined, thisWeek: string, weekStartOf: (d: string) => string, addDays: (d: string, n: number) => string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) return thisWeek;
  const w = weekStartOf(raw);
  const min = addDays(thisWeek, -7 * WEEKS_BACK);
  const max = addDays(thisWeek, 7 * WEEKS_AHEAD);
  return w < min ? min : w > max ? max : w;
}
