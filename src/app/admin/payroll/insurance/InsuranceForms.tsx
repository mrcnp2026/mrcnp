'use client';
// 사회보험 화면의 조작부 — 취득/상실 줄 넣기 · 상태 바꾸기, 고지 보험료 손으로 넣기, 대장에 차액 넣기/빼기, 묶음 거두기. 처리하면 화면을 새로 읽는다.
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
const small = 'inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50';
const API = '/api/admin/payroll/insurance';
const KINDS = ['NP', 'HI', 'EI', 'IA'] as const;
type Err = { code: string; requestId?: string } | null;
type Person = { id: string; name: string; employeeNo: string | null };

function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const send = async <T,>(body: Record<string, unknown>, refresh = true): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    const r = await callApi<T>(API, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    if (refresh) router.refresh();
    return r.data;
  };
  return { busy, err, send, router };
}

/** 취득/상실 줄 넣기 — 직원 · 취득/상실 · 자격일 · 보험(여러 개) */
export function EnrollAdd({ people, today, preset }: { people: Person[]; today: string; preset?: { employeeId: string; event: 'ACQUIRE' | 'LOSE'; qualifyOn: string; label: string } }) {
  const t = useTranslations('admin.insurance');
  const { busy, err, send, router } = useCall();
  const [msg, setMsg] = useState<string | null>(null);
  // 「확인할 사람」 줄의 단추: 눌러도 아무 일 없어 보이던 것(2026-10-23 의뢰인) — 줄이 사라지기 전에 무슨 일이 일어났는지 잠깐 보여 준다
  if (preset)
    return (
      <span className="flex flex-col items-end gap-1">
        <button
          type="button"
          className={small}
          disabled={busy || !!msg}
          onClick={async () => {
            const r = await send<{ added: number; skipped: number }>({ action: 'enroll.add', employeeId: preset.employeeId, event: preset.event, qualifyOn: preset.qualifyOn, insurers: [...KINDS] }, false);
            if (!r) return;
            setMsg(r.added > 0 ? t('gapDone', { n: r.added }) : t('gapExists'));
            setTimeout(() => router.refresh(), 2500);
          }}
          aria-label={preset.label}
        >
          {t('gapAdd')}
        </button>
        {msg && <span role="status" className="text-xs font-semibold text-ok">{msg}</span>}
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.insurance" />}
      </span>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await send<{ added: number; skipped: number }>({ action: 'enroll.add', employeeId: f.get('employeeId'), event: f.get('event'), qualifyOn: f.get('qualifyOn'), insurers: KINDS.filter((k) => f.get(`i_${k}`)) });
        setMsg(r ? t('addDone', { added: r.added, skipped: r.skipped }) : null);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('fEmployee')}</span>
        <Select name="employeeId" required defaultValue="" className={field}>
          <option value="">{t('pick')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.employeeNo})</option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('fEvent')}</span>
        <Select name="event" defaultValue="ACQUIRE" className={field}>
          <option value="ACQUIRE">{t('event.ACQUIRE')}</option>
          <option value="LOSE">{t('event.LOSE')}</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold">{t('fQualifyOn')}</span>
        <input type="date" name="qualifyOn" required defaultValue={today} className={field} />
      </label>
      <fieldset className="flex min-h-9 items-center gap-3">
        <legend className="sr-only">{t('fInsurers')}</legend>
        {KINDS.map((k) => (
          <label key={k} className="flex items-center gap-1">
            <input type="checkbox" name={`i_${k}`} defaultChecked />
            {t(`insurer.${k}`)}
          </label>
        ))}
      </fieldset>
      <Button type="submit" size="sm" disabled={busy}>{t('add')}</Button>
      {msg && <span role="status" className="text-ok">{msg}</span>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.insurance" />}
    </form>
  );
}

