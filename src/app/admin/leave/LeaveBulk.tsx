'use client';
// 휴가(연차) 엑셀 일괄 입력 (2026-10-20 노프로 비교) — 양식 받기 → 한 줄에 휴가 한 건 → 미리보기 → 넣기. 최고관리자만, 접힌 한 줄.
// 직권 휴가와 같은 길이라 넣자마자 승인되고, 겹치거나 확정 · 마감된 날은 그 줄만 실패로 알린다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import type { LeaveLine } from '@/lib/leave-bulk';

type Res = { lines: LeaveLine[]; results?: { row: number; ok: boolean; code?: string; days?: number }[] };

export function LeaveBulk() {
  const t = useTranslations('admin.leaveBulk');
  const te = useTranslations('errors');
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const why = (code: string) => (t.has(`err.${code}`) ? t(`err.${code}`) : te.has(code) ? te(code) : code);
  const send = async (apply: boolean) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set('file', file);
    if (apply) fd.set('apply', '1');
    const r = await fetch('/api/admin/leave/bulk', { method: 'POST', body: fd });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok || !j) return setErr({ code: j?.error ?? 'generic', requestId: r.headers.get('x-request-id') ?? undefined });
    setRes(j as Res);
    if (apply) router.refresh();
  };
  const ok = res?.lines.filter((l) => !l.error) ?? [];
  return (
    <details className="rounded-card border border-border bg-bg px-4 py-3">
      <summary className="cursor-pointer font-bold">{t('title')}</summary>
      <div className="flex flex-col gap-3 pt-3 text-sm">
        <p className="text-xs text-faint">{t('hint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/admin/leave/bulk" className="inline-flex min-h-11 items-center rounded-button border border-border px-3 font-semibold lg:min-h-9">
            {t('download')}
          </a>
          <input type="file" accept=".xlsx" className="min-w-0 max-w-full" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} />
          <Button type="button" size="sm" variant="outline" disabled={!file || busy} onClick={() => send(false)}>
            {t('preview')}
          </Button>
        </div>
        {res && (
          <>
            <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto rounded-button border border-border">
              {res.lines.map((l) => {
                const done = res.results?.find((r) => r.row === l.row);
                return (
                  <li key={l.row} className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-2">
                    <span className="num w-8 shrink-0 text-faint">{l.row}</span>
                    <span className="w-20 shrink-0 font-semibold">{l.name || l.employeeNo}</span>
                    <span className="min-w-0 flex-1">{l.typeName}</span>
                    <span className="num">{l.startDate}{l.endDate && l.endDate !== l.startDate ? ` ~ ${l.endDate}` : ''}{l.startTime ? ` ${l.startTime}` : ''}</span>
                    {l.error && <span className="w-full text-xs text-warn">{why(l.error)}</span>}
                    {done && <span className={`w-full text-xs ${done.ok ? 'text-ok' : 'text-warn'}`}>{done.ok ? t('done', { n: done.days ?? 0 }) : why(done.code ?? 'generic')}</span>}
                  </li>
                );
              })}
            </ul>
            {!res.results && (
              <div>
                <Button type="button" size="sm" disabled={busy || !ok.length} onClick={() => send(true)}>
                  {t('apply', { n: ok.length })}
                </Button>
              </div>
            )}
          </>
        )}
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.leaveBulk.err" />}
      </div>
    </details>
  );
}
