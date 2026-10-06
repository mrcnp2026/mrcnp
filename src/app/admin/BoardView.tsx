'use client';
// 오늘 현황판 (7-9) — 토스풍 (2026-10-02 의뢰인 선택 시안).
// ★ 기준은 "오늘 하루"다. 한 사람은 한 칸에만 (요점 8): 퇴근 → 야근중 → 지각 → 근무중 → 미출근 순서로 판정.
//   기준을 화면에 적어 둔다 (의뢰인: "이건 무슨 기준이야? 1일? 1달?"). 지난 날·월별은 기록 탭.
// 숫자 칸을 누르면 아래 명단이 그 상태로 걸러진다 (의뢰인: "누르면 누가 지각인지 이름이 나오나?").
// 명단은 10명씩 페이지 — 20명이어도 길게 내리지 않게.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Help } from '@/components/Help';
import { Card } from '@/components/ui';
import type { BoardRow, DayStatus } from '@/lib/today';

const ORDER: Exclude<DayStatus, 'off'>[] = ['working', 'late', 'absent', 'done', 'overtime'];
const PER_PAGE = 10;
// 상태 글자 색: 예외(지각·야근)만 주황, 근무 중은 파랑, 나머지는 회색 (R-10-5)
const TONE: Record<DayStatus, string> = {
  working: 'text-primary',
  late: 'text-warn',
  absent: 'text-faint',
  done: 'text-muted',
  overtime: 'text-warn',
  off: 'text-faint',
};

