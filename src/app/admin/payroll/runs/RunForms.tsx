'use client';
// 급여대장의 조작부 — 대장 만들기 · 계산/검토/확정 · 대상 빼기/넣기 · 금액 조정. 처리하면 화면을 새로 읽는다.
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AddSheet, CLOSE_SHEET_EVENT, OPEN_SHEET_EVENT } from '@/components/AddSheet';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
type Err = { code: string; requestId?: string } | null;

function useRun(url: string) {
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

const CREATE_SHEET = 'run-create';

/** 「+ 급여대장 생성」 단추와 팝업 (2026-10-26 의뢰인: 목록 위에 설명 카드로 펼쳐 두지 않고, 누르면 뜨는 창으로) */
export function RunCreateButton({ months, bonusMonths, today, live, defaultOpen = false }: { months: string[]; bonusMonths: string[]; today: string; live: boolean; defaultOpen?: boolean }) {
  const t = useTranslations('admin.payRuns');
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: CREATE_SHEET }))} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-button bg-primary px-4 text-sm font-bold text-on-primary lg:h-9 lg:min-h-0 lg:w-auto lg:px-3.5 lg:font-semibold">
        <Plus aria-hidden size={16} />
        {t('create')}
      </button>
      <AddSheet id={CREATE_SHEET} title={t('createTitle')} modal defaultOpen={defaultOpen}>
        <RunCreate months={months} bonusMonths={bonusMonths} today={today} live={live} />
      </AddSheet>
    </>
  );
}

function RunCreate({ months, bonusMonths, today, live }: { months: string[]; bonusMonths: string[]; today: string; live: boolean }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send, router } = useRun('/api/admin/payroll/runs');
  const [kind, setKind] = useState<'REGULAR' | 'BONUS'>(months.length > 0 ? 'REGULAR' : 'BONUS');
  const list = kind === 'REGULAR' ? months : bonusMonths;
  const full = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base';
  return (
    <form
      className="flex flex-col gap-4 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await send<{ id: string; existed?: boolean }>({ action: 'create', kind, month: f.get('month'), payDate: kind === 'BONUS' ? f.get('payDate') : undefined, title: kind === 'BONUS' ? f.get('title') : undefined, live });
        if (r) {
          window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: CREATE_SHEET }));
          router.push(`/admin/payroll/runs/${r.id}${r.existed ? '?existed=1' : ''}`);
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('fKind')}</span>
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'REGULAR' | 'BONUS')} className={full}>
          <option value="REGULAR">{t('kind.REGULAR')}</option>
          <option value="BONUS">{t('kind.BONUS')}</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('fMonth')}</span>
        <Select name="month" className={full}>
          {list.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </label>
      {kind === 'BONUS' && (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fPayDate')}</span>
            <input name="payDate" type="date" required defaultValue={today} className={full} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">{t('fTitle')}</span>
            <input name="title" maxLength={80} className={full} autoComplete="off" />
          </label>
          <p className="text-xs text-faint">{t('bonusHint')}</p>
        </>
      )}
      {kind === 'REGULAR' && months.length === 0 && <p className="text-faint">{t('createNone')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
      <Button type="submit" disabled={busy || list.length === 0}>
        {t('create')}
      </Button>
    </form>
  );
}

/**
 * 대장의 진행 버튼 (2026-10-26 의뢰인: 다시 계산 · 검토 완료 · 확정이 같은 크기로 늘어서 있어 어느 걸 눌러야 하는지 모르겠다).
 * 지금 눌러야 할 것 하나만 크게(채운 파랑), 「다시 계산」은 보조로 작게. 확정은 마지막 단계라 누르면 한 번 더 묻는다.
 */
export function RunActions({ id, version, status, stale, blocked }: { id: string; version: number; status: string; stale: boolean; blocked: number }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (status === 'FINALIZED') return null;
  const go = async (action: string) => {
    setMsg(null);
    const r = await send<{ calculated?: { ok: number; blocked: number } }>({ action, expectedVersion: version });
    setAsk(false);
    if (r?.calculated) setMsg(t('calcDone', { ok: r.calculated.ok, blocked: r.calculated.blocked }));
  };
  // 지금 해야 할 단계: 처음이거나 자료가 바뀌었거나 막힌 사람이 있으면 계산, 아니면 다음 단계로
  const needCalc = status === 'DRAFT' || stale || blocked > 0;
  const step = needCalc ? 'calculate' : status === 'CALCULATED' ? 'review' : 'finalize';
  const hint = status === 'DRAFT' ? t('nextDraft') : stale ? t('nextStale') : blocked > 0 ? t('nextBlocked') : status === 'CALCULATED' ? t('nextCalculated') : t('nextReviewed');
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <p className={`lg:flex-1 ${blocked > 0 && !stale ? 'font-bold text-danger' : 'text-muted'}`}>{hint}</p>
        {ask ? (
          <div className="flex flex-col gap-2 rounded-card border border-warn bg-warn-tint p-3 lg:flex-row lg:items-center">
            <span className="font-bold text-warn">{t('finalizeConfirm')}</span>
            <span className="flex gap-2">
              <Button type="button" className="flex-1" disabled={busy} onClick={() => go('finalize')}>
                {t('finalizeYes')}
              </Button>
              <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setAsk(false)}>
                {t('cancel')}
              </Button>
            </span>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 lg:flex-row lg:items-center">
            {!needCalc && (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => go('calculate')}>
                {t('recalculate')}
              </Button>
            )}
            <Button type="button" className="lg:min-w-40" disabled={busy} onClick={() => (step === 'finalize' ? setAsk(true) : go(step))}>
              {busy ? t('working') : t(step === 'calculate' && status !== 'DRAFT' ? 'recalculate' : step)}
            </Button>
          </div>
        )}
      </div>
      {msg && <p role="status" className="text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </div>
  );
}

