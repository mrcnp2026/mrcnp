'use client';
// 연차 사용 촉진의 조작부 — 만들기 · 대상 빼기/넣기 · 안내 보내기 · 처리 · 닫기(관리자), 사용 계획 내기(직원). 처리하면 화면을 새로 읽는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
const area = 'min-h-32 rounded-button border border-border bg-bg p-3 text-sm';
type Err = { code: string; requestId?: string } | null;

function useCall(url: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const send = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    const r = await callApi<T>(url, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    router.refresh();
    return r.data;
  };
  return { busy, err, send, router };
}

export function CampaignCreate({ today, sample }: { today: string; sample: string }) {
  const t = useTranslations('admin.promotion');
  const { busy, err, send, router } = useCall('/api/admin/leave/promotion');
  return (
    <form
      className="grid gap-3 text-sm md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await send<{ id: string }>({ action: 'create', title: f.get('title'), basisOn: f.get('basisOn'), planDueOn: f.get('planDueOn'), noticeBody: f.get('noticeBody'), policyNote: f.get('policyNote') });
        if (r) router.push(`/admin/leave/promotion/${r.id}`);
      }}
    >
      <label className="flex flex-col gap-1 md:col-span-2">
        <span className="font-bold">{t('fTitle')}</span>
        <input name="title" required maxLength={80} className={field} autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('fBasis')}</span>
        <input name="basisOn" type="date" required defaultValue={today} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('fDue')}</span>
        <input name="planDueOn" type="date" required defaultValue={today} className={field} />
      </label>
      <label className="flex flex-col gap-1 md:col-span-2">
        <span className="font-bold">{t('fNotice')}</span>
        <textarea name="noticeBody" required maxLength={4000} defaultValue={sample} className={area} />
      </label>
      <label className="flex flex-col gap-1 md:col-span-2">
        <span className="font-bold">{t('fPolicy')}</span>
        <input name="policyNote" maxLength={1000} className={field} autoComplete="off" />
      </label>
      <p className="text-xs text-faint md:col-span-2">{t('createHint')}</p>
      {err && (
        <div className="md:col-span-2">
          <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.promotion" />
        </div>
      )}
      <div className="md:col-span-2">
        <Button type="submit" size="sm" disabled={busy}>
          {t('create')}
        </Button>
      </div>
    </form>
  );
}

export function CampaignActions({ id, state, candidates }: { id: string; state: string; candidates: number }) {
  const t = useTranslations('admin.promotion');
  const { busy, err, send } = useCall('/api/admin/leave/promotion');
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (state === 'CLOSED') return null;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {candidates > 0 &&
          (ask ? (
            <>
              <span className="text-warn">{t('sendConfirm', { n: candidates })}</span>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const r = await send<{ sent: number }>({ action: 'send', campaignId: id });
                  setAsk(false);
                  if (r) setMsg(t('sendDone', { n: r.sent }));
                }}
              >
                {t('sendYes')}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsk(false)}>
                {t('cancel')}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => setAsk(true)}>
              {t('send', { n: candidates })}
            </Button>
          ))}
        {state === 'SENT' && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => send({ action: 'close', campaignId: id })}>
            {t('close')}
          </Button>
        )}
      </div>
      {msg && <p role="status" className="text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.promotion" />}
    </div>
  );
}

export function TargetControls({ campaignId, targetId, campaignState, state, name }: { campaignId: string; targetId: string; campaignState: string; state: string; name: string }) {
  const t = useTranslations('admin.promotion');
  const { busy, err, send } = useCall('/api/admin/leave/promotion');
  const [mode, setMode] = useState<'exclude' | 'EXCEPTION' | null>(null);
  const base = { campaignId, targetId };
  const small = 'inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50';
  if (mode)
    return (
      <form
        className="flex min-w-56 flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get('note');
          if (await send(mode === 'exclude' ? { action: 'exclude', ...base, reason: v } : { action: 'decide', ...base, decision: 'EXCEPTION', note: v })) setMode(null);
        }}
      >
        <input name="note" required minLength={2} maxLength={300} placeholder={t(mode === 'exclude' ? 'excludeReason' : 'exceptionNote')} aria-label={t(mode === 'exclude' ? 'excludeReasonOf' : 'exceptionNoteOf', { name })} className={field} autoComplete="off" />
        <span className="flex gap-2">
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {t(mode === 'exclude' ? 'exclude' : 'exception')}
          </Button>
          <button type="button" onClick={() => setMode(null)} className="min-h-9 px-2 text-sm text-muted">
            {t('cancel')}
          </button>
        </span>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.promotion" />}
      </form>
    );
  return (
    <span className="flex flex-wrap gap-2">
      {campaignState === 'DRAFT' && state === 'CANDIDATE' && (
        <button type="button" className={small} onClick={() => setMode('exclude')}>
          {t('exclude')}
        </button>
      )}
      {campaignState === 'DRAFT' && state === 'EXCLUDED' && (
        <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'include', ...base })}>
          {t('include')}
        </button>
      )}
      {campaignState === 'SENT' && (state === 'NOTIFIED' || state === 'PLAN_SUBMITTED' || state === 'EXCEPTION') && (
        <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'decide', ...base, decision: 'CONFIRMED' })}>
          {t('confirm')}
        </button>
      )}
      {campaignState === 'SENT' && (state === 'NOTIFIED' || state === 'PLAN_SUBMITTED' || state === 'CONFIRMED') && (
        <button type="button" className={small} onClick={() => setMode('EXCEPTION')}>
          {t('exception')}
        </button>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.promotion" />}
    </span>
  );
}

/** 직원: 사용 계획 — 쓸 날짜를 한 줄에 하나씩 */
export function PlanForm({ targetId, dates, note, min }: { targetId: string; dates: string[]; note: string | null; min: string }) {
  const t = useTranslations('promotionPlan');
  const { busy, err, send } = useCall(`/api/leave/promotion/${targetId}`);
  const [list, setList] = useState<string[]>(dates.length > 0 ? dates : ['']);
  const [done, setDone] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(false);
        if (await send({ dates: list.filter(Boolean), note: new FormData(e.currentTarget).get('note') })) setDone(true);
      }}
    >
      <p className="font-bold">{t('datesTitle')}</p>
      <ul className="flex flex-col gap-2">
        {list.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <input type="date" value={d} min={min} required={i === 0} aria-label={t('dateOf', { n: i + 1 })} onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value : x)))} className={field} />
            {list.length > 1 && (
              <button type="button" onClick={() => setList(list.filter((_, j) => j !== i))} className="min-h-9 px-2 text-sm text-muted">
                {t('remove')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setList([...list, ''])} className="inline-flex h-8 items-center self-start rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
        {t('addDate')}
      </button>
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('fNote')}</span>
        <input name="note" maxLength={300} defaultValue={note ?? ''} className={field} autoComplete="off" />
      </label>
      <p className="text-xs text-faint">{t('hint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="promotionPlan" />}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {t(dates.length > 0 ? 'resubmit' : 'submit')}
        </Button>
        {done && <span role="status" className="text-ok">{t('submitted')}</span>}
      </div>
    </form>
  );
}
