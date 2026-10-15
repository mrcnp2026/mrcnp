import { expect, it } from 'vitest';
import { readAll } from '@/lib/read-all';
it('서버가 요청보다 적은 행을 반환해도 끝까지 읽는다', async () => {
  const rows = Array.from({ length: 1251 }, (_, id) => ({ id }));
  const result = await readAll(async (from, to) => ({ data: rows.slice(from, Math.min(to + 1, from + 100)), error: null }));
  expect(result.data).toEqual(rows);
});
it('중간 페이지 오류를 빈 데이터로 처리하지 않는다', async () => {
  await expect(readAll(async (from) => from ? { data: null, error: { code: 'offline' } } : { data: [1], error: null })).rejects.toThrow('offline');
});
