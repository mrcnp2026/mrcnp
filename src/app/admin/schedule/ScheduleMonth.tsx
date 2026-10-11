// 근무일정 달력형 · 월 보기 (PC) — 시프티의 월 보기처럼 진짜 달력이다 (2026-10-11 의뢰인 스샷 `스샷/근무일정 달력형 월 단위.png`):
//   일~토 7칸, 칸마다 그날의 일정이 「이름 | 시작 - 끝」 카드로 쌓이고 휴가는 회색 카드(비행기). 많으면 「N개 더보기」로 접는다.
//   토 · 일 · 공휴일은 빨간 날짜 + 옅은 붉은 바탕, 공휴일은 이름도 적는다. 오늘은 파란 동그라미.
// 계산은 하지 않는다 — 부르는 쪽(page.tsx)이 만든 칸을 그리기만 한다.
import { Plane } from 'lucide-react';
import Link from 'next/link';
import { SHIFT_COLOR_CLASS, type ShiftColor } from '@/lib/shifts';

export type MonthEntry = { key: string; name: string; time: string | null; href: string | null; color: ShiftColor | null; tag: string | null };
export type MonthCell = { date: string; day: string; inMonth: boolean; red: boolean; today: boolean; holiday: string | null; entries: MonthEntry[] };

const SHOW = 4;

function EntryCard({ e }: { e: MonthEntry }) {
  const body = (
    <>
      <span aria-hidden className={`w-1 shrink-0 ${e.time ? (e.color ? SHIFT_COLOR_CLASS[e.color] : 'bg-border') : 'bg-muted'}`} />
      <span className="flex min-w-0 flex-1 items-center gap-1 px-1.5 py-0.5">
        {!e.time && <Plane aria-hidden size={12} className="shrink-0 text-muted" />}
        <span className="truncate font-bold">{e.name}</span>
        {e.time && <span className="num shrink-0 text-muted">{e.time}</span>}
        {e.tag && <span className="ml-auto shrink-0 rounded-button bg-nav px-1 text-on-primary">{e.tag}</span>}
      </span>
    </>
  );
  const cls = 'flex overflow-hidden rounded-button border border-border bg-bg text-xs';
  return e.href ? (
    <Link href={e.href} className={`${cls} hover:bg-primary-tint`}>
      {body}
    </Link>
  ) : (
    <p className={`${cls} bg-surface!`}>{body}</p>
  );
}

export function ScheduleMonth({ weekdays, cells, labels }: { weekdays: string[]; cells: MonthCell[]; labels: { more: (n: number) => string } }) {
  return (
    <div className="grid grid-cols-7 border-t border-l border-border bg-bg">
      {weekdays.map((w, i) => (
        <div key={w} className={`border-r border-b border-border bg-surface py-2 text-center text-sm font-semibold ${i === 0 || i === 6 ? 'text-danger' : 'text-muted'}`}>
          {w}
        </div>
      ))}
      {cells.map((c) => (
        <div key={c.date} className={`flex min-h-32 min-w-0 flex-col gap-1 border-r border-b border-border p-1.5 ${c.red ? 'bg-danger-tint' : c.inMonth ? '' : 'bg-surface'} ${c.inMonth ? '' : 'opacity-60'}`}>
          <div className="flex items-center gap-1.5">
            <span className={`num flex h-6 min-w-6 items-center justify-center rounded-chip px-1 text-sm font-bold ${c.today ? 'bg-primary text-on-primary' : c.red ? 'text-danger' : ''}`}>{c.day}</span>
            {c.holiday && <span className="truncate text-xs text-danger">{c.holiday}</span>}
          </div>
          {c.entries.slice(0, SHOW).map((e) => (
            <EntryCard key={e.key} e={e} />
          ))}
          {c.entries.length > SHOW && (
            <details className="group">
              <summary className="cursor-pointer list-none rounded-button px-1.5 py-0.5 text-xs font-bold text-primary hover:bg-primary-tint group-open:hidden">{labels.more(c.entries.length - SHOW)}</summary>
              <div className="flex flex-col gap-1">
                {c.entries.slice(SHOW).map((e) => (
                  <EntryCard key={e.key} e={e} />
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
