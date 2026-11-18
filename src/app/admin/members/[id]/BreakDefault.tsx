'use client';
// 직원별 저녁 휴게 (급여-78) — 관리 칸의 한 줄. 회사 기본(쉼)인 사람은 여기서만 보이고, 「쉬지 않고 일함」인 사람만 급여 칸에 한 줄 더 나온다 (2026-11-18 의뢰인: 평소엔 숨기고 예외만)
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { Button } from '@/components/ui';

export type EveningBreak = { start: string; end: string; minutes: number } | null;

export function BreakDefault({ employeeId, current, today, evening, startOpen = false }: { employeeId: string; current: { skipEvening: boolean; validFrom: string } | null; today: string; evening: EveningBreak; startOpen?: boolean }) {
  const t = useTranslations('admin.members.breakDefault');
  const te = useTranslations('errors');
  const router = useRouter();
  const skipNow = !!current?.skipEvening;
  const [open, setOpen] = useState(startOpen);
  const [v, setV] = useState({ skipEvening: !skipNow, validFrom: today, reason: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const when = evening ? t('when', { start: evening.start, end: evening.end, n: evening.minutes }) : t('whenNone');
  const ready = v.reason.trim().length > 0 && v.reason.trim().length <= 200 && v.skipEvening !== skipNow;
  const choices = [
    { skip: false, title: t('pickOn'), note: t('pickOnNote') },
    { skip: true, title: t('pickOff'), note: evening ? t('pickOffNote', { n: evening.minutes }) : t('pickOffNoteNone') },
  ];

  const save = async () => {
    if (!ready) return setErr(t('reasonRequired'));
    setBusy(true);
    setErr(null);
    const r = await callApi(`/api/admin/employees/${employeeId}/break-default`, v);
    setBusy(false);
    if (!r.ok) return setErr(r.code === 'reason_required' ? t('reasonRequired') : te.has(r.code) ? te(r.code) : te('generic'));
    setOpen(false);
    setSaved(true);
    setV({ skipEvening: !v.skipEvening, validFrom: today, reason: '' });
    router.refresh();
  };

  return (
    <div id="break-default" className="scroll-mt-20 border-t border-border first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); setErr(null); setSaved(false); }} className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t('title')}</span>
          <span className="num flex flex-wrap gap-x-1.5 text-xs text-muted">
            <span className="whitespace-nowrap">{when}</span>
            <span className={`whitespace-nowrap ${skipNow ? 'font-semibold text-text' : ''}`}>{skipNow ? t('nowOff', { from: current!.validFrom }) : t('nowOn')}</span>
          </span>
        </span>
        <ChevronDown aria-hidden size={18} strokeWidth={2} className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {saved && !open && <p role="status" className="px-5 pb-3 text-sm font-semibold text-ok">{t('saved')}</p>}
      {open && (
        <form className="flex flex-col gap-3 px-5 pb-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div role="radiogroup" aria-label={t('title')} className="flex flex-col gap-2">
            {choices.map((c) => {
              const on = v.skipEvening === c.skip;
              return (
                <button key={String(c.skip)} type="button" role="radio" aria-checked={on} onClick={() => setV({ ...v, skipEvening: c.skip })} className={`flex min-h-14 items-center gap-3 rounded-button border px-3 py-2.5 text-left transition-colors ${on ? 'border-primary bg-primary-tint' : 'border-border hover:bg-surface'}`}>
                  <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-primary' : 'border-border'}`}>
                    {on && <span className="size-2.5 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`flex flex-wrap items-center gap-x-2 text-sm font-semibold ${on ? 'text-primary' : 'text-text'}`}>
                      {c.title}
                      {!c.skip && <span className="text-xs font-medium text-muted">{t('companyDefault')}</span>}
                      {c.skip === skipNow && <span className="text-xs font-medium text-muted">{t('nowTag')}</span>}
                    </span>
                    <span className="block text-xs text-muted">{c.note}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {v.skipEvening !== skipNow && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted">{t('from')}</span>
                <DateTimeInput type="date" required value={v.validFrom} onChange={(x) => setV({ ...v, validFrom: x })} className="num min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-muted">{t('reason')}</span>
                <input value={v.reason} maxLength={200} placeholder={t('reasonHint')} onChange={(e) => setV({ ...v, reason: e.target.value })} className="min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm" />
              </label>
              <p className="text-xs text-faint">{t('hint')}</p>
            </>
          )}
          {err && <p className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { setOpen(false); setErr(null); }}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!ready || busy} className="flex-1">
              {busy ? '…' : t('save')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
