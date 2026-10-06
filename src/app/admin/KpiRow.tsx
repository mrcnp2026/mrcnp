'use client';
// PC 현황판 맨 위 숫자 칸 4개 — 같은 크기, 가장 먼저 읽히는 것.
// 누르면 아래 「오늘 직원 현황」 표가 그 사람들로 걸러진다 (2026-10-06 의뢰인: 출근율을 누르면 출근한 사람, 지각을 누르면 지각자, 미출근을 누르면 미출근자 이름).
// href가 있는 칸(처리할 일)은 그 화면으로 간다.
import Link from 'next/link';

export const BOARD_FILTER_EVENT = 'board-filter';
export type Kpi = { label: string; value: string; sub?: string; warn?: boolean; href?: string; filter?: 'in' | 'late' | 'absent' };

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="hidden grid-cols-4 gap-4 lg:grid">
      {kpis.map((k) => {
        const body = (
          <>
            <span className="text-sm text-muted">{k.label}</span>
            <span className={`num text-3xl leading-none font-extrabold ${k.warn ? 'text-warn' : 'text-text'}`}>{k.value}</span>
            <span className="num min-h-4 text-xs text-faint">{k.sub}</span>
          </>
        );
        const cls = 'flex flex-col gap-2 rounded-card bg-bg p-5 text-left';
        if (k.href)
          return (
            <Link key={k.label} href={k.href} className={cls}>
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
