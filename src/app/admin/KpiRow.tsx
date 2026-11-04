'use client';
// 현황판 맨 위 숫자 칸 4개 — 한 판을 선으로 나눈 숫자 칸 (2026-10-28 taste 기준: 「지표는 색 칸이 아니라 글자」).
// 예전의 파스텔 타일 4색 · 칸 안의 작은 추세선은 뺐다. 색은 봐야 할 숫자(warn)에만, 바탕은 화면과 같은 판 하나.
// 숫자는 0에서 올라간다. 누르면 아래 「오늘 직원 현황」 표가 그 사람들로 걸러진다 (2026-10-06 의뢰인). href가 있는 칸(처리할 일)은 그 화면으로 간다.
// 폰에서는 2칸 × 2줄.
import Link from 'next/link';
import { CountUp } from '@/components/CountUp';

export const BOARD_FILTER_EVENT = 'board-filter';
export type Kpi = { label: string; value: string; sub?: string; warn?: boolean; href?: string; filter?: 'in' | 'late' | 'absent'; trend?: number[] };

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-card border border-border bg-bg lg:grid-cols-4">
      {kpis.map((k, i) => {
        const body = (
          <>
            <span className="text-sm text-muted">{k.label}</span>
            <CountUp value={k.value} className={`num text-2xl leading-none font-bold tracking-tight lg:text-3xl ${k.warn ? 'text-warn' : 'text-text'}`} />
            <span className="num min-h-4 text-xs text-muted">{k.sub}</span>
          </>
        );
        // 칸 사이는 1px 선 — 폰(2칸)은 오른쪽 칸에 왼쪽 선 · 둘째 줄에 위 선, PC(4칸)는 둘째 칸부터 왼쪽 선
        const cls = `flex flex-col gap-2 p-4 text-left lg:p-5 ${i % 2 === 1 ? 'border-l border-border' : ''} ${i >= 2 ? 'max-lg:border-t max-lg:border-border lg:border-l lg:border-border' : ''} ${
          k.href || k.filter ? 'transition-colors duration-300 hover:bg-surface focus-visible:bg-surface' : ''
        }`;
        if (k.href)
          return (
            <Link prefetch={false} key={k.label} href={k.href} className={cls}>
              {body}
            </Link>
          );
        if (k.filter)
          return (
            <button key={k.label} type="button" className={cls} onClick={() => window.dispatchEvent(new CustomEvent(BOARD_FILTER_EVENT, { detail: k.filter }))}>
              {body}
            </button>
          );
        return (
          <div key={k.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
