'use client';
// 급여 점검 항목 한 줄 (결정 급여-68) — 누르면 근거가 펼쳐지고, 그 자리에서 정산에 어떻게 반영할지 고른다.
//   이대로 반영 · 근태 고치러 가기(그날 기록으로) · 급여대장에서 이번 달만 조정(사유 필수). 처리한 뒤에는 누가 · 무엇을 골랐는지 보이고 되돌릴 수 있다.
//   고쳐야만 사라지는 항목(근태 마감 안 됨 · 계산이 막힘)은 「고치러 가기」만 있다.
import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export type ItemView = {
  key: string;
  title: string;
  evidence: string[]; // 근거 문장들
  dates: { date: string; href: string }[]; // 근거가 된 날 — 누르면 그날 기록으로
  must: boolean;
  fixHref: string | null;
  fixLabel: string | null;
  decided: { decision: 'as_is' | 'adjust'; note: string | null; by: string; at: string } | null;
};

export function CheckItemRow({ month, employeeId, item, live }: { month: string; employeeId: string; item: ItemView; live: boolean }) {
  const t = useTranslations('payCheck');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'adjust' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const r = await callApi('/api/admin/payroll/check', { month, employeeId, itemKey: item.key, live, ...body });
    setBusy(false);
    if (!r.ok) return setErr(r);
    setMode(null);
    setNote('');
    router.refresh();
  };
  // 줄 모양: 칠한 상자 대신 구분선 한 줄 — 상태는 앞의 점과 오른쪽 글자색으로만 (2026-11-03 의뢰인: 「확인 필요 사각형 박스가 촌스럽다」)
  return (
    <li className="border-t border-border first:border-t-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="group flex min-h-12 w-full items-center gap-2.5 rounded-button px-1 text-left hover:bg-surface/70">
        {item.decided ? <Check aria-hidden size={15} strokeWidth={2.5} className="shrink-0 text-ok" /> : <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${item.must ? 'bg-danger' : 'bg-warn'}`} />}
        <span className={`min-w-0 flex-1 text-sm ${item.decided ? 'text-muted' : 'font-semibold text-text'}`}>{item.title}</span>
        <span className={`shrink-0 text-xs font-semibold ${item.decided ? 'text-ok' : item.must ? 'text-danger' : 'text-warn'}`}>
          {item.decided ? t(item.decided.decision === 'as_is' ? 'doneAsIs' : 'doneAdjust') : t(item.must ? 'needFix' : 'needCheck')}
        </span>
        <ChevronDown aria-hidden size={15} className={`shrink-0 text-faint transition-transform group-hover:text-muted ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mb-2 ml-4 flex flex-col gap-3 rounded-button bg-surface/60 px-3 py-3">
          {/* 근거 — 무엇 때문에 이렇게 계산됐는지 */}
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold text-faint">{t('evidence')}</span>
            {item.evidence.map((e, i) => <p key={i} className="break-words">{e}</p>)}
            {item.dates.length > 0 && (
              <p className="flex flex-wrap gap-1.5 pt-1">
                {item.dates.map((d) => (
                  <Link key={d.date} href={d.href} className="num inline-flex min-h-9 items-center rounded-chip border border-border bg-bg px-2.5 text-xs font-semibold text-primary hover:bg-surface">{d.date.slice(5)} ›</Link>
                ))}
              </p>
            )}
          </div>
          {item.decided ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{t('decidedLine', { who: item.decided.by, at: item.decided.at.slice(0, 10) })}{item.decided.note ? ` · ${item.decided.note}` : ''}</span>
              <button type="button" disabled={busy} onClick={() => send({ action: 'undo' })} className="min-h-9 font-semibold text-primary underline">{t('undo')}</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-faint">{t('howTitle')}</span>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {!item.must && (
                  <Button type="button" size="sm" disabled={busy} onClick={() => send({ action: 'decide', decision: 'as_is' })}>{t('asIs')}</Button>
                )}
                {item.fixHref && (
                  <Link href={item.fixHref} className="inline-flex min-h-11 items-center justify-center rounded-button border border-border bg-bg px-3 text-sm font-semibold text-text hover:bg-surface lg:min-h-9">{item.fixLabel} ›</Link>
                )}
                {!item.must && (
                  <button type="button" onClick={() => setMode(mode === 'adjust' ? null : 'adjust')} aria-pressed={mode === 'adjust'} className={`min-h-11 rounded-button border px-3 text-sm font-semibold lg:min-h-9 ${mode === 'adjust' ? 'border-primary bg-primary-tint text-primary' : 'border-border bg-bg text-text hover:bg-surface'}`}>{t('adjust')}</button>
                )}
              </div>
              {mode === 'adjust' && (
                <div className="flex flex-col gap-2 rounded-button bg-bg p-2">
                  <p className="text-xs text-muted">{t('adjustHint')}</p>
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('adjustPh')} aria-label={t('adjustPh')} className="min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm" />
                  <Button type="button" size="sm" disabled={busy || note.trim().length < 2} onClick={() => send({ action: 'decide', decision: 'adjust', note })}>{t('adjustSave')}</Button>
                </div>
              )}
            </div>
          )}
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="payCheck" />}
        </div>
      )}
    </li>
  );
}

/** 계약 만료일 — 대부분 1년. 넣어 두면 만료 30일 전부터 급여 점검에 「재계약 확인」이 뜬다 */
export function ContractTermForm({ employeeId, endsOn }: { employeeId: string; endsOn: string | null }) {
  const t = useTranslations('payCheck');
  const router = useRouter();
  const [v, setV] = useState(endsOn ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">{t('termLabel')}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={v} onChange={(e) => { setV(e.target.value); setSaved(false); }} className="num min-h-11 rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm" aria-label={t('termLabel')} />
        <Button type="button" size="sm" disabled={busy || v === (endsOn ?? '')} onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/admin/payroll/check', { action: 'term', employeeId, endsOn: v || null });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setSaved(true);
          router.refresh();
        }}>{t('termSave')}</Button>
        {saved && <span role="status" className="text-ok">{t('termSaved')}</span>}
      </div>
      <span className="text-xs text-faint">{t('termHint')}</span>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="payCheck" />}
    </div>
  );
}
