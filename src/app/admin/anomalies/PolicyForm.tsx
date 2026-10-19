'use client';
// 이상 유형마다 마감을 막을지 · 확인만 할지 · 보지 않을지 고른다. 저장하면 새 판이 쌓이고 마감 관리가 바로 이 기준을 쓴다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { ANOMALY_TYPES, type AnomalyLevel, type AnomalyPolicy } from '@/lib/anomaly';

export function PolicyForm({ policy, version, counts }: { policy: AnomalyPolicy; version: number; counts: Record<string, number> }) {
  const t = useTranslations('admin.anomalies');
  const router = useRouter();
  const [value, setValue] = useState(policy);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const dirty = ANOMALY_TYPES.some((k) => value[k] !== policy[k]);
  return (
    <div className="flex flex-col gap-3">
      {/* 폰: 유형마다 한 묶음 — 표의 좁은 첫 칸에서 설명이 한두 글자씩 줄을 바꿔 화면이 아주 길어졌다 (2026-10-18 디자인) */}
      <ul className="divide-y divide-border rounded-card border border-border bg-bg lg:hidden">
        {ANOMALY_TYPES.map((k) => (
          <li key={k} className="flex flex-col gap-1.5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 font-bold">{t(`type.${k}`)}</span>
              <span className="num text-sm text-muted">{t('colCount')} {counts[k] ?? 0}</span>
            </div>
            <p className="text-xs text-faint">{t(`why.${k}`)}</p>
            <select
              value={value[k]}
              aria-label={t(`type.${k}`)}
              onChange={(e) => {
                setDone(false);
                setValue({ ...value, [k]: e.target.value as AnomalyLevel });
              }}
              className="min-h-11 w-full rounded-button border border-border bg-bg px-3 text-sm"
            >
              <option value="block">{t('level.block')}</option>
              <option value="check">{t('level.check')}</option>
              <option value="off">{t('level.off')}</option>
            </select>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto table-ruled lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              {[t('colType'), t('colCount'), t('colLevel')].map((h) => (
                <th key={h} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ANOMALY_TYPES.map((k) => (
              <tr key={k} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2">
                  <span className="font-bold">{t(`type.${k}`)}</span>
                  <span className="block text-xs text-faint">{t(`why.${k}`)}</span>
                </td>
                <td className="num px-3 py-2">{counts[k] ?? 0}</td>
                <td className="px-3 py-2">
                  <select
                    value={value[k]}
                    aria-label={t(`type.${k}`)}
                    onChange={(e) => {
                      setDone(false);
                      setValue({ ...value, [k]: e.target.value as AnomalyLevel });
                    }}
                    className="min-h-9 rounded-button border border-border bg-bg px-3 text-sm"
                  >
                    <option value="block">{t('level.block')}</option>
                    <option value="check">{t('level.check')}</option>
                    <option value="off">{t('level.off')}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.anomalies" />}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={busy || !dirty}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const r = await callApi('/api/admin/anomalies', { policy: value, expectedVersion: version });
            setBusy(false);
            if (!r.ok) return setErr(r);
            setDone(true);
            router.refresh();
          }}
        >
          {t('save')}
        </Button>
        {done && (
          <span role="status" className="text-sm text-ok">
            {t('saved')}
          </span>
        )}
      </div>
    </div>
  );
}

/** 「확인만」 유형의 날: 봤다고 표시하거나 거둔다. 마감을 막는 날에는 이 버튼이 없다(기록을 고쳐야 풀린다) */
// 줄마다 테두리 단추를 반복하지 않는다 — 글자 단추 (2026-10-14 목록 틀)
export function ReviewButton({ employeeId, workDate, types, reviewed, live }: { employeeId: string; workDate: string; types: string[]; reviewed: boolean; live: boolean }) {
  const t = useTranslations('admin.anomalies');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await callApi('/api/admin/anomalies', { action: reviewed ? 'unreview' : 'review', employeeId, workDate, types, live });
        setBusy(false);
        router.refresh();
      }}
      className={`inline-flex min-h-8 items-center text-sm font-bold whitespace-nowrap disabled:opacity-50 ${reviewed ? 'text-muted hover:text-text' : 'text-primary hover:underline'}`}
    >
      {t(reviewed ? 'reviewedUndo' : 'reviewDo')}
    </button>
  );
}

/** 이상자 통보 — 업무 메시지로 본인에게. 누르면 한 번 더 묻는다 (보낸 메시지는 고치거나 지울 수 없다) */
export function NotifyButton({ month, employeeIds, label, confirm, live, primary = false }: { month: string; employeeIds?: string[]; label: string; confirm: string; live: boolean; primary?: boolean }) {
  const t = useTranslations('admin.anomalies');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(confirm)) return;
          setBusy(true);
          const r = await callApi<{ sent: number }>('/api/admin/anomalies', { action: 'notify', month, employeeIds, live });
          setBusy(false);
          if (r.ok) {
            setDone(r.data.sent);
            router.refresh();
          }
        }}
        className={primary ? 'inline-flex h-9 items-center rounded-button bg-primary px-3.5 text-sm font-bold text-on-primary disabled:opacity-50' : 'inline-flex min-h-8 items-center text-sm font-bold whitespace-nowrap text-primary hover:underline disabled:opacity-50'}
      >
        {label}
      </button>
      {done !== null && primary && <span role="status" className="text-sm text-ok">{t('notify.sent', { n: done })}</span>}
    </span>
  );
}
