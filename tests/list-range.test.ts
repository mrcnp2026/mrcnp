// 근무일정 목록의 기간 고르기 (2026-10-11)
import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/calendar';
import { listRange } from '@/lib/list-range';

const def = { from: '2026-10-05', to: '2026-10-11' };
describe('listRange', () => {
  it('값이 없거나 잘못되면 기본 기간', () => {
    expect(listRange(undefined, undefined, def, addDays)).toEqual(def);
    expect(listRange('abc', '2026-13-40', def, addDays)).toEqual(def);
  });
  it('앞날도 그대로 받는다', () => expect(listRange('2026-11-02', '2026-11-08', def, addDays)).toEqual({ from: '2026-11-02', to: '2026-11-08' }));
  it('시작만 앞날이면 그 하루', () => expect(listRange('2026-11-02', undefined, def, addDays)).toEqual({ from: '2026-11-02', to: '2026-11-02' }));
  it('끝이 시작보다 이르면 시작 하루', () => expect(listRange('2026-10-09', '2026-10-01', def, addDays)).toEqual({ from: '2026-10-09', to: '2026-10-09' }));
  it('너무 길면 시작에서 31일까지', () => expect(listRange('2026-10-01', '2026-12-31', def, addDays)).toEqual({ from: '2026-10-01', to: '2026-10-31' }));
});
