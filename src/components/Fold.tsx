// 접고 펴는 카드 (2026-10-16 의뢰인 디자인: 직원 상세가 길게 늘어져 개인 정보가 잘 안 보였다).
// 접혀 있을 때도 제목 아래 한 줄 요약이 보여서, 펴지 않고도 무엇이 들어 있는지 안다. 브라우저 기본 <details> — 스크립트 없이 동작.
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export function Fold({ title, summary, aside, open = false, id, children }: { title: ReactNode; summary?: ReactNode; aside?: ReactNode; open?: boolean; id?: string; children: ReactNode }) {
  return (
    <details id={id} open={open} className="group scroll-mt-20 rounded-card border border-border bg-bg lg:shadow-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-surface lg:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-bold">{title}</span>
          {summary && <span className="truncate text-sm text-muted group-open:hidden">{summary}</span>}
        </span>
        {aside}
        <ChevronDown aria-hidden size={20} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-4 py-4 lg:px-5">{children}</div>
    </details>
  );
}
