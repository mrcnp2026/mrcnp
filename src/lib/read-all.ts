// PostgREST의 응답 행 제한과 조회 실패를 누락된 근태로 처리하지 않는다.
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>): Promise<{ data: T[] }> {
  const data: T[] = [];
  for (;;) {
    const result = await page(data.length, data.length + 499);
    if (result.error) throw new Error(`readAll: ${result.error.code ?? result.error.message}`);
    if (!result.data?.length) return { data };
    data.push(...result.data);
    // 한 쪽(500줄)보다 적게 왔으면 마지막 쪽이다 — 빈 쪽을 한 번 더 묻지 않는다 (2026-10-19 속도: 읽을 때마다 왕복이 한 번씩 더 있었다).
    // 운영 서버의 한 번 최대 줄 수는 1000(2026-10-19 확인)이라 적게 왔으면 끝이다. 다만 서버 한도가 100 · 200처럼 줄어 있을 수 있어
    // 딱 100 단위로 왔을 때만 한 번 더 확인한다
    if (result.data.length < 500 && result.data.length % 100 !== 0) return { data };
  }
}
