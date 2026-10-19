// 연차 사용 촉진의 법정 기간 (근로기준법 제61조, 2026-10-19 의뢰인 「아직 안 만든 기능」 #35). 순수함수.
// 1년 이상 연차: 1차 = 사용기간이 끝나기 6개월 전을 기준으로 10일 안에 남은 일수를 알리고 사용 시기를 정해 달라고 요구
//               → 직원은 받은 날부터 10일 안에 사용 시기를 알린다
//               → 2차 = 알리지 않으면 회사가 사용기간이 끝나기 2개월 전까지 사용 시기를 정해 서면으로 알린다
// 1년 미만(월차, 처음 생긴 9일 분): 1차 = 끝나기 3개월 전 기준 10일 안, 2차 = 끝나기 1개월 전까지.
//   (1년 미만 가운데 나중에 생긴 2일 분은 1개월 전 기준 5일 안 · 10일 전까지 — 여기서는 계산하지 않는다)
// ★ 「임시」 계산이다 — 노무 확인 전(검증 대기 기록). 프로그램은 촉진이 법적으로 끝났다고 판단하지 않는다.
export type PromotionKind = 'ANNUAL' | 'UNDER_ONE_YEAR';
export type PromotionSchedule = { firstFrom: string; firstTo: string; planDays: number; secondBy: string };

const addMonths = (d: string, m: number) => {
  const [y, mo, da] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + m, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(da, last))).toISOString().slice(0, 10);
};
export const addDaysIso = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** periodEnd = 연차를 쓸 수 있는 마지막 날(회계연도면 12월 31일) */
export function promotionSchedule(periodEnd: string, kind: PromotionKind): PromotionSchedule {
  const after = addDaysIso(periodEnd, 1); // 사용기간이 끝난 다음 날 — 「끝나기 n개월 전」의 기준
  const firstFrom = addMonths(after, kind === 'ANNUAL' ? -6 : -3);
  return { firstFrom, firstTo: addDaysIso(firstFrom, 9), planDays: 10, secondBy: addDaysIso(addMonths(after, kind === 'ANNUAL' ? -2 : -1), -1) };
}

/** 1차 통지를 보낸(보낼) 날 기준 직원의 계획 제출 기한 = 받은 날 + 10일 */
export const planDueFrom = (sentOn: string, s: PromotionSchedule) => addDaysIso(sentOn, s.planDays);

/** 날짜가 법정 기간과 맞는지 — 화면에 경고로만 쓴다(막지 않는다) */
export function scheduleWarnings(s: PromotionSchedule, at: { firstSentOn?: string | null; secondSentOn?: string | null }): ('first_early' | 'first_late' | 'second_late')[] {
  const out: ('first_early' | 'first_late' | 'second_late')[] = [];
  if (at.firstSentOn && at.firstSentOn < s.firstFrom) out.push('first_early');
  if (at.firstSentOn && at.firstSentOn > s.firstTo) out.push('first_late');
  if (at.secondSentOn && at.secondSentOn > s.secondBy) out.push('second_late');
  return out;
}
