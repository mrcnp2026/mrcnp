// PostgREST의 응답 행 제한과 조회 실패를 누락된 근태로 처리하지 않는다.
const PAGE = 500;
const AHEAD = 4; // 첫 쪽이 꽉 차면 다음 쪽 4개를 한꺼번에 묻는다

type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>;

export async function readAll<T>(page: Page<T>): Promise<{ data: T[] }> {
  const data: T[] = [];
  const get = async (from: number) => {
    const result = await page(from, from + PAGE - 1);
    if (result.error) throw new Error(`readAll: ${result.error.code ?? result.error.message}`);
    return result.data ?? [];
  };
  // 첫 쪽
  const first = await get(0);
  data.push(...first);
  if (first.length === 0) return { data };
  // 한 쪽(500줄)보다 적게 왔으면 마지막 쪽이다 — 빈 쪽을 한 번 더 묻지 않는다 (2026-10-19 속도: 읽을 때마다 왕복이 한 번씩 더 있었다).
  // 운영 서버의 한 번 최대 줄 수는 1000(2026-10-19 확인)이라 적게 왔으면 끝이다. 다만 서버 한도가 100 · 200처럼 줄어 있을 수 있어
  // 딱 100 단위로 왔을 때는 받은 만큼에서 이어서 하나씩 읽는다(예전 방식 — 한도가 작으면 쪽 경계를 미리 알 수 없다)
  if (first.length < PAGE) {
    if (first.length % 100 !== 0) return { data };
    for (;;) {
      const more = await get(data.length);
      if (more.length === 0) return { data };
      data.push(...more);
      if (more.length < PAGE && more.length % 100 !== 0) return { data };
    }
  }
  // 첫 쪽이 꽉 찼다 = 서버가 500줄씩 준다. 다음 쪽들은 기다리지 않고 몇 개씩 한꺼번에 묻는다 (2026-10-19 속도: 한 달 출퇴근 1,300줄이면 3번을 차례로 기다렸다)
  for (;;) {
    const from = data.length;
    const pages = await Promise.all(Array.from({ length: AHEAD }, (_, i) => get(from + i * PAGE)));
    for (const p of pages) {
      data.push(...p);
      if (p.length < PAGE) return { data };
    }
  }
}
