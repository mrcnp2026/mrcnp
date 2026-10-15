'use client';
// 급여명세서 엑셀 올리기 — 파일을 고르면 바로 미리보기 → 칸 종류가 틀렸으면 고른다(다시 미리보기) → 막힌 줄이 없으면 [n명 공개]
// 저장 전에는 아무것도 남지 않는다. 서버: api/admin/payroll/slips
import { Download, Upload } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Chip } from '@/components/ui';
import { COL_KINDS, type ColKind, type SlipColumn, type SlipRow } from '@/lib/payroll/slip-upload';

type Preview = { header: number; columns: SlipColumn[]; lines: SlipRow[] };
type Err = { code: string; requestId?: string };

async function send(file: File, fields: Record<string, string>): Promise<{ ok: true; data: Preview & { count?: number } } | ({ ok: false } & Err)> {
  const fd = new FormData();
  fd.set('file', file);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    const r = await fetch('/api/admin/payroll/slips', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: j } : { ok: false, code: j.error ?? 'generic', requestId: j.requestId };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export function SlipUpload({ month, payDate: defaultPayDate }: { month: string; payDate: string }) {
  const t = useTranslations('admin.paySlips');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrides, setOverrides] = useState<Record<number, ColKind>>({});
  const [payDate, setPayDate] = useState(defaultPayDate);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [ask, setAsk] = useState(false);
  const f = useFormatter();
  const n = (v: number) => f.number(v);

  const look = async (f: File, o: Record<number, ColKind>) => {
    setBusy(true);
    setErr(null);
    setDone(null);
    const r = await send(f, { month, overrides: JSON.stringify(o) });
    setBusy(false);
    if (!r.ok) {
      setPreview(null);
      return setErr(r);
    }
    setPreview(r.data);
  };
  const blocked = preview ? preview.lines.filter((l) => l.errors.length > 0).length : 0;
  const ready = !!preview && preview.lines.length > 0 && blocked === 0 && /^\d{4}-\d{2}-\d{2}$/.test(payDate);

  return (
    <div className="flex flex-col gap-4" data-slip-upload>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          aria-label={t('pickFile')}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setOverrides({});
            setAsk(false);
            if (f) void look(f, {});
            e.target.value = '';
          }}
        />
        <Button type="button" onClick={() => input.current?.click()} disabled={busy} data-slip-pick>
          <Upload aria-hidden size={18} strokeWidth={2} />
          {t('upload')}
        </Button>
        <a href="/api/admin/payroll/slips" className="inline-flex min-h-11 items-center gap-2 rounded-button border border-border bg-bg px-4 text-sm font-bold text-text hover:bg-surface">
          <Download aria-hidden size={18} strokeWidth={2} />
          {t('template')}
        </a>
        {file && <span className="text-sm text-muted">{file.name}</span>}
      </div>
      <p className="text-sm text-faint">{t('uploadHint')}</p>
      {busy && <p className="text-sm text-muted">{t('reading')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.paySlips" />}
      {done !== null && <p className="rounded-card bg-ok-tint p-3 text-sm font-semibold text-ok" data-slip-done>{t('done', { n: done, month })}</p>}

      {preview && file && (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="font-bold">{t('columnsTitle', { row: preview.header })}</h3>
            <p className="text-sm text-muted">{t('columnsHint')}</p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-slip-columns>
              {preview.columns.map((c) => (
                <li key={c.index} className="flex items-center gap-2 rounded-button border border-border px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.header || t('noHeader', { n: c.index + 1 })}</span>
                  {c.guessed && <Chip tone="warn">{t('guessed')}</Chip>}
                  <select
                    value={c.kind}
                    aria-label={t('kindOf', { col: c.header || String(c.index + 1) })}
                    disabled={busy}
                    onChange={(e) => {
                      const o = { ...overrides, [c.index]: e.target.value as ColKind };
                      setOverrides(o);
                      void look(file, o);
                    }}
                    className="min-h-9 rounded-button border border-border bg-bg px-2 text-sm"
                  >
                    {COL_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`kind.${k}`)}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-bold">
              {t('rowsTitle', { n: preview.lines.length })}
              {blocked > 0 && <span className="ml-2 text-sm font-semibold text-danger">{t('blocked', { n: blocked })}</span>}
            </h3>
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full text-sm" data-slip-rows>
                <thead className="bg-surface text-left text-muted">
                  <tr>
                    <th className="px-3 py-2">{t('colRow')}</th>
                    <th className="px-3 py-2">{t('colNo')}</th>
                    <th className="px-3 py-2">{t('colName')}</th>
                    <th className="px-3 py-2 text-right">{t('colPay')}</th>
                    <th className="px-3 py-2 text-right">{t('colDed')}</th>
                    <th className="px-3 py-2 text-right">{t('colNet')}</th>
                    <th className="px-3 py-2">{t('colState')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.lines.map((l) => (
                    <tr key={l.row} className={l.errors.length ? 'bg-danger-tint' : ''}>
                      <td className="num px-3 py-2 text-muted">{l.row}</td>
                      <td className="num px-3 py-2">{l.employeeNo}</td>
                      <td className="px-3 py-2 font-semibold">{l.name}</td>
                      <td className="num px-3 py-2 text-right">{n(l.pay)}</td>
                      <td className="num px-3 py-2 text-right">{n(l.deduction)}</td>
                      <td className="num px-3 py-2 text-right font-bold">{n(l.net)}</td>
                      <td className="px-3 py-2">{l.errors.length ? <span className="text-danger">{l.errors.map((e) => t(`rowError.${e}`)).join(' · ')}</span> : <span className="text-ok">{t('rowOk')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('payDate')}
              <DateTimeInput type="date" value={payDate} onChange={setPayDate} aria-label={t('payDate')} className="num min-h-11 rounded-button border border-border bg-bg px-3 text-base text-text" />
            </label>
            {!ask ? (
              <Button type="button" disabled={!ready || busy} onClick={() => setAsk(true)} data-slip-apply>
                {t('publish', { n: preview.lines.length })}
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-card border border-border p-3">
                <p className="text-sm">{t('confirm', { n: preview.lines.length, month })}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={busy}
                    data-slip-confirm
                    onClick={async () => {
                      setBusy(true);
                      setErr(null);
                      const r = await send(file, { month, payDate, overrides: JSON.stringify(overrides), apply: '1' });
                      setBusy(false);
                      setAsk(false);
                      if (!r.ok) return setErr(r);
                      setDone(r.data.count ?? 0);
                      setPreview(null);
                      setFile(null);
                      router.refresh();
                    }}
                  >
                    {t('confirmYes')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAsk(false)}>
                    {t('back')}
                  </Button>
                </div>
              </div>
            )}
            {blocked > 0 && <p className="text-sm text-danger">{t('fixFirst')}</p>}
          </div>
        </>
      )}
    </div>
  );
}

export function SlipWithdraw({ ids, label }: { ids: string[]; label: string }) {
  const t = useTranslations('admin.paySlips');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err | null>(null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-9 text-sm font-bold text-danger" data-slip-withdraw>
        {label}
      </button>
    );
  return (
    <form
      className="flex flex-col gap-2 rounded-button bg-surface p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await fetch('/api/admin/payroll/slips/withdraw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids, reason }) }).catch(() => null);
        const j = r ? await r.json().catch(() => ({})) : {};
        setBusy(false);
        if (!r?.ok) return setErr({ code: j.error ?? 'network', requestId: j.requestId });
        setOpen(false);
        router.refresh();
      }}
    >
      <p className="text-sm text-warn">{t('withdrawWarn')}</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} maxLength={200} placeholder={t('withdrawReason')} aria-label={t('withdrawReason')} className="min-h-11 rounded-button border border-border bg-bg px-3 text-base text-text" />
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.paySlips" />}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={busy || reason.trim().length < 2}>
          {t('withdrawYes')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          {t('back')}
        </Button>
      </div>
    </form>
  );
}
