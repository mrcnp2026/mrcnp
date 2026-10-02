'use client';
// 숫자 5칸 — 360px에서 스크롤 없이 먼저 보이고, 탭하면 이름이 펼쳐진다 (7-9 요점 2). 표를 쓰지 않는다.
// 휴무(off)는 숫자 칸 없이 아래에 접어 둔다 (요점 8). 색은 예외에만 (R-10-5) — 숫자 칸 자체는 칠하지 않는다.
import { ChevronDown } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Card, Chip } from '@/components/ui';
import type { BoardRow, DayStatus } from '@/lib/today';

const ORDER: Exclude<DayStatus, 'off'>[] = ['working', 'late', 'absent', 'done', 'overtime'];

export function BoardView({
  board,
  total,
  limitMinutes,
  cautionMinutes,
  colored,
}: {
  board: Record<DayStatus, BoardRow[]>;
  total: number;
  limitMinutes: number;
  cautionMinutes: number;
  colored: boolean;
}) {
  const t = useTranslations('admin.home');
  const th = useTranslations('home');
  const f = useFormatter();
  const [open, setOpen] = useState<DayStatus | null>(null);
  const time = (d: Date | null) => (d ? f.dateTime(new Date(d), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');

  const row = (r: BoardRow) => {
    const wm = r.weekMinutes;
    const tone = wm === null || !colored ? 'neutral' : wm > limitMinutes ? 'danger' : wm >= cautionMinutes ? 'warn' : 'neutral';
    return (
      <li key={r.id} className="flex flex-col gap-1 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{r.name}</span>
          <span className="num text-sm text-muted">
            {r.firstIn && th('inAt', { time: time(r.firstIn) })}
            {r.lastOut && r.status === 'done' && ` · ${th('outAt', { time: time(r.lastOut) })}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.late && <Chip tone="warn">{th('lateBy', { n: r.lateMinutes })}</Chip>}
          {r.firstInVerified === false && <Chip tone="warn">{th('outside')}</Chip>}
          {r.adminEntered && <Chip>{t('adminEntered')}</Chip>}
          {wm !== null && (
            <span className={`num text-xs ${tone === 'danger' ? 'font-semibold text-danger' : tone === 'warn' ? 'font-semibold text-warn' : 'text-faint'}`}>
              {t('week', { h: Math.floor(wm / 60), m: wm % 60 })}
            </span>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2" role="tablist">
        {ORDER.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={open === k}
            onClick={() => setOpen(open === k ? null : k)}
            className={`flex min-h-20 flex-col items-center justify-center rounded-card border p-2 ${open === k ? 'border-primary bg-primary-tint' : 'border-border bg-bg'}`}
          >
            <span className="num text-3xl font-bold text-text">{board[k].length}</span>
            <span className="text-sm text-muted">{th(`status.${k}`)}</span>
          </button>
        ))}
        <div className="flex min-h-20 flex-col items-center justify-center rounded-card bg-surface p-2">
          <span className="num text-3xl font-bold text-faint">{total}</span>
          <span className="text-sm text-faint">{t('total')}</span>
        </div>
      </div>

      {open && open !== 'off' && (
        <Card>
          <h2 className="font-semibold">{th(`status.${open}`)}</h2>
          {board[open].length === 0 ? <p className="py-2 text-sm text-faint">{t('nobody')}</p> : <ul className="divide-y divide-border">{board[open].map(row)}</ul>}
        </Card>
      )}

      {board.off.length > 0 && (
        <details className="rounded-card border border-border px-4">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm text-muted">
            <span>
              {th('status.off')} <span className="num">{board.off.length}</span>
            </span>
            <ChevronDown aria-hidden size={18} strokeWidth={1.75} />
          </summary>
          <ul className="divide-y divide-border">{board.off.map(row)}</ul>
        </details>
      )}
    </div>
  );
}
