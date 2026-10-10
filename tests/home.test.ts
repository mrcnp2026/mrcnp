// 홈: 현재 근무 상황 · 주 고르기 · 카드 켜고 끄기 (2026-10-11)
import { describe, expect, it } from 'vitest';
import { addDays, weekStartOf } from '@/lib/calendar';
import { homeCardsOn, homeCookieValue, pickWeek, workSituation, type SituationPerson } from '@/lib/home';

const P = (x: Partial<SituationPerson>): SituationPerson => ({ working: false, hasPlan: true, deemed: false, late: false, onLeave: false, ...x });

describe('workSituation', () => {
  it('한 사람이 여러 칸에 들어갈 수 있다', () => {
    const r = workSituation([P({ working: true, late: true }), P({ working: true, hasPlan: false }), P({ deemed: true }), P({ onLeave: true }), P({})]);
    expect(r).toEqual({ working: 2, unscheduled: 1, deemed: 1, late: 1, leave: 1 });
  });
  it('휴가인 간주 근무자는 간주근로로 세지 않는다 · 일정이 없어도 일하지 않으면 무일정이 아니다', () => {
    expect(workSituation([P({ deemed: true, onLeave: true }), P({ hasPlan: false })])).toEqual({ working: 0, unscheduled: 0, deemed: 0, late: 0, leave: 1 });
  });
});

describe('pickWeek', () => {
  const thisWeek = '2026-10-05';
  const pick = (raw?: string) => pickWeek(raw, thisWeek, weekStartOf, addDays);
  it('값이 없거나 잘못되면 이번 주', () => {
    expect(pick()).toBe(thisWeek);
    expect(pick('abc')).toBe(thisWeek);
  });
  it('그 날짜가 속한 주의 월요일', () => expect(pick('2026-09-30')).toBe('2026-09-28'));
  it('너무 멀면 범위 끝으로', () => {
    expect(pick('2020-01-01')).toBe(addDays(thisWeek, -84));
    expect(pick('2030-01-01')).toBe(addDays(thisWeek, 28));
  });
});

describe('홈 카드 켜고 끄기', () => {
  it('값이 없으면 전부 켜짐', () => expect(homeCardsOn(undefined).size).toBe(5));
  it('꺼 둔 것만 빠지고, 모르는 이름은 무시', () => {
    const on = homeCardsOn('week, note,xxx');
    expect([...on]).toEqual(['report', 'missing', 'situation']);
    expect(homeCookieValue(on)).toBe('week,note');
  });
});