/** 한 줄의 조작은 둘뿐 (2026-10-23 의뢰인): [검토] — 안에서 확인한 날 · 근거를 적어 「확인 완료」 하거나 「검토 계속」 / [끄기] — 잘못 넣은 줄 */
export function EnrollControls({ id, version, state, name, today }: { id: string; version: number; state: string; name: string; today: string }) {
  const t = useTranslations('admin.insurance');
  const { busy, err, send } = useCall();
  const [review, setReview] = useState(false);
  const base = { id, expectedVersion: version };
  if (review)
    return (
      <form
        className="flex min-w-72 flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (await send({ action: 'enroll.set', ...base, state: 'CONFIRMED', confirmedOn: f.get('confirmedOn'), evidence: f.get('evidence') })) setReview(false);
        }}
      >
        <p className="text-xs text-faint">{t('reviewHint')}</p>
        <input type="date" name="confirmedOn" required defaultValue={today} aria-label={t('confirmedOnOf', { name })} className={field} />
        <input name="evidence" required minLength={2} maxLength={300} placeholder={t('evidence')} aria-label={t('evidenceOf', { name })} className={field} autoComplete="off" />
        <span className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={busy}>{t('toConfirmed')}</Button>
          <button
            type="button"
            className={small}
            disabled={busy}
            onClick={async () => {
              if (state === 'CHECKING' || (await send({ action: 'enroll.set', ...base, state: 'CHECKING' }))) setReview(false);
            }}
          >
            {t('reviewKeep')}
          </button>
          <button type="button" onClick={() => setReview(false)} className="min-h-9 px-2 text-sm text-muted">{t('cancel')}</button>
        </span>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.insurance" />}
      </form>
    );
  return (
    <span className="flex flex-wrap gap-2">
      <button type="button" className={small} disabled={busy} onClick={() => setReview(true)} aria-label={t('reviewOf', { name })}>{t(state === 'CONFIRMED' ? 'reviewAgain' : 'review')}</button>
      <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'enroll.disable', ...base })} aria-label={t('disableOf', { name })}>{t('disable')}</button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.insurance" />}
    </span>
  );
}

/** 고지 보험료 손으로 넣기 — 보험 · 고지월을 정하고 직원마다 금액을 적는다 */
export function NoticeManual({ people, month, live }: { people: Person[]; month: string; live?: boolean }) {
  const t = useTranslations('admin.insurance');
  const { busy, err, send, router } = useCall();
  const [rows, setRows] = useState([{ employeeId: '', employee: '', employer: '', note: '' }]);
  const set = (i: number, k: 'employeeId' | 'employee' | 'employer' | 'note', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const money = (v: string) => v.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const made = await send<{ id: string }>({ action: 'notice.save', insurer: f.get('insurer'), month: f.get('month'), rows: rows.filter((r) => r.employeeId), ...(live ? { live: true } : {}) });
        if (made) router.push(`/admin/payroll/insurance/notice/${made.id}`);
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fInsurer')}</span>
          <Select name="insurer" defaultValue="HI" className={field}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{t(`insurer.${k}`)}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fMonth')}</span>
          <input type="month" name="month" required defaultValue={month} className={field} />
        </label>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <Select value={r.employeeId} required={i === 0} onChange={(e) => set(i, 'employeeId', e.target.value)} aria-label={t('rowEmployee', { n: i + 1 })} className={field}>
              <option value="">{t('pick')}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id} disabled={rows.some((x, j) => j !== i && x.employeeId === p.id)}>{p.name} ({p.employeeNo})</option>
              ))}
            </Select>
            <input value={r.employee} required={!!r.employeeId} inputMode="numeric" onChange={(e) => set(i, 'employee', money(e.target.value))} placeholder={t('fEmployeeAmount')} aria-label={t('rowEmployeeAmount', { n: i + 1 })} className={`num w-40 ${field}`} autoComplete="off" />
            <input value={r.employer} inputMode="numeric" onChange={(e) => set(i, 'employer', money(e.target.value))} placeholder={t('fEmployerAmount')} aria-label={t('rowEmployerAmount', { n: i + 1 })} className={`num w-40 ${field}`} autoComplete="off" />
            <input value={r.note} maxLength={150} onChange={(e) => set(i, 'note', e.target.value)} placeholder={t('fNote')} aria-label={t('rowNote', { n: i + 1 })} className={`min-w-40 flex-1 ${field}`} autoComplete="off" />
            {rows.length > 1 && <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="min-h-9 px-2 text-sm text-muted">{t('rowRemove')}</button>}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setRows([...rows, { employeeId: '', employee: '', employer: '', note: '' }])} className={`self-start ${small}`}>{t('rowAdd')}</button>
      <p className="text-xs text-faint">{t('manualNote')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.insurance" />}
      <div>
        <Button type="submit" size="sm" disabled={busy}>{t('saveNotice')}</Button>
      </div>
    </form>
  );
}

/** 한 줄의 차액을 고른 대장에 넣기 / 빼기 */
export function AllocateButton({ noticeId, runId, allocationId, diff, name, live }: { noticeId: string; runId: string | null; allocationId: string | null; diff: number | null; name: string; live?: boolean }) {
  const t = useTranslations('admin.insurance');
  const { busy, err, send } = useCall();
  return (
    <span className="flex flex-col gap-1">
      {allocationId ? (
        <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'notice.unallocate', allocationId })} aria-label={t('unallocateOf', { name })}>{t('unallocate')}</button>
      ) : (
        runId && diff !== null && diff !== 0 && <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'notice.allocate', noticeId, runId, ...(live ? { live: true } : {}) })} aria-label={t('allocateOf', { name })}>{t('allocate')}</button>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.insurance" />}
    </span>
  );
}

