'use client';
// 세로 막대 (키트 · 시안 「출석 기준 실험실」 막대를 우리 앱에 맞게, 2026-10-27).
// 2차(같은 날 의뢰인: 「막대그래프가 제일 별로」): 마음에 들어 한 곡선 그래프와 같은 틀로 — 왼쪽 눈금 · 점선 눈금줄,
//   둥근 알약 막대 + 뒤에 옅은 빈 막대(바탕), 평균보다 많은 날만 초록 · 나머지는 차분한 베이지.
// 등장: 화면에 보이면 왼쪽부터 물결처럼 자라 오르고, 다 자라면 평균 점선이 깔린다.
// 손을 대면: 그 막대만 진해지고 나머지는 옅어지며, 위에 검은 말풍선(그날 값 · 평균과의 차이). 폰은 눌러서, 키보드는 ←→.
// 문장은 부르는 쪽이 번역해서 넘긴다 — vsAvg의 %d 자리에 평균과의 차이가 들어간다.
import { useState, type KeyboardEvent } from 'react';
import { C, niceMax, useInView } from './base';

/** skip: 평균에서 뺀다 (아직 오지 않은 달처럼 값이 없는 칸)
 *  short: 폰에서 대신 보일 짧은 이름 — 12달 막대에서 「10월11월12월」이 붙어 읽기 어려웠다 (2026-10-29 의뢰인) → 폰은 「10 11 12」 */
export type BarDatum = { key: string; label: string; short?: string; sub?: string; n: number; text?: string; tip: string; skip?: boolean };

/** focus: 이 막대만 초록(나머지 베이지) — 「고른 달」처럼 하나를 짚을 때. 없으면 평균보다 많은 막대가 초록 */
export function BarChart({ bars, dense = false, avgLabel, vsAvg, avgUnit = '', ariaLabel, focus, after = 0 }: { bars: BarDatum[]; dense?: boolean; avgLabel?: string; vsAvg?: string; avgUnit?: string; ariaLabel: string; focus?: number; after?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, inView] = useInView<HTMLDivElement>(0.25, after);
  const max = niceMax(Math.max(0, ...bars.map((d) => d.n)));
  const counted = bars.filter((d) => !d.skip);
  const avg = counted.length ? counted.reduce((a, d) => a + d.n, 0) / counted.length : 0;
  const k = bars.length;
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') setHover((v) => Math.min(k - 1, (v ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? k) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };
  const h = hover;
  const pct = (v: number) => `${(v / max) * 100}%`;
  const diff = h === null ? 0 : bars[h].n - avg;
  const ticks = [0, max / 2, max];
  // 눈금 숫자: 분 단위 막대(연장근로)처럼 text가 따로 있으면 생략 — 「120」 같은 분 숫자는 읽기 어렵다
  const showTicks = bars.every((d) => d.text === undefined);
  const w = dense ? 'max-w-3.5' : 'max-w-7';

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={key}
      onBlur={() => setHover(null)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
      className={`od-wait ${inView ? 'od-in' : ''} flex min-h-44 flex-1 rounded-button outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {showTicks && (
        <ul aria-hidden className="relative mt-6 mb-6 w-6 shrink-0">
          {ticks.map((v) => (
            <li key={v} className="num absolute right-1.5 translate-y-1/2 text-xs text-faint" style={{ bottom: pct(v) }}>
              {Math.round(v)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative mt-6 flex-1">
          {/* 점선 눈금줄 — 곡선 그래프와 같은 모양 */}
          {ticks.map((v) => (
            <span key={v} aria-hidden className={`absolute inset-x-0 border-t border-border ${v === 0 ? '' : 'border-dashed'}`} style={{ bottom: pct(v) }} />
          ))}
          <ul className={`absolute inset-0 flex items-stretch ${dense ? 'gap-0.5' : 'gap-1 lg:gap-2'}`}>
            {bars.map((d, i) => {
              const on = h === i;
              const high = focus === undefined ? d.n > 0 && d.n >= avg : i === focus;
              const fade = h !== null && !on;
              return (
                <li key={d.key} className="relative flex min-w-0 flex-1 cursor-pointer justify-center" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                  {/* 빈 막대(바탕) */}
                  <span aria-hidden className={`absolute inset-y-0 w-full rounded-full bg-rail transition-opacity duration-200 ${w}`} style={{ opacity: on ? 1 : 0.75 }} />
                  <span
                    className={`od-bar absolute bottom-0 w-full rounded-full transition-[opacity,box-shadow] duration-200 ${w}`}
                    style={{
                      height: pct(d.n),
                      minHeight: d.n > 0 ? (dense ? 6 : 8) : 0,
                      animationDelay: `calc(${(0.3 + i * (dense ? 0.03 : 0.07)).toFixed(3)}s * var(--od-t))`,
                      background: high || on ? `linear-gradient(to top, ${C.accent}, ${C.accent2})` : C.idle,
                      opacity: fade ? 0.35 : 1,
                      boxShadow: on ? `0 0 0 3px ${C.soft}` : undefined,
                    }}
                  />
                  {d.n > 0 && !dense && (
                    <span className="absolute transition-opacity duration-200" style={{ bottom: `calc(${pct(d.n)} + 6px)`, opacity: fade ? 0.3 : 1 }}>
                      <span className="num od-in-fade block text-xs font-bold text-muted" style={{ animationDelay: `calc(${(1 + i * 0.07).toFixed(2)}s * var(--od-t))` }}>
                        {d.text ?? d.n}
                      </span>
                    </span>
                  )}
                  {on && (
                    <div
                      className="pointer-events-none absolute z-10 rounded-button px-3 py-2 text-sm shadow-pop"
                      style={{
                        bottom: `calc(${pct(d.n)} + ${dense ? 10 : 28}px)`,
                        left: '50%',
                        transform: `translateX(${i > k * 0.7 ? '-90%' : i < k * 0.3 ? '-10%' : '-50%'})`,
                        background: C.ink,
                        color: C.onInk,
                      }}
                    >
                      <div className="num font-bold whitespace-nowrap">{d.tip}</div>
                      {vsAvg && avg > 0 && (
                        <div className="num mt-0.5 whitespace-nowrap opacity-75">
                          {vsAvg.replace('%d', `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.round(Math.abs(diff) * 10) / 10}${avgUnit}`)}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {avg > 0 && (
            <div className="od-in-fade pointer-events-none absolute inset-x-0 border-t border-dashed border-muted/70" style={{ bottom: pct(avg), animationDelay: 'calc(1.3s * var(--od-t))' }}>
              {avgLabel && <span className="num absolute right-0 bottom-1 rounded-chip bg-bg/90 px-1.5 text-xs text-muted">{avgLabel} {Math.round(avg * 10) / 10}{avgUnit}</span>}
            </div>
          )}
        </div>
        <ul className={`flex pt-1.5 ${dense ? 'gap-0.5' : 'gap-1 lg:gap-2'}`}>
          {bars.map((d, i) => (
            <li key={d.key} className={`num flex min-h-4 min-w-0 flex-1 flex-col items-center text-xs leading-tight whitespace-nowrap ${h === i ? 'font-bold text-text' : 'text-faint'}`}>
              {!dense || (k - 1 - i) % 2 === 0 || h === i ? (
                d.short ? (
                  <>
                    <span className="max-lg:hidden">{d.label}</span>
                    <span className="lg:hidden">{d.short}</span>
                  </>
                ) : (
                  <span>{d.label}</span>
                )
              ) : (
                <span />
              )}
              {d.sub && <span>{d.sub}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
