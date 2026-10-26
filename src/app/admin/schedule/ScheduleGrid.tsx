// 근무일정 달력형 (PC) — 줄 = 직원, 칸 = 날짜 (2026-10-11 의뢰인: PC는 시프티 수준으로. `pc용/시프티 PC 화면 기록.md` 3장 「근무일정 달력형」).
// 주 보기는 칸에 「시작 - 끝 · 일정 이름 · 유형」, 월 보기는 칸이 좁아 시작/끝 두 줄만. 휴가는 회색 칸에 비행기.
// 왼쪽 열(이름 + 기간 합계)과 머리줄은 밀어도 붙어 있다. 맨 아래 줄은 날짜별 인원. 칸을 누르면 그 일정의 상세로 간다.
// 계산은 하지 않는다 — 부르는 쪽(page.tsx)이 만든 줄을 그리기만 한다.
import { Plane } from 'lucide-react';
import Link from 'next/link';
import { SHIFT_COLOR_CLASS, type PlanItem, type ShiftColor } from '@/lib/shifts';

export type GridCell = { leave: string | null; items: { it: PlanItem; href: string; color: ShiftColor | null; tag: string | null; place?: string | null }[] };
export type GridRow = { id: string; name: string; sub: string; total: string; cells: GridCell[] };
export type GridDay = { date: string; label: string; holiday: string | null; red: boolean; today: boolean; count: number };

// 카드 바탕: 직무 색을 옅게 (시프티 주 보기의 카드 — 왼쪽 색 띠 + 같은 색의 옅은 바탕)
const TINT: Record<ShiftColor, string> = { primary: 'bg-primary/10', ok: 'bg-ok/10', warn: 'bg-warn/15', danger: 'bg-danger/10', text: 'bg-text/10', muted: 'bg-muted/10' };

export function ScheduleGrid({ days, rows, dense, labels }: { days: GridDay[]; rows: GridRow[]; dense: boolean; labels: { employee: string; people: string; empty: string } }) {
  // 주 보기 칸 128px — 160px이면 1440px 화면에서 한 주 7일이 다 안 들어가 옆으로 밀어야 했다 (2026-10-18 디자인)
  const colW = dense ? 'min-w-17' : 'min-w-32';
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-bg shadow-card">
      {/* 주 보기는 칸 폭을 고정한다 — 자동 폭이면 긴 장소 이름 때문에 칸이 넓어져 7일이 다 안 들어갔다 (2026-10-18 디자인). 이름 칸 11rem + 날짜 칸 8rem씩이 최소 */}
      <table className={`w-full border-separate border-spacing-0 text-sm ${dense ? '' : 'table-fixed'}`} style={dense ? undefined : { minWidth: `${11 + days.length * 8}rem` }}>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 w-44 min-w-44 border-b border-border bg-bg px-4 py-3 text-left text-xs font-semibold text-muted">
              {labels.employee}
            </th>
            {days.map((d) => (
              <th key={d.date} scope="col" className={`${colW} border-b border-border px-1.5 py-2 text-center font-normal`}>
                <span className={`num inline-flex flex-col items-center rounded-card px-2.5 py-1 leading-tight ${d.today ? 'bg-primary text-on-primary' : d.red ? 'text-danger' : 'text-muted'}`}>
                  {(() => {
                    const m = /^(.*?)\s*\((.+)\)\s*$/.exec(d.label);
                    return m ? (
                      <>
                        <span className="text-xs">{m[2]}</span>
                        <span className="text-base font-bold">{m[1]}</span>
                      </>
                    ) : (
                      <span className="font-bold">{d.label}</span>
                    );
                  })()}
                </span>
                {d.holiday && !dense && <span className="mt-0.5 block truncate text-xs font-medium text-danger">{d.holiday}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={days.length + 1} className="px-3 py-8 text-center text-faint">
                {labels.empty}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="sticky left-0 z-10 border-b border-border bg-bg px-4 py-3 text-left align-top font-normal">
                <span className="font-bold">{r.name}</span>
                <span className="num ml-1.5 text-xs text-faint">{r.total}</span>
                {r.sub && <span className="block truncate text-xs text-faint">{r.sub}</span>}
              </th>
              {r.cells.map((c, i) => (
                <td key={days[i].date} className={`border-b border-border p-1.5 align-top ${days[i].today ? 'bg-primary-tint/50' : days[i].red ? 'bg-danger-tint/50' : ''}`}>
                  <div className="flex flex-col gap-1">
                    {c.leave && (
                      <div className="flex items-center gap-1.5 rounded-button bg-surface px-2 py-1.5 text-muted">
                        <Plane aria-hidden size={14} className="shrink-0" />
                        {!dense && <span className="truncate text-xs">{c.leave}</span>}
                      </div>
                    )}
                    {c.items.map(({ it, href, color, tag, place }) => (
                      <Link key={`${it.shiftId ?? it.source}${it.startTime}`} href={href} className={`flex overflow-hidden rounded-button hover:brightness-95 ${color ? TINT[color] : 'bg-surface'}`}>
                        <span aria-hidden className={`w-1 shrink-0 ${color ? SHIFT_COLOR_CLASS[color] : 'bg-border'}`} />
                        {dense ? (
                          <span className="num flex flex-1 flex-col px-1 py-1 text-center text-xs leading-tight">
                            <span>{it.startTime}</span>
                            <span className="text-muted">{it.endTime}</span>
                          </span>
                        ) : (
                          <span className="flex min-w-0 flex-1 flex-col px-2 py-1.5">
                            <span className="num font-medium">
                              {it.startTime} - {it.endTime}
                            </span>
                            <span className="flex items-center justify-between gap-1 text-xs text-muted">
                              <span className="truncate">{[place, it.name].filter(Boolean).join(' · ')}</span>
                              {tag && <span className="shrink-0 rounded-button bg-nav px-1.5 text-on-primary">{tag}</span>}
                            </span>
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-bg px-4 py-3 text-left text-xs font-semibold text-muted">
                {labels.people}
              </th>
              {days.map((d) => (
                <td key={d.date} className={`num px-2 py-3 text-center text-sm font-semibold text-muted ${d.today ? 'bg-primary-tint/50' : d.red ? 'bg-danger-tint/50' : ''}`}>
                  {d.count}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
