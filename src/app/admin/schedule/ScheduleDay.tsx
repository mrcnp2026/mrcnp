// 근무일정 달력형 · 일 보기 (PC) — 시프티의 일 보기처럼 줄 = 직원, 가로 = 하루 24시간이고 일정이 시간 막대로 놓인다
// (2026-10-11 의뢰인 스샷 `스샷/근무일정 달력형 일 단위.png`). 휴가인 사람은 줄 전체가 회색 띠(비행기).
// 막대 자리는 15분 한 칸(하루 96칸)으로 잡는다. 계산은 하지 않는다 — 부르는 쪽(page.tsx)이 만든 줄을 그리기만 한다.
import { Plane } from 'lucide-react';
import Link from 'next/link';
import { SHIFT_COLOR_CLASS, type ShiftColor } from '@/lib/shifts';

export type DayBar = { key: string; start: string; end: string; href: string; color: ShiftColor | null; tag: string | null };
export type DayLine = { id: string; name: string; sub: string; total: string; leave: string | null; bars: DayBar[] };

const TINT: Record<ShiftColor, string> = { primary: 'bg-primary/10', ok: 'bg-ok/10', warn: 'bg-warn/15', danger: 'bg-danger/10', text: 'bg-text/10', muted: 'bg-muted/10' };
const slot = (hhmm: string) => Math.round((Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))) / 15);
const TRACK = { gridTemplateColumns: 'repeat(96, minmax(0, 1fr))' } as const;

export function ScheduleDay({ lines, labels }: { lines: DayLine[]; labels: { employee: string; empty: string } }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-bg shadow-card">
      <div className="min-w-240">
        <div className="flex border-b border-border bg-surface text-xs font-semibold text-muted">
          <div className="w-44 shrink-0 border-r border-border px-3 py-2 text-sm">{labels.employee}</div>
          <div className="grid flex-1 grid-cols-24">
            {[...Array(24)].map((_, h) => (
              <div key={h} className="num border-r border-border py-2 text-center last:border-r-0">
                {h}
              </div>
            ))}
          </div>
        </div>
        {lines.length === 0 && <p className="px-3 py-8 text-center text-sm text-faint">{labels.empty}</p>}
        {lines.map((l) => (
          <div key={l.id} className="flex border-b border-border last:border-b-0">
            <div className="w-44 shrink-0 border-r border-border px-3 py-2">
              <span className="font-bold">{l.name}</span>
              <span className="num ml-1.5 text-xs text-faint">{l.total}</span>
              {l.sub && <span className="block truncate text-xs text-faint">{l.sub}</span>}
            </div>
            <div className="relative flex-1">
              {/* 시간 눈금 */}
              <div aria-hidden className="absolute inset-0 grid grid-cols-24">
                {[...Array(24)].map((_, h) => (
                  <div key={h} className="border-r border-border/60 last:border-r-0" />
                ))}
              </div>
              <div className="relative grid h-full min-h-12 items-center py-1.5" style={TRACK}>
                {l.leave && (
                  <p className="flex items-center gap-1.5 rounded-button bg-surface px-2 py-1.5 text-xs text-muted" style={{ gridColumn: '1 / -1' }}>
                    <Plane aria-hidden size={14} className="shrink-0" />
                    {l.leave}
                  </p>
                )}
                {l.bars.map((b) => (
                  <Link key={b.key} href={b.href} style={{ gridColumn: `${slot(b.start) + 1} / ${Math.max(slot(b.end), slot(b.start) + 1) + 1}`, gridRow: 1 }} className={`flex overflow-hidden rounded-button hover:brightness-95 ${b.color ? TINT[b.color] : 'bg-surface'}`}>
                    <span aria-hidden className={`w-1 shrink-0 ${b.color ? SHIFT_COLOR_CLASS[b.color] : 'bg-border'}`} />
                    <span className="num flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-xs">
                      <span className="truncate font-medium">
                        {b.start} - {b.end}
                      </span>
                      {b.tag && <span className="ml-auto shrink-0 rounded-button bg-nav px-1.5 text-on-primary">{b.tag}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
