// PostgREST의 응답 행 제한과 조회 실패를 누락된 근태로 처리하지 않는다.
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>): Promise<{ data: T[] }> {
  const data: T[] = [];
  for (;;) {
    const result = await page(data.length, data.length + 499);
    if (result.error) throw new Error(`readAll: ${result.error.code ?? result.error.message}`);
    if (!result.data?.length) return { data };
    data.push(...result.data);
  }
}
