'use client';
// 마감 관리의 표 — 직원을 골라 마감하고, 마감된 사람은 사유를 적어 다시 연다. 처리하면 화면을 새로 읽는다.
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Chip } from '@/components/ui';

export type Line = {
  employeeId: string;
  name: string;
  group: string;
  active: boolean;
  recordDays: number;
  unconfirmed: number;
  deemedDays: number;
  pending: { key: string; n: number }[];
  hours: string;
  hash: string;
  ready: boolean;
  reopenRequest: { id: string; reason: string; by: string; mine: boolean } | null; // 다른 관리자의 확인을 기다리는 다시 열기 요청
  anomalyBlocks: number; // 마감을 막는 이상 기록(일 수)
  anomalyChecks: number; // 확인만 하는 이상 기록(일 수)
  close: { id: string; revision: number; by: string; at: string } | null;
  reopened: { revision: number; at: string; reason: string }[];
};
type Result = { employeeId: string; result: string };

export function CloseBoard({ month, live, lines, canClose }: { month: string; live: boolean; lines: Line[]; canClose: boolean }) {
  const t = useTranslations('admin.closing');
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [reopen, setReopen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ready = lines.filter((l) => l.ready && !l.close);
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const r = await callApi<{ results?: Result[]; reopen?: string }>('/api/admin/closing', body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return false;
    }
    setResults(r.data.results ?? []);
    setNotice(r.data.reopen === 'requested' ? t('reopenRequested') : null);
    setPicked(new Set());
    setAsk(false);
    setReopen(null);
    router.refresh();
    return true;
  };
  const resultOf = (id: string) => results.find((r) => r.employeeId === id)?.result;
  const q = live ? '&live=1' : '';

  // 다시 열기 · 다시 열기 요청 처리 — PC 표와 폰 목록이 같이 쓴다
  const manage = (l: Line) => (
    <>
      {l.close && l.reopenRequest && (
        <span className="flex min-w-56 flex-col gap-2 text-sm">
          <span className="text-warn">{t('reopenWaiting', { name: l.reopenRequest.by })}</span>
          <span className="text-xs text-muted">{l.reopenRequest.reason}</span>
          <span className="flex gap-2">
            {l.reopenRequest.mine ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ action: 'reopenDecide', requestId: l.reopenRequest!.id, decision: 'cancelled' })}>
                {t('reopenCancel')}
              </Button>
            ) : (
              <>
                <Button type="button" size="sm" disabled={busy} onClick={() => run({ action: 'reopenDecide', requestId: l.reopenRequest!.id, decision: 'approved' })}>
                  {t('reopenApprove')}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ action: 'reopenDecide', requestId: l.reopenRequest!.id, decision: 'rejected' })}>
                  {t('reopenReject')}
                </Button>
              </>
            )}
          </span>
        </span>
      )}
      {l.close && !l.reopenRequest &&
        (reopen === l.close.id ? (
          <form
            className="flex min-w-64 flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await run({ action: 'reopen', id: l.close!.id, reason: new FormData(e.currentTarget).get('reason') });
            }}
          >
            <input name="reason" required minLength={2} maxLength={500} placeholder={t('reopenReason')} aria-label={t('reopenReason')} className="min-h-9 w-full rounded-button border border-border bg-bg px-3 text-sm" autoComplete="off" />
            <span className="text-xs text-faint">{t('reopenHint')}</span>
            <span className="flex gap-2">
              <Button type="submit" size="sm" variant="outline" disabled={busy}>
                {t('reopenDo')}
              </Button>
              <button type="button" onClick={() => setReopen(null)} className="min-h-9 px-2 text-sm text-muted">
                {t('no')}
              </button>
            </span>
          </form>
        ) : (
          <button type="button" onClick={() => setReopen(l.close!.id)} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
            {t('reopen')}
          </button>
        ))}
    </>
  );
  const stateOf = (l: Line, res: string | undefined) => (
    <>
      {l.close ? <Chip tone="ok">{t('stateClosed', { n: l.close.revision })}</Chip> : l.ready ? <Chip tone="info">{t(l.recordDays === 0 ? 'stateEmpty' : 'stateReady')}</Chip> : <Chip tone="warn">{t('stateBlocked')}</Chip>}
      {l.close && <span className="num block pt-1 text-xs text-faint">{t('closedBy', { name: l.close.by, date: l.close.at })}</span>}
      {res && <span className={`block pt-1 text-xs ${res === 'closed' ? 'text-ok' : 'text-warn'}`}>{t(`result.${res}`)}</span>}
      {l.reopened.map((h) => (
        <span key={h.revision} className="block pt-1 text-xs text-faint">
          {t('historyLine', { n: h.revision, date: h.at, reason: h.reason })}
        </span>
      ))}
    </>
  );
  // 폰: 한 사람 = 두 줄(이름 · 시간 · 상태 / 걸리는 것만) — 8줄 카드로 25명이 7천 px였다 (2026-10-17 디자인)
  const issues = (l: Line) => [
    l.unconfirmed > 0 && (
      <Link key="u" href={`/admin/records/list?from=${month}-01&q=${encodeURIComponent(l.name)}${q}`} className="font-bold text-warn underline">
        {t('colUnconfirmed')} {l.unconfirmed}
      </Link>
    ),
    ...l.pending.map((p) => (
      <Link key={p.key} href={`/admin/inbox${live ? '?live=1' : ''}`} className="font-bold text-warn underline">
        {t(`pendingOf.${p.key}`, { n: p.n })}
      </Link>
    )),
    l.anomalyBlocks > 0 && (
      <Link key="ab" href={`/admin/anomalies?m=${month}${q}`} className="font-bold text-warn underline">
        {t('anomalyBlock', { n: l.anomalyBlocks })}
      </Link>
    ),
    l.anomalyChecks > 0 && (
      <Link key="ac" href={`/admin/anomalies?m=${month}${q}`} className="text-muted underline">
        {t('anomalyCheck', { n: l.anomalyChecks })}
      </Link>
    ),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      {canClose && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setPicked(new Set(picked.size === ready.length ? [] : ready.map((l) => l.employeeId)))} disabled={ready.length === 0} className="inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50">
            {t('pickAll')}
          </button>
          {ask ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-warn">{t('closeConfirm', { n: picked.size, month })}</span>
              <Button type="button" size="sm" disabled={busy} onClick={() => run({ action: 'close', month, live, items: lines.filter((l) => picked.has(l.employeeId)).map((l) => ({ employeeId: l.employeeId, hash: l.hash })) })}>
                {busy ? t('closing') : t('yes')}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsk(false)}>
                {t('no')}
              </Button>
            </span>
          ) : (
            <Button type="button" size="sm" disabled={picked.size === 0} onClick={() => setAsk(true)}>
              {t('close', { n: picked.size })}
            </Button>
          )}
        </div>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.closing" />}
      {notice && <p role="status" className="rounded-card border border-border bg-bg p-3 text-sm text-ok">{notice}</p>}
      <ul className="divide-y divide-border rounded-card border border-border bg-bg lg:hidden">
        {lines.map((l) => {
          const res = resultOf(l.employeeId);
          const extra = issues(l);
          return (
            <li key={l.employeeId} className="flex gap-3 px-3 py-2.5">
              <span className="flex w-5 shrink-0 pt-0.5">{canClose && l.ready && !l.close && <input type="checkbox" checked={picked.has(l.employeeId)} onChange={() => toggle(l.employeeId)} aria-label={t('pick', { name: l.name })} className="size-5 accent-primary" />}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Link href={`/admin/members/${l.employeeId}`} className="shrink-0 font-bold">
                    {l.name}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-xs text-faint">{l.group}</span>
                  <span className="num shrink-0 text-sm">{l.hours}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="num text-faint">{t('mobileDays', { n: l.recordDays })}</span>
                  {extra}
                  <span className="ml-auto">{stateOf(l, res)}</span>
                </div>
                {manage(l)}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="overflow-x-auto rounded-card border border-border bg-bg max-lg:hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th scope="col" className="w-10 px-3 py-2" />
              {['colName', 'colGroup', 'colDays', 'colUnconfirmed', 'colPending', 'colAnomaly', 'colHours', 'colState', 'colManage'].map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const res = resultOf(l.employeeId);
              return (
                <tr key={l.employeeId} className="border-b border-border align-top">
                  <td className="px-3 py-3">{canClose && l.ready && !l.close && <input type="checkbox" checked={picked.has(l.employeeId)} onChange={() => toggle(l.employeeId)} aria-label={t('pick', { name: l.name })} className="size-5 accent-primary" />}</td>
                  <td data-label={t('colName')} className="px-3 py-3">
                    <Link href={`/admin/members/${l.employeeId}`} className="font-bold hover:text-primary">
                      {l.name}
                    </Link>
                    {!l.active && <span className="ml-2 text-xs text-faint">{t('inactive')}</span>}
                  </td>
                  <td data-label={t('colGroup')} className="px-3 py-3 text-muted">{l.group}</td>
                  <td data-label={t('colDays')} className="num px-3 py-3">
                    {l.recordDays}
                    {l.deemedDays > 0 && <span className="block text-xs text-faint">{t('deemed', { n: l.deemedDays })}</span>}
                  </td>
                  <td data-label={t('colUnconfirmed')} className="num px-3 py-3">
                    {l.unconfirmed > 0 ? (
                      <Link href={`/admin/records/list?from=${month}-01&q=${encodeURIComponent(l.name)}${q}`} className="font-bold text-warn underline">
                        {l.unconfirmed}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td data-label={t('colPending')} className="px-3 py-3">
                    {l.pending.length === 0 ? (
                      <span className="num">0</span>
                    ) : (
                      <Link href={`/admin/inbox${live ? '?live=1' : ''}`} className="flex flex-col font-bold text-warn underline">
                        {l.pending.map((p) => (
                          <span key={p.key} className="num">
                            {t(`pendingOf.${p.key}`, { n: p.n })}
                          </span>
                        ))}
                      </Link>
                    )}
                  </td>
                  <td data-label={t('colAnomaly')} className="num px-3 py-3">
                    {l.anomalyBlocks + l.anomalyChecks === 0 ? (
                      0
                    ) : (
                      <Link href={`/admin/anomalies?m=${month}${q}`} className="flex flex-col underline">
                        {l.anomalyBlocks > 0 && <span className="font-bold text-warn">{t('anomalyBlock', { n: l.anomalyBlocks })}</span>}
                        {l.anomalyChecks > 0 && <span className="text-muted">{t('anomalyCheck', { n: l.anomalyChecks })}</span>}
                      </Link>
                    )}
                  </td>
                  <td data-label={t('colHours')} className="num px-3 py-3 whitespace-nowrap">{l.hours}</td>
                  <td data-label={t('colState')} className="px-3 py-3">
                    {stateOf(l, res)}
                  </td>
                  <td data-label={t('colManage')} className="px-3 py-3">
                    {manage(l)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
