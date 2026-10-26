// 근무일정 현황 (PC 첫 화면, 2026-10-22 의뢰인: 「모든 지점 인원이 일정이 있다면 왜 굳이 달력으로 보나 — 일정 있는 / 없는 인원으로 나누고,
// 어디 지점 몇 명 정상 근무, 정상 근무가 아닌 인원을 먼저 보이고, 누르면 상세 인원이 나와야」 · 「엑셀을 붙인 것처럼 보이는 구간이 디자인적으로 떨어진다」).
// 하루 기준: 위 숫자 카드(분류별 인원 — 누르면 그 사람들만) → 지점별 줄(누르면 펼쳐져 사람별, 정상 아닌 사람이 먼저).
// 분류는 classify() 한곳: 휴가(종일) · 외근 · 출장 · 재택 · 다른 근무(그날만 넣은 일정 · 특근 · 잔업 · 반차) · 정상 근무(평소 틀 · 회사 규칙 · 간주) · 일정 없음(쉬는 날은 따로 표시).
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { CountUp } from '@/components/CountUp';
import type { ReactNode } from 'react';

export const CATS = ['none', 'leave', 'away', 'special', 'normal'] as const;
export type Cat = (typeof CATS)[number];
export type BoardPerson = { id: string; name: string; group: string; job: string | null; cat: Cat; time: string | null; tag: string | null; note: string | null; href: string };

const TONE: Record<Cat, { num: string; chip: string; dot: string }> = {
  none: { num: 'text-warn', chip: 'bg-warn-tint text-warn', dot: 'bg-warn' },
  leave: { num: 'text-text', chip: 'bg-surface text-muted', dot: 'bg-muted' },
  away: { num: 'text-primary', chip: 'bg-primary-tint text-primary', dot: 'bg-primary' },
  special: { num: 'text-primary', chip: 'bg-primary-tint text-primary', dot: 'bg-primary' },
  normal: { num: 'text-ok', chip: 'bg-ok-tint text-ok', dot: 'bg-ok' },
};

function Count({ n, cat, strong = false }: { n: number; cat: Cat; strong?: boolean }) {
  if (n === 0) return <span className="num text-faint">–</span>;
  return <span className={`num font-bold ${strong ? 'text-lg' : ''} ${TONE[cat].num}`}>{n}</span>;
}

