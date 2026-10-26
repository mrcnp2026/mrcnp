// PC 현황판 막대그래프 (2026-10-06 의뢰인 — 참고: 스샷/ 샤플 대시보드의 「이번 주 초과근무」).
//  · 이번 주 요일별 연장근로 시간 · 최근 14일 지각 — 둘 다 이 한 조각(BarCard)으로 그린다
//  · 맨 위 숫자 칸 4개는 KpiRow.tsx
// 색: 한 가지 계열(파랑)만 쓴다. 글자·숫자는 글자 색, 막대만 파랑. 막대에 마우스를 올리면 그날 값이 뜬다 (title).
// 문장은 부르는 쪽이 번역해서 넘긴다 (4-10).
import { CountUp } from '@/components/CountUp';
import { Card, CardTitle } from '@/components/ui';

/** n = 막대 높이를 정하는 값. text = 막대 위에 적을 글자 (없으면 n). sub = 날짜 아래 둘째 줄 (요일) */
export type Bar = { key: string; label: string; sub?: string; n: number; text?: string; tip: string };

export function BarCard({ title, unit, bars, empty, dense = false, className = '' }: { title: string; unit: string; bars: Bar[]; empty?: string; dense?: boolean; className?: string }) {
  const top = Math.max(1, ...bars.map((d) => d.n));
  const none = bars.every((d) => d.n === 0);
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <CardTitle aside={<span className="text-xs text-faint">{unit}</span>}>{title}</CardTitle>
      {none && empty && <p className="text-sm text-faint">{empty}</p>}
      {/* 바닥선은 칸마다가 아니라 전체에 한 줄 (2026-10-22 의뢰인: 날짜 위 줄이 일자가 아니다 — 칸 사이가 끊겨 보였다).
          막대 줄과 날짜 줄을 따로 두되 칸 너비 · 사이를 같게 해 세로로 맞춘다 */}
      {/* 폰: 모두 0이면 빈 그래프 칸을 빼고 한 줄 안내만 (2026-10-22 — 세로로 길기만 했다) */}
      <div className={`flex min-h-36 flex-1 flex-col ${none && empty ? "max-lg:hidden" : ""}`}>
        <ul className={`flex flex-1 items-stretch border-b border-border ${dense ? 'gap-1' : 'gap-1 lg:gap-3'}`}>
          {bars.map((d, i) => (
            <li key={d.key} title={d.tip} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {d.n > 0 && <CountUp value={d.text ?? d.n} className="num text-xs font-bold text-text" />}
              {/* 막대는 아래에서 차례로 자라 오른다 (fx-grow, 칸마다 0.09초씩 늦게) */}
              <span className={`fx-grow w-full rounded-t ${dense ? '' : 'max-w-12'} ${d.n > 0 ? 'bg-primary' : ''}`} style={{ height: `${(d.n / top) * 80}%`, animationDelay: `${i * 45}ms` }} />
            </li>
          ))}
        </ul>
        <ul className={`flex pt-1 ${dense ? 'gap-1' : 'gap-1 lg:gap-3'}`}>
          {bars.map((d, i) => (
            <li key={d.key} className="num flex min-h-4 min-w-0 flex-1 flex-col items-center text-xs leading-tight whitespace-nowrap text-muted">
              {/* 좁은 칸(dense): 날짜는 한 칸 건너 하나씩만 적는다 (마지막 날은 항상) */}
              <span>{!dense || (bars.length - 1 - i) % 2 === 0 ? d.label : ''}</span>
              {d.sub && <span className="text-faint">{d.sub}</span>}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

// ── 동그라미 그래프 · 선 그래프 (2026-10-11 의뢰인: "막대·선·동그라미 그래프로 집계를 볼 수 있는 현황판") ──
// 색만으로 뜻을 전하지 않는다 — 옆에 이름과 숫자를 항상 함께 적는다 (R-10-8).
export type Slice = { key: string; label: string; n: number; tone: 'primary' | 'warn' | 'danger' | 'muted' };
// 조각 색 (2026-10-22): 파랑 · 보조(노랑) · 옅은 회색(미출근) · 더 옅은 회색(휴무) — 초록 · 빨강을 쓰지 않는다. 조각마다 이름 · 숫자를 옆에 적는다. danger = 「문제」 조각이라 눈에 띄게 진한 회색
const STROKE = { primary: 'stroke-primary', warn: 'stroke-chart-extra', danger: 'stroke-chart-idle', muted: 'stroke-border' } as const;
const DOT = { primary: 'bg-primary', warn: 'bg-chart-extra', danger: 'bg-chart-idle', muted: 'bg-border' } as const;

/** 동그라미(고리) 그래프 — 가운데에 큰 숫자 하나, 오른쪽에 항목별 이름 · 숫자 · 비율 */
export function DonutCard({ title, unit, slices, center, centerLabel, className = '' }: { title: string; unit: string; slices: Slice[]; center: string; centerLabel: string; className?: string }) {
  const total = slices.reduce((a, s) => a + s.n, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <CardTitle aside={<span className="text-xs text-faint">{unit}</span>}>{title}</CardTitle>
      <div className="flex flex-1 items-center gap-6">
        <div className="relative size-36 shrink-0">
          {/* 조각은 시계 방향으로 쓸어 그리며 채워진다 (fx-sweep: 원뿔 모양 가림막이 0 → 한 바퀴). 다 채워지면 가림막이 전부 열려 이음새 · 쐐기 모양이 남지 않는다 (2026-10-26 의뢰인: 채운 뒤에도 뾰족한 쐐기가 남는다) */}
          <svg viewBox="0 0 100 100" className="fx-sweep size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={R} fill="none" strokeWidth="12" className="stroke-surface" />
            {total > 0 &&
              slices
                .filter((s) => s.n > 0)
                .map((s) => {
                  const len = (s.n / total) * C;
                  // 한 조각이 전부(100%)면 점선 없이 고리 전체로 그린다 — 점선의 끝 이음새가 맨 위에 가는 줄로 남았다. 조각 사이는 살짝 겹쳐 틈 줄이 생기지 않게 한다
                  const full = len >= C - 0.01;
                  const el = <circle key={s.key} cx="50" cy="50" r={R} fill="none" strokeWidth="12" strokeDasharray={full ? undefined : `${Math.min(C, len + 0.4)} ${C}`} strokeDashoffset={full ? undefined : -acc} className={STROKE[s.tone]} />;
                  acc += len;
                  return el;
                })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <CountUp value={center} className="num text-2xl font-bold" />
            <span className="text-xs text-faint">{centerLabel}</span>
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-2">
          {slices.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              <span aria-hidden className={`size-2.5 shrink-0 rounded-chip ${DOT[s.tone]}`} />
              <span className="min-w-0 flex-1 truncate text-muted">{s.label}</span>
              <CountUp value={s.n} className="num font-bold" />
              <span className="num w-12 shrink-0 text-right text-xs whitespace-nowrap text-faint">{total > 0 ? `${Math.round((s.n / total) * 100)}%` : '–'}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export type Point = { key: string; label: string; n: number; tip: string; dim?: boolean };

/** 선 그래프 — 날짜별 값 하나. 점마다 숫자를 적고, 쉬는 날(dim)은 점을 비운다 */
export function LineCard({ title, unit, points, className = '' }: { title: string; unit: string; points: Point[]; className?: string }) {
  const top = Math.max(1, ...points.map((p) => p.n));
  const W = 100;
  const H = 40;
  // 점은 날짜 칸의 가운데 — 아래 날짜 · 점 · 선이 같은 세로줄에 온다 (2026-10-22: 선은 양 끝, 점은 칸 가운데라 어긋났다)
  const x = (i: number) => ((i + 0.5) / Math.max(1, points.length)) * W;
  const y = (n: number) => H - (n / top) * (H - 6) - 2;
  const line = points.map((p, i) => `${x(i)},${y(p.n)}`).join(' ');
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <CardTitle aside={<span className="text-xs text-faint">{unit}</span>}>{title}</CardTitle>
      <div className="flex min-h-36 flex-1 flex-col">
        <div className="relative flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="fx-reveal absolute inset-0 size-full overflow-visible" aria-hidden>
            <polyline points={`${x(0)},${H} ${line} ${x(points.length - 1)},${H}`} className="fill-primary-tint" stroke="none" />
            {/* 선 · 면은 왼쪽부터 드러난다 (fx-reveal). 선 길이 방식(pathLength)은 굵기 고정(non-scaling-stroke)과 같이 쓰면 선이 끊겨 보였다 (2026-10-22 의뢰인: 그래프가 깨진다) */}
            <polyline points={line} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="stroke-primary" />
          </svg>
          <ul className="absolute inset-0 flex">
            {points.map((p, i) => (
              <li key={p.key} title={p.tip} className="fx-pop relative flex-1" style={{ animationDelay: `${150 + (i / Math.max(1, points.length)) * 900}ms` }}>
                <span className="num absolute left-1/2 -translate-x-1/2 -translate-y-full text-xs font-bold" style={{ top: `calc(${(y(p.n) / H) * 100}% - 4px)` }}>
                  {p.n === 0 ? '' : p.n}
                </span>
                <span aria-hidden className={`absolute left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-chip border-2 border-primary ${p.dim ? 'bg-bg' : 'bg-primary'}`} style={{ top: `${(y(p.n) / H) * 100}%` }} />
              </li>
            ))}
          </ul>
        </div>
        <ul className="flex border-t border-border pt-1">
          {points.map((p, i) => (
            <li key={p.key} className="num min-w-0 flex-1 text-center text-xs whitespace-nowrap text-muted">
              {(points.length - 1 - i) % 2 === 0 ? p.label : ''}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
