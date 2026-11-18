'use client';
// 직원별 저녁 휴게 기본값 (급여-78, 2026-11-18 의뢰인: 저녁 휴게 없이 일하는 직원은 한 번 설정) — 지금 판 한 줄 + 「바꾸기」로 새 판.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-sm lg:min-h-9';

export function BreakDefault({ employeeId, current, today }: { employeeId: string; current: { skipEvening: boolean; validFrom: string } | null; today: string }) {
  const t = useTranslations('admin.members.breakDefault');
  const te = useTranslations('errors');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ skipEvening: !current?.skipEvening, validFrom: today, reason: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    if (!v.reason.trim() || v.reason.trim().length > 200) return setMsg({ ok: false, text: t('reasonRequired') });
    setBusy(true);
    setMsg(null);
    const r = await callApi(`/api/admin/employees/${employeeId}/break-default`, v);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.code === 'reason_required' ? t('reasonRequired') : te.has(r.code) ? te(r.code) : te('generic') });
    setOpen(false);
    setMsg({ ok: true, text: t('saved') });
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-2 border-b border-border py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-24 shrink-0 text-muted">{t('title')}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="num font-semibold">{current?.skipEvening ? t.rich('off', { from: current.validFrom, d: (x) => <span className="whitespace-nowrap">{x}</span> }) : t('on')}</span>
          <span className="text-xs text-faint">{current?.skipEvening ? t('offNote') : t('onNote')}</span>
        </span>
        {!open && (
          <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary lg:min-h-9">
            {t('change')} ›
          </button>
        )}
      </div>
      {msg?.ok && <p role="status" className="text-sm font-semibold text-ok">{msg.text}</p>}
      {open && (
        <div className="flex flex-col gap-2 rounded-card bg-surface p-3">
          <div role="radiogroup" aria-label={t('title')} className="flex gap-2">
            {[false, true].map((skip) => (
              <button key={String(skip)} type="button" role="radio" aria-checked={v.skipEvening === skip} onClick={() => setV({ ...v, skipEvening: skip })} className={`min-h-11 flex-1 rounded-button border px-3 text-sm font-semibold lg:min-h-9 ${v.skipEvening === skip ? 'border-primary bg-primary text-on-primary' : 'border-border bg-bg text-text'}`}>
                {skip ? t('pickOff') : t('pickOn')}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t('from')}</span>
            <DateTimeInput type="date" required value={v.validFrom} onChange={(x) => setV({ ...v, validFrom: x })} className={`num ${field}`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t('reason')}</span>
            <input value={v.reason} maxLength={200} placeholder={t('reasonHint')} onChange={(e) => setV({ ...v, reason: e.target.value })} className={field} />
          </label>
          <p className="text-xs text-faint">{t('hint')}</p>
          {msg && !msg.ok && <p className="text-sm text-danger">{msg.text}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className="min-h-11 rounded-button px-4 text-sm font-semibold text-muted lg:min-h-9">
              {t('cancel')}
            </button>
            <button type="button" onClick={save} disabled={busy} className="min-h-11 rounded-button bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-50 lg:min-h-9">
              {busy ? '…' : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