export function FileWithdraw({ id }: { id: string }) {
  const t = useTranslations('admin.insurance');
  const { busy, err, send } = useCall();
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={`self-start ${small}`} onClick={() => setOpen(true)}>{t('withdrawFile')}</button>;
  return (
    <form className="flex flex-wrap items-center gap-2 text-sm" onSubmit={async (e) => { e.preventDefault(); if (await send({ action: 'notice.withdraw', id, reason: new FormData(e.currentTarget).get('reason') })) setOpen(false); }}>
      <input name="reason" required minLength={2} maxLength={300} placeholder={t('withdrawReason')} aria-label={t('withdrawReason')} className={`min-w-64 flex-1 ${field}`} autoComplete="off" />
      <Button type="submit" size="sm" variant="outline" disabled={busy}>{t('withdrawDo')}</Button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-sm text-muted">{t('cancel')}</button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.insurance" />}
    </form>
  );
}

/** 오래된 입사 · 퇴사 건을 한꺼번에 「이미 신고함」으로 처리 — 누르면 한 번 더 묻는다 (2026-10-26 의뢰인) */
export function ConfirmOldButton({ n }: { n: number }) {
  const t = useTranslations('admin.insurance');
  const { busy, err, send } = useCall();
  const [ask, setAsk] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  if (done !== null) return <p role="status" className="text-sm font-bold text-ok">{t('gapOldDone', { n: done })}</p>;
  return (
    <div className="flex flex-col gap-2">
      {ask ? (
        <div className="flex flex-col gap-2 rounded-card border border-warn bg-warn-tint p-3 lg:flex-row lg:items-center">
          <span className="text-sm font-bold text-warn">{t('gapOldAsk', { n })}</span>
          <span className="flex gap-2">
            <Button type="button" className="flex-1" disabled={busy} onClick={async () => { const r = await send<{ lines: number }>({ action: 'enroll.confirmOld' }); if (r) setDone(r.lines); }}>
              {t('gapOldYes')}
            </Button>
            <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setAsk(false)}>
              {t('gapOldNo')}
            </Button>
          </span>
        </div>
      ) : (
        <Button type="button" variant="outline" className="self-start" onClick={() => setAsk(true)}>{t('gapOldDo')}</Button>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.insurance" />}
    </div>
  );
}

export type EnrollGroupLine = { id: string; insurerLabel: string; state: 'UNREPORTED' | 'CHECKING' | 'CONFIRMED'; stateLabel: string; version: number; confirmedOn: string | null; evidence: string | null };
const CHIP = { UNREPORTED: 'bg-warn-tint text-warn', CHECKING: 'bg-primary-tint text-primary', CONFIRMED: 'bg-ok-tint text-ok' } as const;
const MARK = { UNREPORTED: '⚠', CHECKING: '…', CONFIRMED: '✓' } as const; // 색만으로 전하지 않는다 — 아이콘 + 글자 (R-10-8)

/**
 * 직원 한 명 = 한 줄 (2026-10-26 의뢰인: 보험별로 줄이 나뉘어 길고 반복된다).
 * 줄 안에 국민연금 · 건강 · 고용 · 산재 칩이 상태와 함께 나란히 있고, 칩을 누르면 그 보험의 확인 화면이 펼쳐진다.
 * 자료는 그대로 보험별 한 줄씩이다 — 보여 주는 모양만 묶었다.
 */
export function EnrollGroupRow({ name, employeeNo, eventLabel, qualifyOn, progress, lines, today }: { name: string; employeeNo: string | null; eventLabel: string; qualifyOn: string; progress: string; lines: EnrollGroupLine[]; today: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const cur = lines.find((l) => l.id === open) ?? null;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-0"><b>{name}</b> <span className="num text-xs text-muted">{employeeNo}</span></span>
        <span className="num text-muted">{eventLabel} · {qualifyOn}</span>
        <span className="ml-auto text-xs text-muted">{progress}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {lines.map((l) => (
          <button key={l.id} type="button" aria-pressed={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-chip px-3 text-xs font-bold ${CHIP[l.state]} ${open === l.id ? 'ring-2 ring-primary' : ''}`}>
            <span aria-hidden>{MARK[l.state]}</span>
            {l.insurerLabel}
            <span className="font-medium">{l.stateLabel}</span>
          </button>
        ))}
      </div>
      {cur && (
        <div className="flex flex-col gap-2 rounded-card bg-surface p-3">
          <span className="font-bold">{cur.insurerLabel} · {cur.stateLabel}{cur.confirmedOn ? <span className="num font-normal text-muted"> · {cur.confirmedOn}{cur.evidence ? ` · ${cur.evidence}` : ''}</span> : null}</span>
          <EnrollControls id={cur.id} version={cur.version} state={cur.state} name={`${name} ${cur.insurerLabel}`} today={today} />
        </div>
      )}
    </li>
  );
}
