import { describe, expect, it } from 'vitest';
import { pageOf } from '@/lib/paging';

describe('페이지 넘김 (2026-10-02)', () => {
  const list = [...Array(12)].map((_, i) => i + 1);
  it('5개씩, 번호가 이상하면 처음·끝으로', () => {
    expect(pageOf(list, undefined)).toEqual({ items: [1, 2, 3, 4, 5], page: 1, pages: 3 });
    expect(pageOf(list, '3').items).toEqual([11, 12]);
    expect(pageOf(list, '99').page).toBe(3);
    expect(pageOf(list, 'x').page).toBe(1);
    expect(pageOf([], '2')).toEqual({ items: [], page: 1, pages: 1 });
  });
});
