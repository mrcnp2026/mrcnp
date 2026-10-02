// 설정 이력에서 그 날짜의 값 고르기 — 순수함수 (테스트용으로 따로 뺐다).
// "그 날짜 이전(포함)에 시작한 것 중 가장 최근". 미래 날짜 행은 오늘 판정에 영향이 없다 (② 4-1, B-1).

export function pickAt<T>(rows: { key: string; value: unknown; effective_from: string }[], key: string, onDate: string, fallback: T): T {
  let best: { value: unknown; effective_from: string } | null = null;
  for (const r of rows) {
    if (r.key !== key || r.effective_from > onDate) continue;
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best ? (best.value as T) : fallback;
}

/** 설정 화면의 기본 "언제부터" — 다음 달 1일 (② 7-1 요점 3: 한 달 안에 두 규칙이 섞이지 않게) */
export function nextMonthFirst(today: string): string {
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // m은 1부터라 그대로 다음 달
  return d.toISOString().slice(0, 10);
}