function PersonLine({ p, label }: { p: BoardPerson; label: (c: Cat) => string }) {
  return (
    <li>
      <Link href={p.href} className="flex min-h-12 items-center gap-2 rounded-button px-2 py-2 hover:bg-surface lg:gap-3 lg:px-3">
        <span aria-hidden className={`size-2 shrink-0 rounded-chip ${TONE[p.cat].dot}`} />
        <span className="w-16 shrink-0 truncate font-bold lg:w-24">{p.name}</span>
        <span className="num w-24 shrink-0 text-sm text-muted lg:w-28">{p.time ?? '–'}</span>
        <span className={`shrink-0 rounded-chip px-2.5 py-0.5 text-xs font-bold ${TONE[p.cat].chip}`}>{p.tag ?? label(p.cat)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-faint max-lg:hidden">{[p.job, p.note].filter(Boolean).join(' · ')}</span>
      </Link>
    </li>
  );
}

export function ScheduleBoard({
  people,
  pick,
  pickHref,
  labels,
  restDay,
}: {
  people: BoardPerson[];
  pick: Cat | 'attention' | null; // 위 카드에서 고른 분류 — attention = 정상 근무가 아닌 사람 모두
  pickHref: (c: Cat | 'attention' | null) => string;
  restDay: boolean; // 그날이 쉬는 날(주말 · 공휴일)이면 「일정 없음」을 경고로 보지 않는다
  labels: { cat: (c: Cat) => string; total: string; attention: string; group: string; people: string; noGroup: string; empty: string; pickTitle: (what: string, n: number) => string; clear: string; restNone: string; expandHint: string; allNormal: string };
}) {
  const by = (c: Cat) => people.filter((p) => p.cat === c).length;
  const attention = people.filter((p) => p.cat !== 'normal' && !(restDay && p.cat === 'none'));
  const groups = [...new Set(people.map((p) => p.group))].sort((a, b) => (a === labels.noGroup ? 1 : b === labels.noGroup ? -1 : a.localeCompare(b)));
  const card = (key: Cat | 'attention' | null, title: string, n: number, sub: ReactNode, tone: string) => {
    const on = pick === key;
    return (
      <Link key={String(key)} href={pickHref(on ? null : key)} scroll={false} aria-current={on ? 'true' : undefined} className={`flex flex-col gap-0.5 rounded-card border bg-bg px-3 py-3 transition-colors hover:border-primary lg:gap-1 lg:px-5 lg:py-4 ${on ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
        <span className="truncate text-xs font-semibold text-muted lg:text-sm">{title}</span>
        <CountUp value={n} className={`num text-2xl font-bold lg:text-3xl ${n === 0 ? 'text-faint' : tone}`} />
        <span className="text-xs text-faint max-lg:hidden">{sub}</span>
      </Link>
    );
  };
  const picked = pick === null ? [] : pick === 'attention' ? attention : people.filter((p) => p.cat === pick);
  const order = (list: BoardPerson[]) => [...list].sort((a, b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || a.name.localeCompare(b.name));
  return (
    <div className="flex flex-col gap-4">
      {/* 숫자 카드: 먼저 볼 것(정상 아님)을 맨 앞에 */}
      <div className="grid grid-cols-3 gap-2 lg:gap-3 xl:grid-cols-6">
        {card('attention', labels.attention, attention.length, labels.total, attention.length ? 'text-warn' : 'text-ok')}
        {card('normal', labels.cat('normal'), by('normal'), '', TONE.normal.num)}
        {card('leave', labels.cat('leave'), by('leave'), '', 'text-text')}
        {card('away', labels.cat('away'), by('away'), '', TONE.away.num)}
        {card('special', labels.cat('special'), by('special'), '', TONE.special.num)}
        {card('none', labels.cat('none'), by('none'), restDay ? labels.restNone : '', restDay ? 'text-muted' : TONE.none.num)}
      </div>

      {/* 확인할 사람이 없으면 빈 상자 대신 한 줄로 */}
      {pick === 'attention' && picked.length === 0 && <p className="rounded-card bg-ok-tint px-5 py-3 text-sm font-semibold text-ok">{labels.allNormal}</p>}
      {pick !== null && !(pick === 'attention' && picked.length === 0) && (
        <section className="rounded-card border border-border bg-bg p-3 lg:p-4">
          <div className="flex items-center gap-3 px-1 pb-2">
            <h2 className="font-bold">{labels.pickTitle(pick === 'attention' ? labels.attention : labels.cat(pick), picked.length)}</h2>
            <Link href={pickHref(null)} scroll={false} className="ml-auto text-sm text-muted hover:text-text">
              {labels.clear}
            </Link>
          </div>
          {picked.length === 0 ? (
            <p className="px-1 py-4 text-sm text-faint">{labels.empty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {order(picked).map((p) => (
                <li key={p.id} className="flex flex-col lg:flex-row lg:items-center">
                  <span className="truncate px-2 pt-1.5 text-xs text-faint lg:w-44 lg:shrink-0 lg:px-3 lg:pt-0">{p.group}</span>
                  <ul className="min-w-0 flex-1">
                    <PersonLine p={p} label={labels.cat} />
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 지점별: 줄 = 지점 · 분류별 인원. 누르면 펼쳐서 사람별 — 정상 근무가 아닌 사람이 먼저 */}
      <section className="overflow-hidden rounded-card border border-border bg-bg">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))_2rem] items-center gap-2 border-b border-border px-5 py-3 text-xs font-bold text-faint lg:grid">
          <span>{labels.group}</span>
          <span className="text-right">{labels.people}</span>
          {CATS.slice().reverse().map((c) => (
            <span key={c} className="text-right">
              {labels.cat(c)}
            </span>
          ))}
          <span />
        </div>
        {groups.length === 0 && <p className="px-5 py-8 text-center text-sm text-faint">{labels.empty}</p>}
        {groups.map((g) => {
          const mine = people.filter((p) => p.group === g);
          const n = (c: Cat) => mine.filter((p) => p.cat === c).length;
          const flagged = mine.some((p) => p.cat !== 'normal' && !(restDay && p.cat === 'none'));
          return (
            <details key={g} className="group border-b border-border last:border-b-0" open={false}>
              <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-2 px-4 py-3.5 hover:bg-surface lg:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))_2rem] lg:px-5 lg:py-4 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-2">
                    {flagged && <span aria-hidden className="size-2 shrink-0 rounded-chip bg-warn" />}
                    <span className="truncate font-bold">{g}</span>
                  </span>
                  {/* 폰: 칸 대신 정상 아닌 분류만 딱지 */}
                  <span className="flex flex-wrap gap-1 lg:hidden">
                    {CATS.filter((c) => c !== 'normal' && n(c) > 0 && !(restDay && c === 'none')).map((c) => (
                      <span key={c} className={`num rounded-chip px-2 py-0.5 text-xs font-bold ${TONE[c].chip}`}>
                        {labels.cat(c)} {n(c)}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="num text-right font-semibold">{mine.length}</span>
                {CATS.slice().reverse().map((c) => (
                  <span key={c} className="text-right max-lg:hidden">
                    <Count n={n(c)} cat={c === 'none' && restDay ? 'leave' : c} />
                  </span>
                ))}
                <ChevronDown aria-hidden size={18} className="justify-self-end text-faint transition-transform group-open:rotate-180" />
              </summary>
              <ul className="flex flex-col border-t border-border bg-surface/40 px-1 py-2 lg:px-3">
                {order(mine).map((p) => (
                  <PersonLine key={p.id} p={p} label={labels.cat} />
                ))}
              </ul>
            </details>
          );
        })}
      </section>
      <p className="text-xs text-faint">{labels.expandHint}</p>
    </div>
  );
}
