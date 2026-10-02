// 페이지 번호 — 긴 목록을 한 화면에 몇 개씩 끊어 보여 준다 (2026-10-02 의뢰인: 길게 내리지 않고 페이지 넘김).
// 주소(?키=번호)로 넘기므로 뒤로 가기·새로 고침에도 같은 페이지. 번호 칸은 44px 이상.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export { pageOf } from '@/lib/paging';

export function Pager({
  page,
  pages,
  param,
  params,
  anchor,
  label,
}: {
  page: number;
  pages: number;
  param: string; // 이 목록의 주소 키 (한 화면에 목록이 둘이면 서로 다른 키)
  params: Record<string, string | undefined>; // 지금 주소의 다른 값 (연습 보기 등)을 그대로 둔다
  anchor?: string;
  label: string;
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
      {[...Array(pages)].map((_, i) => {
        const n = i + 1;
        return n === page ? (
          <span key={n} aria-current="page" className={`num ${cell} bg-primary text-on-primary`}>
            {n}
          </span>
        ) : (
          <Link key={n} href={href(n)} scroll={false} className={`num ${cell} border border-border text-primary`}>
            {n}
          </Link>
        );
      })}
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
