// 목록 페이지 나누기 — 순수함수 (화면: components/Pager.tsx)
export const PAGE_SIZE = 5;

/** 목록에서 지금 페이지 몫만 잘라 준다. 범위를 벗어난 번호는 처음·끝으로 */
export function pageOf<T>(list: T[], raw: string | undefined, size = PAGE_SIZE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(Math.max(1, Number.parseInt(raw ?? '1', 10) || 1), pages);
  return { items: list.slice((page - 1) * size, page * size), page, pages };
}
