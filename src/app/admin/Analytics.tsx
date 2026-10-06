// PC 현황판 분석 영역 (2026-10-06 의뢰인: 분석 도구 수준의 그래프 — 참고: 스샷/ 샤플 대시보드).
// 숫자 칸 4개 → 30일 추이(선) + 오늘 출근율(고리) → 14일 지각(막대) + 오늘 근무 상태(가로 막대).
// 색: 한 가지 계열(파랑)만 쓴다 — 상태별 색 5가지는 색각 구분 검사를 통과하지 못해, 상태는 글자·숫자와 막대 길이로 구분한다.
// 글자·숫자는 글자 색, 도형만 파랑. 막대·점에 마우스를 올리면 그날 값이 뜬다 (title).
// 문장은 부르는 쪽이 번역해서 넘긴다 (4-10).
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui';

export type Kpi = { label: string; value: string; sub?: string; warn?: boolean; href?: string };
export type Point = { key: string; label: string; value: number; tip: string }; // value: 0~100 (%)
export type Bar = { key: string; label: string; sub?: string; n: number; tip: string };

const W = 640;
const H = 220;
const PAD = { l: 36, r: 16, t: 12, b: 28 };
const R = 42;
const C = 2 * Math.PI * R;

function LineChart({ points, empty }: { points: Point[]; empty: string }) {
  if (points.length < 2) return <p className="flex h-44 items-center justify-center text-sm text-faint">{empty}</p>;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (iw * i) / (points.length - 1);
  const y = (v: number) => PAD.t + ih * (1 - v / 100);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const last = points.length - 1;
  const marks = [...new Set([0, Math.floor(last / 2), last])];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} strokeWidth="1" className="stroke-border" />
          <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="num fill-faint text-xs">{v}%</text>
        </g>
      ))}
      <polygon points={`${x(0)},${y(0)} ${line} ${x(last)},${y(0)}`} className="fill-primary-tint" />
      <polyline points={line} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-primary" />
      <circle cx={x(last)} cy={y(points[last].value)} r="5" strokeWidth="2" className="fill-primary stroke-bg" />
      {marks.map((i) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="num fill-muted text-xs">{points[i].label}</text>
      ))}
      {/* 날짜마다 넓은 투명 영역 — 선보다 넓게 잡아 올리기 쉽게 */}
      {points.map((p, i) => (
        <rect key={p.key} x={x(i) - iw / (points.length - 1) / 2} y={PAD.t} width={iw / (points.length - 1)} height={ih} fill="transparent">
          <title>{p.tip}</title>
        </rect>
      ))}
    </svg>
  );
}

export function Analytics({
  kpis,
  lineTitle,
  lineNote,
  lineEmpty,
  points,
  rate,
  rateTitle,
  rateSub,
  lateTitle,
  unit,
  late,
  statusTitle,
  status,
  total,
}: {
  kpis: Kpi[];
  lineTitle: string;
  lineNote: string;
  lineEmpty: string;
  points: Point[];
  rate: number | null;
  rateTitle: string;
  rateSub: string;
  lateTitle: string;
  unit: string;
  late: Bar[];
  statusTitle: string;
  status: { label: string; n: number; warn?: boolean }[];
  total: number;
}) {
  const top = Math.max(1, ...late.map((d) => d.n));
  return (
    <div className="hidden flex-col gap-4 lg:flex">
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="text-sm text-muted">{k.label}</span>
              <span className={`num text-3xl leading-none font-extrabold ${k.warn ? 'text-warn' : 'text-text'}`}>{k.value}</span>
              <span className="num min-h-4 text-xs text-faint">{k.sub}</span>
            </>
          );
          const cls = 'flex flex-col gap-2 rounded-card bg-bg p-5';
          return k.href ? (
            <Link key={k.label} href={k.href} className={cls}>
              {body}
            </Link>
          ) : (
            <div key={k.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 flex flex-col gap-3">
          <CardTitle aside={<span className="text-xs text-faint">{lineNote}</span>}>{lineTitle}</CardTitle>
          <LineChart points={points} empty={lineEmpty} />
        </Card>
        <Card className="flex flex-col gap-3">
          <CardTitle>{rateTitle}</CardTitle>
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="relative size-36">
              <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
                <circle cx="50" cy="50" r={R} fill="none" strokeWidth="10" className="stroke-surface" />
                {rate !== null && rate > 0 && <circle cx="50" cy="50" r={R} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(C * rate) / 100} ${C}`} className="stroke-primary" />}
              </svg>
              <p className="num absolute inset-0 flex items-center justify-center text-3xl font-extrabold">{rate === null ? '–' : `${rate}%`}</p>
            </div>
            <p className="num text-sm text-muted">{rateSub}</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 flex flex-col gap-3">
          <CardTitle aside={<span className="text-xs text-faint">{unit}</span>}>{lateTitle}</CardTitle>
          <ul className="flex h-40 items-stretch gap-2">
            {late.map((d) => (
              <li key={d.key} title={d.tip} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="flex w-full flex-1 flex-col items-center justify-end gap-1 border-b border-border">
                  {d.n > 0 && <span className="num text-xs font-bold text-text">{d.n}</span>}
                  <span className={`w-full max-w-8 rounded-t ${d.n > 0 ? 'bg-primary' : ''}`} style={{ height: `${(d.n / top) * 80}%` }} />
                </span>
                <span className="num flex flex-col items-center text-xs leading-tight text-muted">
                  <span>{d.label}</span>
                  <span className="text-faint">{d.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="flex flex-col gap-3">
          <CardTitle>{statusTitle}</CardTitle>
          <ul className="flex flex-1 flex-col justify-center gap-3">
            {status.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span className="w-14 shrink-0 text-muted">{s.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-chip bg-surface">
                  <span className="block h-full rounded-chip bg-primary" style={{ width: `${total > 0 ? (s.n / total) * 100 : 0}%` }} />
                </span>
                <span className={`num w-6 shrink-0 text-right font-bold ${s.warn && s.n > 0 ? 'text-warn' : 'text-text'}`}>{s.n}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
