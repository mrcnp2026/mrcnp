'use client';
// 급여대장 「한꺼번에 넣기」 (2026-10-20 노프로 비교) — ① 엑셀로 여러 사람 · 여러 항목(가불 · 정산 · 상여 등) ② 같은 금액을 여러 명에게(상여 · 성과급).
// 한 칸 = 한 조정. 확정 전 대장에만 보인다. 넣은 뒤 「다시 계산」해야 금액에 반영된다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import type { BulkColumn, BulkLine, BulkMember } from '@/lib/payroll/bulk-adjust';

const field = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm';
type Err = { code: string; requestId?: string } | null;
type Res = { lines: BulkLine[]; columns: BulkColumn[]; saved?: number; failed?: { employeeId: string; code: string; error: string }[] };

export function BulkAdjust({ id, columns, members }: { id: string; columns: BulkColumn[]; members: BulkMember[] }) {
  const t = useTranslations('admin.payRuns.bulk');
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(members.map((m) => m.employeeId));
  const label = (code: string) => columns.find((c) => c.code === code)?.label ?? code;
  const nameOf = (eid: string) => members.find((m) => m.employeeId === eid)?.name ?? '';

  const upload = async (apply: boolean) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const fd = new FormData();
    fd.set('file', file);
    if (apply) fd.set('apply', '1');
    const r = await fetch(`/api/admin/payroll/runs/${id}/bulk`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok || !j) return setErr({ code: j?.error ?? 'generic', requestId: r.headers.get('x-request-id') ?? undefined });
    setRes(j as Res);
    if (apply) {
      setMsg(t('applied', { n: (j as Res).saved ?? 0, f: (j as Res).failed?.length ?? 0 }));
      router.refresh();
    }
  };

  const ready = res?.lines.filter((l) => !l.error && l.cells.length) ?? [];
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-3 text-sm">
      <div className="flex flex-col gap-2">
        <p className="font-bold">{t('excelTitle')}</p>
        <p className="text-xs text-faint">{t('excelHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/admin/payroll/runs/${id}/bulk`} className="inline-flex min-h-11 items-center rounded-button border border-border px-3 font-semibold lg:min-h-9">
            {t('download')}
          </a>
          <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); setMsg(null); }} className="min-w-0 max-w-full text-sm" />
          <Button type="button" size="sm" variant="outline" disabled={!file || busy} onClick={() => upload(false)}>
            {t('preview')}
          </Button>
        </div>
        {res && (
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col divide-y divide-border rounded-button border border-border">
              {res.lines.map((l) => (
                <li key={l.row} className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-2">
                  <span className="num w-10 shrink-0 text-faint">{l.row}</span>
                  <span className="w-24 shrink-0 font-semibold">{l.name || l.employeeNo}</span>
                  <span className="num min-w-0 flex-1">
                    {l.error ? <span className="text-warn">{t(`err.${l.error}`)}</span> : l.cells.length ? l.cells.map((c) => `${label(c.code)} ${c.amount.toLocaleString('ko-KR')}`).join(' · ') : <span className="text-faint">{t('empty')}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={busy || !ready.length} onClick={() => upload(true)}>
                {t('apply', { n: ready.reduce((a, l) => a + l.cells.length, 0) })}
              </Button>
              {res.failed && res.failed.length > 0 && <span className="text-xs text-warn">{res.failed.map((f) => `${nameOf(f.employeeId)} ${label(f.code)}`).join(', ')}</span>}
            </div>
          </div>
        )}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setErr(null);
          setMsg(null);
          const r = await callApi<{ saved: number; failed: unknown[] }>(`/api/admin/payroll/runs/${id}/bulk`, { itemCode: f.get('item'), amount: f.get('amount'), reason: f.get('reason'), employeeIds: picked });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setMsg(t('applied', { n: r.data.saved, f: r.data.failed.length }));
          router.refresh();
        }}
      >
        <p className="font-bold">{t('sameTitle')}</p>
        <p className="text-xs text-faint">{t('sameHint')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select name="item" required className={field} defaultValue={columns.find((c) => c.code === 'BONUS')?.code ?? ''}>
            {columns.map((c) => (
              <option key={c.code} value={c.code}>
                {t(c.kind === 'PAYMENT' ? 'kindPay' : 'kindDed')} · {c.label}
              </option>
            ))}
          </select>
          <input name="amount" inputMode="numeric" required placeholder={t('amount')} className={`num ${field}`} autoComplete="off" />
          <input name="reason" required minLength={2} maxLength={300} placeholder={t('reason')} className={field} autoComplete="off" />
        </div>
        <details className="rounded-button border border-border px-3 py-2">
          <summary className="cursor-pointer">{t('who', { n: picked.length, all: members.length })}</summary>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
            {members.map((m) => (
              <label key={m.employeeId} className="flex min-h-9 items-center gap-2">
                <input type="checkbox" className="size-5 accent-primary" checked={picked.includes(m.employeeId)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.employeeId] : picked.filter((x) => x !== m.employeeId))} />
                {m.name}
              </label>
            ))}
          </div>
        </details>
        <div>
          <Button type="submit" size="sm" disabled={busy || !picked.length}>
            {t('sameApply', { n: picked.length })}
          </Button>
        </div>
      </form>
      {msg && <p role="status" className="text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns.err" />}
    </div>
  );
}
