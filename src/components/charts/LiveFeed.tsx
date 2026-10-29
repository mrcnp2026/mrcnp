'use client';
// 실시간 목록 (키트 LiveFeed · 시안 「실시간 출석」, 2026-10-27).
// 화면이 새로 읽힐 때(AutoRefresh) 처음 보는 줄은 위에서 밀고 들어오며 잠깐 옅은 초록 바탕이 깔렸다 사라진다.
// 처음 열 때는 위에서부터 한 줄씩 차례로 나타난다. 초록 점은 「지금 이어져 있다」 표시라 계속 숨쉰다.
// 왼쪽 네모는 사람마다 파스텔 색 하나(이름으로 정해져 늘 같은 색) — 시안의 반 이름 칸.
import { useEffect, useRef, useState } from 'react';
import { useInView } from './base';

export type FeedRow = { id: string; initial: string; seed: string; title: string; sub: string; right: string; tone?: 'ok' | 'warn' };


export function LiveFeed({ title, rows, empty, max = 7 }: { title: string; rows: FeedRow[]; empty: string; max?: number }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.1);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = rows.map((r) => r.id);
    if (seen.current) {
      const add = new Set(ids.filter((id) => !seen.current!.has(id)));
      setFresh(add);
    }
    seen.current = new Set(ids);
  }, [rows]);

  return (
    <div ref={ref} className={`od-wait ${inView ? 'od-in' : ''} flex flex-1 flex-col`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="od-live" aria-hidden />
        <h2 className="flex-1 text-base font-bold">{title}</h2>
      </div>
      {rows.length === 0 && <p className="py-4 text-center text-sm text-faint">{empty}</p>}
      <ul className="flex flex-col">
        {rows.slice(0, max).map((r, i) => (
          <li
            key={r.id}
            className={`flex items-center gap-3 rounded-button px-1.5 py-2 ${fresh.has(r.id) ? 'od-row-in' : 'od-in-fade'}`}
            style={{ borderTop: i ? '1px solid var(--t-color-border)' : undefined, animationDelay: fresh.has(r.id) ? undefined : `calc(${(0.2 + i * 0.07).toFixed(2)}s * var(--od-t))` }}
          >
            <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-chip bg-primary-tint text-xs font-bold text-primary`}>{r.initial}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{r.title}</span>
              <span className={`block truncate text-xs ${r.tone === 'warn' ? 'text-warn' : 'text-muted'}`}>{r.sub}</span>
            </span>
            <span className="num shrink-0 text-sm font-bold">{r.right}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
