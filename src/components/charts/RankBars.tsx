'use client';
// 순위 가로 막대 (2026-10-27 의뢰인: 휴가 리포트 「종류별 사용」 — 이름 칸만 넓고 숫자는 몰려 있고 줄이 안 맞는다).
// 이름이 긴 항목(휴가 종류 · 부서)을 크기순으로 비교할 때만 쓴다 — 세로 막대로는 이름이 들어가지 않는다.
// 머리글이 있는 표처럼 칸을 맞춘다: 이름 | 막대 | 값 | 보조 칸들(오른쪽 맞춤, 폭 고정). 폰에서는 이름 · 값 한 줄 + 막대 + 보조 줄.
// 등장: 보일 때 위에서부터 차례로 왼쪽→오른쪽으로 자란다. 손을 대면 그 줄만 진하고 나머지는 옅어진다.
import { useState } from 'react';
import { C, useInView } from './base';

export type RankRow = { key: string; label: string; n: number; value: string; extra: string[] };

export function RankBars({ rows, head, ariaLabel }: { rows: RankRow[]; head: { label: string; value: string; extra: string[] }; ariaLabel: string }) {
  const [hot, setHot] = useState<number | null>(null);
  const [ref, inView] = useInView<HTMLDivElement>(0.1);
  const top = Math.max(1, ...rows.map((r) => r.n));
  const grid = 'lg:grid lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_6rem_5rem_6rem] lg:items-center lg:gap-5';
  return (
    <div ref={ref} role="table" aria-label={ariaLabel} className={`od-wait ${inView ? 'od-in' : ''} flex flex-col`} onPointerLeave={() => setHot(null)}>
      <div role="row" className={`hidden border-b border-border pb-2 text-xs font-medium text-muted ${grid}`}>
        <span role="columnheader">{head.label}</span>
        <span aria-hidden />
        <span role="columnheader" className="text-right">{head.value}</span>
        {head.extra.map((x) => (
          <span key={x} role="columnheader" className="text-right">{x}</span>
        ))}
      </div>
      {rows.map((r, i) => {
        const fade = hot !== null && hot !== i;
        return (
          <div
            key={r.key}
            role="row"
            className={`flex flex-col gap-1.5 border-b border-border/60 py-2.5 text-sm transition-opacity duration-200 last:border-b-0 ${grid}`}
            style={{ opacity: fade ? 0.45 : 1 }}
            onPointerEnter={() => setHot(i)}
          >
            <span role="cell" className="flex items-baseline justify-between gap-3">
              <span className="truncate">{r.label}</span>
              <span className="num shrink-0 font-semibold lg:hidden">{r.value}</span>
            </span>
            <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-rail">
              <span
                className="od-barx block h-full rounded-full"
                style={{
                  width: `${Math.max(1.5, (r.n / top) * 100)}%`,
                  background: i < 3 || hot === i ? `linear-gradient(to right, ${C.accent2}, ${C.accent})` : C.idle,
                  animationDelay: `calc(${(0.2 + i * 0.06).toFixed(2)}s * var(--od-t))`,
                }}
              />
            </span>
            <span role="cell" className="num hidden text-right font-semibold lg:block">{r.value}</span>
            {r.extra.map((x, j) => (
              <span key={j} role="cell" className="num hidden text-right text-muted lg:block">{x}</span>
            ))}
            <span className="num text-xs text-muted lg:hidden">{r.extra.map((x, j) => `${head.extra[j]} ${x}`).join(' · ')}</span>
          </div>
        );
      })}
    </div>
  );
}
