'use client';
// 출퇴근 기록 엑셀 일괄 입력 (2026-10-20 노프로 비교) — 날짜를 골라 양식 받기 → 출근 · 퇴근 시각 채워 올리기 → 미리보기 → 넣기. 접힌 한 줄.
// 관리자 대리 등록과 같은 길이라 줄마다 정정 기록(사유 · 넣은 사람)이 남는다. 이미 있는 기록은 덮지 않는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import type { PunchLine } from '@/lib/punch-bulk';

type Res = { lines: PunchLine[]; results?: { row: number; in: string | null; out: string | null }[] };

export function PunchBulk({ today }: { today: string }) {
  const t = useTranslations('admin.records.bulk');
  const te = useTranslations('errors');
  const tp = useTranslations('admin.detail');
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const why = (code: string) => (code === 'ok' ? t('ok') : tp.has(code) ? tp(code) : te.has(code) ? te(code) : t.has(`err.${code}`) ? t(`err.${code}`) : code);
  const send = async (apply: boolean) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set('file', file);
    if (apply) fd.set('apply', '1');
    const r = await fetch('/api/admin/punches/bulk', { method: 'POST', body: fd });
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
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="min-h-11 rounded-button border border-border bg-bg px-3 lg:min-h-9" aria-label={t('colDate')} />
          <a href={`/api/admin/punches/bulk?date=${date}`} className="inline-flex min-h-11 items-center rounded-button border border-border px-3 font-semibold lg:min-h-9">
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
                    <span className="min-w-0 flex-1 font-semibold">{l.name || l.employeeNo}</span>
                    <span className="num">{l.workDate} {l.in ?? '–'} ~ {l.out ? `${l.nextDay ? t('nextDay') : ''}${l.out}` : '–'}</span>
                    {l.error && <span className="w-full text-xs text-warn">{t(`err.${l.error}`)}</span>}
                    {done && (
                      <span className="w-full text-xs">
                        {done.in && <span className={done.in === 'ok' ? 'text-ok' : 'text-warn'}>{t('inResult', { r: why(done.in) })} </span>}
                        {done.out && <span className={done.out === 'ok' ? 'text-ok' : 'text-warn'}>{t('outResult', { r: why(done.out) })}</span>}
                      </span>
                    )}
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
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.records.bulk.err" />}
      </div>
    </details>
  );
}
