// 관리자 「주 52시간 관리」 목록 (시프티 대조 우선 반영 ②)
import { describe, expect, it } from 'vitest';
import { weekLimitList } from '@/lib/week-limit';

const H = (h: number, m = 0) => h * 60 + m;
const L = { regularMin: H(40), cautionMin: H(48), limitMin: H(52) };
const p = (name: string, weekMinutes: number | null) => ({ id: name, name, employeeNo: name, weekMinutes });

describe('주 52시간 목록', () => {
  it('40시간을 넘긴 사람만, 많은 순, 48시간부터 주의 · 52시간 초과는 초과', () => {
    const rows = weekLimitList([p('가', H(40)), p('나', H(40, 1)), p('다', H(48)), p('라', H(52, 1)), p('마', null)], L);
    expect(rows.map((r) => [r.name, r.level])).toEqual([
      ['라', 'over'],
      ['다', 'caution'],
      ['나', 'normal'],
    ]);
  });
  it('남은 시간: 52시간까지, 넘으면 음수', () => {
    const [a, b] = weekLimitList([p('a', H(45, 30)), p('b', H(53))], L).sort((x, y) => x.minutes - y.minutes);
    expect(a.leftMinutes).toBe(H(6, 30));
    expect(b.leftMinutes).toBe(-H(1));
  });
});
