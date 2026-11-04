// 한 요청 한 번(lib/request-cache) — API에서도 같은 요청 안의 두 번째 호출은 DB를 다시 부르지 않는다 (2026-11-05)
import { describe, expect, it, vi } from 'vitest';

let current: object | null = null;
vi.mock('next/headers', () => ({
  headers: () => {
    if (!current) throw new Error('outside request');
    return current;
  },
}));
const { cache } = await import('@/lib/request-cache');

describe('request-cache', () => {
  it('같은 요청 · 같은 인자는 한 번, 다른 인자 · 다른 요청은 따로', async () => {
    const fn = vi.fn(async (a: string) => a + '!');
    const once = cache(fn);
    current = {};
    await Promise.all([once('x'), once('x'), once('y')]);
    expect(fn).toHaveBeenCalledTimes(2);
    current = {}; // 다음 요청
    await once('x');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('요청 밖(스크립트)에서는 매번 부른다 — 예전과 같다', async () => {
    const fn = vi.fn(async () => 1);
    const once = cache(fn);
    current = null;
    await once();
    await once();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
