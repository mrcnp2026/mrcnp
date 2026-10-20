'use client';
// 직원 여러 명 엑셀로 등록 (2026-10-20 노프로 비교) — 양식 받기 → 채워 올리기 → 미리보기 → 등록. 접힌 한 줄로 두고 펼쳐서 쓴다.
// 초대 링크는 자동으로 보내지 않는다. 등록한 뒤 직원마다 「초대 보내기」를 쓴다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import type { StaffLine } from '@/lib/staff-bulk';

type Res = { lines: StaffLine[]; results?: { row: number; ok: boolean; code?: string }[] };

export function StaffImport() {
  const t = useTranslations('admin.members.import');
  const te = useTranslations('errors');
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const why = (code: string) => (te.has(code) ? te(code) : t.has(`err.${code}`) ? t(`err.${code}`) : code);
  const send = async (apply: boolean) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set('file', file);
    if (apply) fd.set('apply', '1');
    const r = await fetch('/api/admin/employees/import', { method: 'POST', body: fd });
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
          <a href="/api/admin/employees/import" className="inline-flex min-h-11 items-center rounded-button border border-border px-3 font-semibold lg:min-h-9">
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
                    <span className="num w-20 shrink-0">{l.employeeNo}</span>
                    <span className="min-w-0 flex-1 font-semibold">{l.name}</span>
                    {l.error ? <span className="text-warn">{why(l.error)}</span> : done ? <span className={done.ok ? 'text-ok' : 'text-warn'}>{done.ok ? t('done') : why(done.code ?? 'generic')}</span> : <span className="text-muted">{t('ready')}</span>}
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
            {res.results && <p role="status" className="text-ok">{t('result', { ok: res.results.filter((r) => r.ok).length, fail: res.results.filter((r) => !r.ok).length })}</p>}
          </>
        )}
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.members.import.err" />}
      </div>
    </details>
  );
}
