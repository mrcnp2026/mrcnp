// Gemini 호출 재시도·대체 모델 (순수 — 서버 전용 표시 없음, 검사에서 직접 부른다).
// 2026-10-02 실측: 같은 모델이 몇 초 사이에 503("high demand") ↔ 200 을 오간다 → 한 번 실패로 포기하지 않는다.

/** 잠깐 뒤 다시 하면 될 수 있는 응답 (과부하·한도·서버 오류) */
export const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** 쉼표 목록 → 모델 이름들 (앞이 우선, 빈칸·중복 제거) */
export function modelList(primary: string | undefined, fallbacks: string | undefined): string[] {
  const all = [primary ?? '', ...(fallbacks ?? '').split(',')].map((s) => s.trim()).filter(Boolean);
  return [...new Set(all)];
}

export type Attempt = { model: string; status: number | 'error' };
export type CallResult<T> = { ok: true; value: T; model: string; attempts: Attempt[] } | { ok: false; attempts: Attempt[] };

/**
 * 모델마다 최대 `tries`번 — 다시 해볼 만한 실패면 쉬었다가 같은 모델, 아니면(404 등) 바로 다음 모델.
 * `call`은 HTTP 상태(실패) 또는 값(성공)을 돌려준다. 던지면 네트워크 실패로 보고 다시 해본다.
 * 전체 시간이 `budgetMs`를 넘으면 더 시작하지 않는다 (서버 함수 시간 제한 안).
 */
export async function callWithFallback<T>(
  models: string[],
  call: (model: string) => Promise<{ ok: true; value: T } | { ok: false; status: number | 'error' }>,
  opts: { tries?: number; backoffMs?: number[]; budgetMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<CallResult<T>> {
  const tries = opts.tries ?? 3;
  const backoff = opts.backoffMs ?? [1000, 2500];
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.budgetMs ?? 45_000);
  const attempts: Attempt[] = [];
  for (const model of models) {
    for (let i = 0; i < tries; i++) {
      if (now() >= deadline) return { ok: false, attempts };
      let r: Awaited<ReturnType<typeof call>>;
      try {
        r = await call(model);
      } catch {
        r = { ok: false, status: 'error' };
      }
      if (r.ok) return { ok: true, value: r.value, model, attempts };
      attempts.push({ model, status: r.status });
      if (r.status !== 'error' && !RETRYABLE.has(r.status)) break; // 404·400·403 — 이 모델은 다시 해도 안 된다
      if (i < tries - 1) await sleep(backoff[Math.min(i, backoff.length - 1)]);
    }
  }
  return { ok: false, attempts };
}
