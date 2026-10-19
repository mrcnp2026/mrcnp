// 페이지 번호 — 긴 목록을 한 화면에 몇 개씩 끊어 보여 준다 (2026-10-02 의뢰인: 길게 내리지 않고 페이지 넘김).
// 주소(?키=번호)로 넘기므로 뒤로 가기·새로 고침에도 같은 페이지. 번호 칸은 44px 이상.
// 2026-10-19 디자인: 쪽이 많으면 번호가 두세 줄로 깔렸다 → 처음 · 지금 앞뒤 · 끝만 보이고 사이는 「…」. labelOf를 주면 번호 대신 「‹ 이름 ›」 한 줄(하루가 한 쪽인 기록 목록).
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export { pageOf } from '@/lib/paging';

/** 보일 쪽 번호 — 처음 · 지금 앞뒤 하나씩 · 끝, 사이는 0(「…」). 7쪽 이하면 전부 */
export function shown(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((n) => keep.add(n));
  const out: number[] = [];
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (out.length && n - out[out.length - 1] > 1) out.push(0);
    out.push(n);
  }
  return out;
}

export function Pager({
  page,
  pages,
  param,
  params,
  anchor,
  label,
  labelOf,
}: {
  page: number;
  pages: number;
  param: string; // 이 목록의 주소 키 (한 화면에 목록이 둘이면 서로 다른 키)
  params: Record<string, string | undefined>; // 지금 주소의 다른 값 (연습 보기 등)을 그대로 둔다
  anchor?: string;
  label: string;
  labelOf?: (n: number) => string; // 쪽마다 이름(예: 날짜) — 주면 번호 단추 대신 가운데에 이름 하나
}) {
  if (pages <= 1) return null;
  const href = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && k !== param) q.set(k, v);
    if (n > 1) q.set(param, String(n));
    const s = q.toString();
    return `?${s}${anchor ? `#${anchor}` : ''}`;
  };
  const cell = 'flex min-h-11 min-w-11 items-center justify-center rounded-button text-sm font-semibold';
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-center gap-1 pt-1">
      {page > 1 ? (
        <Link href={href(page - 1)} scroll={false} aria-label={`${page - 1}`} className={`${cell} text-primary`}>
          <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        </Link>
      ) : (
        <span className={`${cell} text-faint`} aria-hidden>
          <ChevronLeft size={20} strokeWidth={1.75} />
        </span>
      )}
      {labelOf ? (
        <span aria-current="page" className="num min-w-32 px-2 text-center text-base font-bold">
          {labelOf(page)}
          <span className="block text-xs font-normal text-faint">{page} / {pages}</span>
        </span>
      ) : (
      shown(page, pages).map((n, i) => {
        if (n === 0) return <span key={`gap${i}`} className={`${cell} text-faint`} aria-hidden>…</span>;
        return n === page ? (
          <span key={n} aria-current="page" className={`num ${cell} bg-primary text-on-primary`}>
            {n}
          </span>
        ) : (
          <Link key={n} href={href(n)} scroll={false} className={`num ${cell} border border-border text-primary`}>
            {n}
          </Link>
        );
      })
      )}
      {page < pages ? (
        <Link href={href(page + 1)} scroll={false} aria-label={`${page + 1}`} className={`${cell} text-primary`}>
          <ChevronRight aria-hidden size={20} strokeWidth={1.75} />
        </Link>
      ) : (
        <span className={`${cell} text-faint`} aria-hidden>
          <ChevronRight size={20} strokeWidth={1.75} />
        </span>
      )}
    </nav>
  );
}
