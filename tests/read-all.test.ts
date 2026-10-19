import { expect, it } from 'vitest';
import { readAll } from '@/lib/read-all';
it('서버가 요청보다 적은 행을 반환해도 끝까지 읽는다', async () => {
  const rows = Array.from({ length: 1251 }, (_, id) => ({ id }));
  const result = await readAll(async (from, to) => ({ data: rows.slice(from, Math.min(to + 1, from + 100)), error: null }));
  expect(result.data).toEqual(rows);
});
it('중간 페이지 오류를 빈 데이터로 처리하지 않는다', async () => {
  // 첫 쪽이 꽉 차(500줄) 다음 쪽을 읽어야 하는데 그 쪽에서 오류
  await expect(readAll(async (from) => from ? { data: null, error: { code: 'offline' } } : { data: Array.from({ length: 500 }, (_, i) => i), error: null })).rejects.toThrow('offline');
});
it('쪽보다 적게 오면 빈 쪽을 다시 묻지 않는다 (2026-10-19 속도)', async () => {
  let calls = 0;
  const result = await readAll(async (from, to) => (calls++, { data: Array.from({ length: 37 }, (_, i) => i).slice(from, to + 1), error: null }));
  expect(result.data.length).toBe(37);
  expect(calls).toBe(1);
});
