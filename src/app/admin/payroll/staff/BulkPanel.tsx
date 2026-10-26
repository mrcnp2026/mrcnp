'use client';
// 사원별 급여 — 고른 직원 여러 명에게 한 번에 적용 (2026-10-25 의뢰인). 목록의 체크칸으로 직원을 고르고, 이 판에서 무엇을 바꿀지 정한다.
// 체크칸(BulkCheck)은 서버가 그린 목록 안에 있고, 여기서는 화면에 보이는 체크 표시만 읽는다(폰 목록과 PC 표가 함께 있어 숨은 쪽은 센다).
// 적용 전에 「N명에게 무엇을」을 한 번 더 보여 준다. 직원마다 새 판이 쌓이고(이력), 한 명이 막혀도 나머지는 저장되며 막힌 직원은 이유와 함께 보인다.
import { Select } from '@/components/Select';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text lg:min-h-9 lg:text-sm';
const checked = () => [...new Set([...document.querySelectorAll<HTMLInputElement>('input[data-bulk-id]:checked')].filter((el) => el.offsetParent !== null).map((el) => el.dataset.bulkId!))];

export function BulkCheck({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" data-bulk-id={id} aria-label={label} className="size-5 accent-primary lg:size-4" />;
}

export function BulkAll({ label }: { label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-5 accent-primary lg:size-4"
      onChange={(e) => {
        for (const el of document.querySelectorAll<HTMLInputElement>('input[data-bulk-id]')) if (el.offsetParent !== null) el.checked = e.currentTarget.checked;
        document.dispatchEvent(new Event('change'));
      }}
    />
  );
}

type Action = 'contract' | 'insurance' | 'item';
type Result = { done: number; total: number; failed: { id: string; code?: string }[] };
const INSURERS = ['pension', 'health', 'employment', 'accident'] as const;

export function BulkPanel({ names, today, items }: { names: Record<string, string>; today: string; items: { code: string; label: string; defaultAmount: number | null }[] }) {
  const t = useTranslations('admin.staffPay');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [action, setAction] = useState<Action>('contract');
  const [mode, setMode] = useState('keep');
  const [item, setItem] = useState(items[0]?.code ?? '');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  useEffect(() => {
    const on = () => setCount(checked().length);
    document.addEventListener('change', on);
    return () => document.removeEventListener('change', on);
  }, []);
  const pickedItem = items.find((i) => i.code === item);

  function read(form: HTMLFormElement): Record<string, unknown> | null {
    const fd = new FormData(form);
    const g = (k: string) => String(fd.get(k) ?? '').trim();
    const common = { action, ids: checked(), validFrom: g('validFrom'), reason: g('reason') };
    if (action === 'contract') return { ...common, amountMode: g('amountMode') || 'keep', amountValue: g('amountValue'), timeBasis: g('timeBasis'), monthlyHours: g('monthlyHours') };
    if (action === 'insurance') return { ...common, insurance: Object.fromEntries(INSURERS.map((k) => [k, g(`ins.${k}`)])) };
    return { ...common, itemCode: item, amount: g('amount') === '' ? null : Number(g('amount')), note: g('note') || null };
  }

  const summary = () => {
    if (!asking) return '';
    if (action === 'contract') return [asking.amountMode !== 'keep' ? t(`bulk.mode.${asking.amountMode as string}`) + ` ${asking.amountValue}` : null, asking.timeBasis ? t(`timeBasis.${asking.timeBasis as 'ACTUAL'}`) : null, asking.monthlyHours ? `${t('fMonthlyHours')} ${asking.monthlyHours}` : null].filter(Boolean).join(' · ');
    if (action === 'insurance') return INSURERS.filter((k) => (asking.insurance as Record<string, string>)[k]).map((k) => `${t(`insurer.${k}`)} ${t(`tri.${(asking.insurance as Record<string, string>)[k] as 'YES'}`)}`).join(' · ');
    return `${pickedItem?.label ?? ''} ${asking.amount ?? t('itemDefault')}`;
  };

  return (
    <Card className="p-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2 px-4 text-left font-bold">
        <span className="flex-1">{t('bulk.title')}</span>
        <span className={`num rounded-chip px-2 py-0.5 text-xs ${count ? 'bg-primary-tint text-primary' : 'bg-surface text-muted'}`}>{t('bulk.selected', { n: count })}</span>
        <ChevronDown aria-hidden size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <form
          className="flex flex-col gap-3 border-t border-border px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            setRes(null);
            const body = read(e.currentTarget);
            if (body && (body.ids as string[]).length > 0) setAsking(body);
          }}
        >
          <p className="text-sm text-muted">{count ? t('bulk.hint') : t('bulk.pick')}</p>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('bulk.what')}
            <Select value={action} onChange={(e) => { setAction(e.target.value as Action); setAsking(null); }} className={`${field} sm:max-w-sm`}>
              <option value="contract">{t('bulk.act.contract')}</option>
              <option value="insurance">{t('bulk.act.insurance')}</option>
              <option value="item">{t('bulk.act.item')}</option>
            </Select>
          </label>

          {action === 'contract' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('bulk.amount')}
                <Select name="amountMode" value={mode} onChange={(e) => setMode(e.target.value)} className={field}>
                  {(['keep', 'percent', 'add', 'set'] as const).map((k) => (
                    <option key={k} value={k}>{t(`bulk.mode.${k}`)}</option>
                  ))}
                </Select>
              </label>
              {mode !== 'keep' && (
                <label className="flex flex-col gap-1 text-sm text-muted">
                  {mode === 'percent' ? t('bulk.percent') : t('bulk.won')}
                  <input name="amountValue" type="number" step={mode === 'percent' ? '0.01' : '1'} required className={`num ${field}`} />
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('fTimeBasis')}
                <Select name="timeBasis" defaultValue="" className={field}>
                  <option value="">{t('bulk.keep')}</option>
                  {(['ROUNDED', 'ACTUAL', 'SCHEDULE'] as const).map((k) => (
                    <option key={k} value={k}>{t(`timeBasis.${k}`)}</option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('fMonthlyHours')}
                <input name="monthlyHours" type="number" step="0.01" min="1" max="744" placeholder={t('bulk.keep')} className={`num ${field}`} />
              </label>
              <p className="text-xs text-faint sm:col-span-2">{t('bulk.contractNote')}</p>
            </div>
          )}

          {action === 'insurance' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {INSURERS.map((k) => (
                <label key={k} className="flex flex-col gap-1 text-sm text-muted">
                  {t(`insurer.${k}`)}
                  <Select name={`ins.${k}`} defaultValue="" className={field}>
                    <option value="">{t('bulk.keep')}</option>
                    <option value="YES">{t('tri.YES')}</option>
                    <option value="NO">{t('tri.NO')}</option>
                  </Select>
                </label>
              ))}
            </div>
          )}

          {action === 'item' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('colItem')}
                <Select value={item} onChange={(e) => setItem(e.target.value)} className={field}>
                  {items.map((o) => (
                    <option key={o.code} value={o.code}>{o.label}</option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('fItemAmount')}
                <input name="amount" type="number" min="0" step="1" required={!pickedItem || pickedItem.defaultAmount === null} placeholder={pickedItem?.defaultAmount != null ? t('itemDefaultIs', { n: pickedItem.defaultAmount }) : ''} className={`num ${field}`} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-muted sm:col-span-2">
                {t('colNote')}
                <input name="note" maxLength={300} autoComplete="off" className={field} />
              </label>
              <p className="text-xs text-faint sm:col-span-2">{t('bulk.itemNote')}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('fValidFrom')}
              <input name="validFrom" type="date" required defaultValue={today} className={`num ${field}`} />
            </label>
            {action !== 'item' && (
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('bulk.reason')}
                <input name="reason" required minLength={2} maxLength={500} autoComplete="off" placeholder={t('bulk.reasonPh')} className={field} />
              </label>
            )}
          </div>

          {asking ? (
            <div className="flex flex-col gap-2 rounded-card bg-warn-tint p-3 text-sm">
              <p className="font-bold text-warn">{t('bulk.confirm', { n: (asking.ids as string[]).length })}</p>
              <p className="text-text">{summary()}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={busy} onClick={async () => {
                  setBusy(true);
                  const r = await callApi<Result>('/api/admin/payroll/staff/bulk', asking);
                  setBusy(false);
                  setAsking(null);
                  if (!r.ok) return setErr(r);
                  setRes(r.data);
                  router.refresh();
                }}>
                  {t('bulk.apply')}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsking(null)}>{t('bulk.cancel')}</Button>
              </div>
            </div>
          ) : (
            <div>
              <Button type="submit" size="sm" disabled={busy || count === 0}>{t('bulk.submit', { n: count })}</Button>
            </div>
          )}
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.staffPay" />}
          {res && (
            <div role="status" className="flex flex-col gap-1 text-sm">
              <p className={res.failed.length ? 'font-bold text-warn' : 'font-bold text-ok'}>{t('bulk.result', { done: res.done, total: res.total })}</p>
              {res.failed.length > 0 && (
                <ul className="text-warn">
                  {res.failed.map((f) => (
                    <li key={f.id}>{names[f.id] ?? f.id}: {t.has(`bulk.err.${f.code}`) ? t(`bulk.err.${f.code}`) : (f.code ?? '')}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}
    </Card>
  );
}