export function MemberToggle({ id, employeeId, included, name }: { id: string; employeeId: string; included: boolean; name: string }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  const [open, setOpen] = useState(false);
  if (included && !open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
        {t('exclude')}
      </button>
    );
  if (!included)
    return (
      <span className="flex flex-col gap-1">
        <button type="button" disabled={busy} onClick={() => send({ action: 'include', employeeId })} className="inline-flex h-8 items-center self-start rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50">
          {t('include')}
        </button>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
      </span>
    );
  return (
    <form
      className="flex min-w-56 flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ action: 'exclude', employeeId, reason: new FormData(e.currentTarget).get('reason') })) setOpen(false);
      }}
    >
      <input name="reason" required minLength={2} maxLength={300} placeholder={t('excludeReason')} aria-label={t('excludeReasonOf', { name })} className={field} autoComplete="off" />
      <span className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {t('exclude')}
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-sm text-muted">
          {t('cancel')}
        </button>
      </span>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </form>
  );
}

export function OverrideForm({ id, employeeId, codes, active }: { id: string; employeeId: string; codes: { code: string; kind: 'PAYMENT' | 'DEDUCTION'; label: string }[]; active: { id: string; label: string; amount: string; original: string | null; reason: string }[] }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {active.length > 0 && (
        <ul className="flex flex-col gap-2">
          {active.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-button border border-border p-2">
              <span className="num">
                <b>{o.label}</b> {o.original === null ? t('ovNew', { amount: o.amount }) : t('ovChange', { from: o.original, to: o.amount })}
                <span className="block text-xs text-muted">{o.reason}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => send({ action: 'override.withdraw', overrideId: o.id })} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50">
                {t('ovWithdraw')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3 md:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const el = e.currentTarget;
          const f = new FormData(el);
          const [kind, code] = String(f.get('item')).split(':');
          if (await send({ action: 'override.add', employeeId, itemCode: code, kind, amount: f.get('amount'), reason: f.get('reason') })) el.reset();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('ovItem')}</span>
          <Select name="item" className={field}>
            {codes.map((c) => (
              <option key={`${c.kind}:${c.code}`} value={`${c.kind}:${c.code}`}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('ovAmount')}</span>
          <input name="amount" type="number" step="1" required className={field} />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="font-bold">{t('ovReason')}</span>
          <input name="reason" required minLength={2} maxLength={300} className={field} autoComplete="off" />
        </label>
        <div className="md:col-span-4">
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {t('ovAdd')}
          </Button>
        </div>
      </form>
      <p className="text-xs text-faint">{t('ovHint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </div>
  );
}

export function PublishAll({ id, waiting }: { id: string; waiting: number }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
         
          disabled={busy || waiting === 0}
          onClick={async () => {
            setMsg(null);
            const r = await send<{ publish: { published: number } }>({ action: 'publish' });
            if (r) setMsg(t('publishDone', { n: r.publish.published }));
          }}
        >
          {t('publishAll', { n: waiting })}
        </Button>
        {msg && <span role="status" className="text-ok">{msg}</span>}
      </div>
      <p className="text-xs text-faint">{t('publishHint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </div>
  );
}

export function PublishToggle({ id, employeeId, published, name }: { id: string; employeeId: string; published: boolean; name: string }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send } = useRun(`/api/admin/payroll/runs/${id}`);
  const [open, setOpen] = useState(false);
  if (!published)
    return (
      <span className="flex flex-col gap-1">
        <button type="button" disabled={busy} onClick={() => send({ action: 'publish', employeeIds: [employeeId] })} className="inline-flex h-8 items-center self-start rounded-button border border-primary bg-bg px-3 text-sm font-bold text-primary disabled:opacity-50">
          {t('publishOne')}
        </button>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
      </span>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
        {t('unpublish')}
      </button>
    );
  return (
    <form
      className="flex min-w-56 flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ action: 'unpublish', employeeId, reason: new FormData(e.currentTarget).get('reason') })) setOpen(false);
      }}
    >
      <input name="reason" required minLength={2} maxLength={300} placeholder={t('unpublishReason')} aria-label={t('unpublishReasonOf', { name })} className={field} autoComplete="off" />
      <span className="flex gap-2">
        <Button type="submit" variant="outline" disabled={busy}>
          {t('unpublish')}
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-sm text-muted">
          {t('cancel')}
        </button>
      </span>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </form>
  );
}

export function CorrectionStart({ id }: { id: string }) {
  const t = useTranslations('admin.payRuns');
  const { busy, err, send, router } = useRun(`/api/admin/payroll/runs/${id}`);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {t('correct')}
      </Button>
    );
  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await send<{ id: string }>({ action: 'correct', reason: new FormData(e.currentTarget).get('reason') });
        if (r) router.push(`/admin/payroll/runs/${r.id}`);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('correctReason')}</span>
        <input name="reason" required minLength={2} maxLength={500} className={field} autoComplete="off" />
      </label>
      <p className="text-xs text-faint">{t('correctHint')}</p>
      <span className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {t('correctDo')}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </span>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns" />}
    </form>
  );
}

/** 인쇄 — 브라우저의 인쇄 창을 연다(거기서 「PDF로 저장」을 고를 수 있다). 메뉴 · 버튼은 인쇄에 나오지 않는다 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" data-noprint onClick={() => window.print()} className="inline-flex h-8 items-center self-start rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
      {label}
    </button>
  );
}