export function BoardView({
  board,
  limitMinutes,
  cautionMinutes,
  colored,
  legend,
}: {
  board: Record<DayStatus, BoardRow[]>;
  total: number;
  limitMinutes: number;
  cautionMinutes: number;
  colored: boolean;
  legend: { deadline: string; end: string } | null; // 지각 기준 시각(시작+유예), 퇴근 기준 시각
}) {
  const t = useTranslations('admin.home');
  const th = useTranslations('home');
  const f = useFormatter();
  const [filter, setFilter] = useState<DayStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const time = (d: Date | null) => (d ? f.dateTime(new Date(d), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');

  // "전체"는 확인이 필요한 사람부터: 지각·야근 → 미출근 → 근무 중 → 퇴근 → 휴무
  const all = [...board.late, ...board.overtime, ...board.absent, ...board.working, ...board.done, ...board.off];
  const list = filter === 'all' ? all : board[filter];
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const pick = (k: DayStatus | 'all') => {
    setFilter(filter === k ? 'all' : k);
    setPage(1);
  };

  const sub = (r: BoardRow) => {
    const bits: string[] = [];
    if (r.firstIn) bits.push(th('inAt', { time: time(r.firstIn) }));
    if (r.lastOut && r.status === 'done') bits.push(th('outAt', { time: time(r.lastOut) }));
    if (!r.firstIn) bits.push(t('noRecord'));
    if (r.weekMinutes !== null) bits.push(t('week', { h: Math.floor(r.weekMinutes / 60), m: r.weekMinutes % 60 }));
    return bits.join(' · ');
  };
  const weekTone = (wm: number | null) => (wm === null || !colored ? '' : wm > limitMinutes ? 'text-danger' : wm >= cautionMinutes ? 'text-warn' : '');

  const statusText = (r: BoardRow) => (r.status === 'off' && r.onLeave ? t('onLeave') : r.status === 'off' && r.work ? t(`work.${r.work}`) : th(`status.${r.status}`));
  const pager = pages > 1 && (
    <nav aria-label={t('pages')} className="flex items-center justify-center gap-1 pt-1">
      <button type="button" disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label={t('prevPage')} className="flex size-11 items-center justify-center text-primary disabled:text-faint">
        <ChevronLeft aria-hidden size={20} strokeWidth={2} />
      </button>
      {[...Array(pages)].map((_, i) => (
        <button key={i} type="button" onClick={() => setPage(i + 1)} aria-current={cur === i + 1 ? 'page' : undefined} className={`num flex size-11 items-center justify-center rounded-button text-sm font-bold ${cur === i + 1 ? 'bg-primary text-on-primary' : 'text-muted'}`}>
          {i + 1}
        </button>
      ))}
      <button type="button" disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label={t('nextPage')} className="flex size-11 items-center justify-center text-primary disabled:text-faint">
        <ChevronRight aria-hidden size={20} strokeWidth={2} />
      </button>
    </nav>
  );

  return (
    <div className="flex flex-col gap-3 lg:h-full">
      {/* PC: 제목 + 걸러보기 단추 + 표 (2026-10-06 의뢰인: 직원 명단을 카드처럼 늘어놓지 말 것) */}
      <Card className="hidden flex-1 flex-col gap-3 p-0 py-4 lg:flex">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-5">
          <h2 className="font-bold">{t('listTitle')}</h2>
          <Help>
            {[t('basisToday'), legend && t('basisLate', { time: legend.deadline }), legend && t('basisOvertime', { time: legend.end }), t('basisAbsent'), t('basisOne'), t('basisPast')].filter(Boolean).map((x) => (
              <span key={x as string} className="block">{x}</span>
            ))}
          </Help>
          <div className="ml-auto flex flex-wrap gap-1" role="tablist" aria-label={t('statusTabs')}>
            {(['all', ...ORDER] as const).map((k) => {
              const on = filter === k;
              const n = k === 'all' ? all.length : board[k].length;
              return (
                <button key={k} type="button" role="tab" aria-selected={on} onClick={() => { setFilter(k); setPage(1); }} className={`inline-flex min-h-9 items-center gap-1 rounded-button px-3 text-sm ${on ? 'bg-primary-tint font-bold text-primary' : 'text-muted'}`}>
                  {k === 'all' ? t('everyone') : th(`status.${k}`)} <span className="num">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-4 text-sm text-faint">{t('nobody')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border">
                {[t('colStaff'), t('colStatus'), t('colIn'), t('colOut'), t('colWeek'), t('colNote')].map((x) => (
                  <th key={x} scope="col" className="px-5 py-2 text-left text-xs font-medium whitespace-nowrap text-faint">{x}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium whitespace-nowrap">{r.name}</td>
                  <td className={`px-5 py-3 font-bold whitespace-nowrap ${(r.onLeave || r.work) && r.status === 'off' ? 'text-primary' : TONE[r.status]}`}>{statusText(r)}</td>
                  <td className="num px-5 py-3">{time(r.firstIn) || '–'}</td>
                  <td className="num px-5 py-3">{r.lastOut && r.status === 'done' ? time(r.lastOut) : '–'}</td>
                  <td className={`num px-5 py-3 ${weekTone(r.weekMinutes)}`}>{r.weekMinutes === null ? '–' : t('weekShort', { h: Math.floor(r.weekMinutes / 60), m: r.weekMinutes % 60 })}</td>
                  <td className="px-5 py-3 text-xs">
                    <span className="flex flex-wrap gap-x-2">
                      {r.late && <span className="num text-warn">{th('lateBy', { n: r.lateMinutes })}</span>}
                      {r.firstInVerified === false && (r.work ? <span className="text-primary">{t('workApproved', { kind: t(`work.${r.work}`) })}</span> : <span className="text-warn">{th('outside')}</span>)}
                      {r.adminEntered && <span className="text-faint">{t('adminEntered')}</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pager}
      </Card>

      {/* 폰 — 숫자 칸 5개: 한 카드 안에 한 줄. 누르면 아래 명단이 걸러진다 */}
      <Card className="p-2 lg:hidden">
        <div className="grid grid-cols-5" role="tablist" aria-label={t('statusTabs')}>
          {ORDER.map((k) => {
            const n = board[k].length;
            const on = filter === k;
            const attention = (k === 'late' || k === 'overtime') && n > 0;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pick(k)}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-button ${on ? 'bg-primary-tint' : ''}`}
              >
                <span className={`num text-2xl leading-none font-extrabold ${attention ? 'text-warn' : on ? 'text-primary' : 'text-text'}`}>{n}</span>
                <span className={`text-xs ${on ? 'font-bold text-primary' : 'text-muted'}`}>{th(`status.${k}`)}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 기준 — 무엇을 어떻게 셌는지 */}
      <details className="rounded-card bg-bg px-5 text-sm lg:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-muted">
          <span>{t('basis')}</span>
          <span className="text-faint">{t('basisOpen')}</span>
        </summary>
        <ul className="flex flex-col gap-1.5 pb-4 text-muted">
          <li>{t('basisToday')}</li>
          {legend && <li>{t('basisLate', { time: legend.deadline })}</li>}
          {legend && <li>{t('basisOvertime', { time: legend.end })}</li>}
          <li>{t('basisAbsent')}</li>
          <li>{t('basisOne')}</li>
          <li>{t('basisPast')}</li>
        </ul>
      </details>

      {/* 명단 (폰) */}
      <Card className="flex flex-col p-0 py-2 lg:hidden">
        <div className="flex min-h-11 items-center justify-between px-5">
          <h2 className="text-sm font-medium text-muted">
            {filter === 'all' ? t('everyone') : th(`status.${filter}`)} <span className="num">{list.length}</span>
          </h2>
          {filter !== 'all' && (
            <button type="button" onClick={() => pick('all')} className="min-h-11 text-sm font-medium text-primary">
              {t('showAll')}
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-4 text-sm text-faint">{t('nobody')}</p>
        ) : (
          <ul>
            {shown.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center gap-3 px-5 py-2">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-surface font-bold text-muted">
                  {r.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className={`num block truncate text-xs text-faint ${weekTone(r.weekMinutes)}`}>{sub(r)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`text-sm font-bold ${(r.onLeave || r.work) && r.status === 'off' ? 'text-primary' : TONE[r.status]}`}>
                    {r.status === 'off' && r.onLeave ? t('onLeave') : r.status === 'off' && r.work ? t(`work.${r.work}`) : th(`status.${r.status}`)}
                  </span>
                  {r.late && r.status !== 'late' && <span className="text-xs text-warn">{th('lateBy', { n: r.lateMinutes })}</span>}
                  {r.status === 'late' && <span className="num text-xs text-warn">{th('lateBy', { n: r.lateMinutes })}</span>}
                  {r.firstInVerified === false && (r.work ? <span className="text-xs text-primary">{t('workApproved', { kind: t(`work.${r.work}`) })}</span> : <span className="text-xs text-warn">{th('outside')}</span>)}
                  {r.adminEntered && <span className="text-xs text-faint">{t('adminEntered')}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav aria-label={t('pages')} className="flex items-center justify-center gap-1 pt-1">
            <button type="button" disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label={t('prevPage')} className="flex size-11 items-center justify-center text-primary disabled:text-faint">
              <ChevronLeft aria-hidden size={20} strokeWidth={2} />
            </button>
            {[...Array(pages)].map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i + 1)}
                aria-current={cur === i + 1 ? 'page' : undefined}
                className={`num flex size-11 items-center justify-center rounded-button text-sm font-bold ${cur === i + 1 ? 'bg-primary text-on-primary' : 'text-muted'}`}
              >
                {i + 1}
              </button>
            ))}
            <button type="button" disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label={t('nextPage')} className="flex size-11 items-center justify-center text-primary disabled:text-faint">
              <ChevronRight aria-hidden size={20} strokeWidth={2} />
            </button>
          </nav>
        )}
      </Card>
    </div>
  );
}
