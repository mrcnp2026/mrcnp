'use client';
// 카드 안 목록의 쪽 넘김 — 한 쪽에 6개(기본), 넘으면 아래에 작은 쪽 표시 (2026-10-14 의뢰인: 홈 대시보드 카드는 6개만 보이고 나머지는 쪽 넘김, 쪽 표시는 예쁘게).
// 쪽 표시: ‹ · 점(지금 쪽은 길쭉한 파란 막대, 보기만) · 「1 / 3」 · ›. 쪽이 7개 이상이면 점 없이 숫자만. 누르는 곳은 화살표 둘(폰은 44px).
// 주소를 바꾸지 않는다 — 홈은 30초마다 새로 그려지므로 쪽을 화면 안에서만 기억한다.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

export const PER_CARD = 6;

export function MiniPager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  const t = useTranslations('common');
  if (pages <= 1) return null;
  const arrow = 'flex size-11 lg:size-7 items-center justify-center rounded-chip border border-border bg-bg text-muted hover:border-primary hover:text-primary disabled:border-transparent disabled:text-faint disabled:opacity-50';
  return (
    <nav aria-label={t('pages')} className="flex items-center justify-center gap-2 pt-2">
      <button type="button" aria-label={t('prevPage')} disabled={page <= 1} onClick={() => onPage(page - 1)} className={arrow}>
        <ChevronLeft aria-hidden size={14} strokeWidth={2} />
      </button>
      {pages <= 6 && (
        <span aria-hidden className="flex items-center gap-1.5">
          {[...Array(pages)].map((_, i) => (
            <span key={i} className={`h-1.5 rounded-chip transition-all! duration-350! ease-in-out! ${page === i + 1 ? 'w-5 bg-primary' : 'w-1.5 bg-border'}`} />
          ))}
        </span>
      )}
      <span className="num min-w-9 text-center text-xs text-faint">
        <b className="text-text">{page}</b> / {pages}
      </span>
      <button type="button" aria-label={t('nextPage')} disabled={page >= pages} onClick={() => onPage(page + 1)} className={arrow}>
        <ChevronRight aria-hidden size={14} strokeWidth={2} />
      </button>
    </nav>
  );
}

/** 목록 칸들(이미 그린 li)을 받아 한 쪽씩 보여 준다. 쪽 표시는 카드 맨 아래에 붙는다 */
export function PagedList({ items, per = PER_CARD, className = '' }: { items: ReactNode[]; per?: number; className?: string }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / per));
  const cur = Math.min(page, pages);
  return (
    <>
      <ul className={className}>{items.slice((cur - 1) * per, cur * per)}</ul>
      <MiniPager page={cur} pages={pages} onPage={setPage} />
    </>
  );
}
