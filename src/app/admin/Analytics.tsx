// PC 현황판 막대그래프 (2026-10-06 의뢰인 — 참고: 스샷/ 샤플 대시보드의 「이번 주 초과근무」).
//  · 이번 주 요일별 연장근로 시간 · 최근 14일 지각 — 둘 다 이 한 조각(BarCard)으로 그린다
//  · 맨 위 숫자 칸 4개는 KpiRow.tsx
// 색: 한 가지 계열(파랑)만 쓴다. 글자·숫자는 글자 색, 막대만 파랑. 막대에 마우스를 올리면 그날 값이 뜬다 (title).
// 문장은 부르는 쪽이 번역해서 넘긴다 (4-10).
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
      <ul className={`flex min-h-36 flex-1 items-stretch ${dense ? 'gap-1' : 'gap-3'}`}>
        {bars.map((d, i) => (
          <li key={d.key} title={d.tip} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="flex w-full flex-1 flex-col items-center justify-end gap-1 border-b border-border">
              {d.n > 0 && <span className="num text-xs font-bold text-text">{d.text ?? d.n}</span>}
              <span className={`w-full rounded-t ${dense ? '' : 'max-w-12'} ${d.n > 0 ? 'bg-primary' : ''}`} style={{ height: `${(d.n / top) * 80}%` }} />
            </span>
            {/* 좁은 칸(dense): 날짜는 한 칸 건너 하나씩만 적는다 (마지막 날은 항상) */}
            <span className="num flex min-h-4 flex-col items-center text-xs leading-tight text-muted">
              <span>{!dense || (bars.length - 1 - i) % 2 === 0 ? d.label : ''}</span>
              {d.sub && <span className="text-faint">{d.sub}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
