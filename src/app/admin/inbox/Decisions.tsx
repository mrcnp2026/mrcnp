'use client';
// 승인·거부 버튼 — 승인만 색을 채우고 거부·부분 승인은 외곽선 (R-10-7). 한 줄 요약 + 한 번 더 확인 (5장 규칙 5).
// 두 관리자가 동시에 누르면 먼저 반영된 쪽만 유효, 나중 사람에게는 "이미 처리됨" (R-2의 6) — 에러 화면이 아니다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

type Facts = { overtime: number; night: number; holiday: number };
type Pending = { decision: 'approved' | 'rejected'; partial?: Facts };

function useDecide(url: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function send(body: unknown) {
    setBusy(true);
    setErr(null);
    const r = await callApi<{ result: string }>(url, body);
    setBusy(false);
    if (!r.ok) return setErr(r);
    setDone(r.data.result);
    router.refresh();
  }
  return { busy, err, done, send };
}

export function OvertimeDecision({ id, name, facts }: { id: string; name: string; facts: Facts }) {
  const t = useTranslations('admin.inbox');
  const { busy, err, done, send } = useDecide(`/api/admin/overtime/${id}/decide`);
  const [pending, setPending] = useState<Pending | null>(null);
  const [partial, setPartial] = useState<Facts | null>(null);

  if (done) return <p className="text-sm font-semibold text-muted">{t(done === 'already' ? 'already' : 'doneMsg')}</p>;

  if (pending) {
    const p = pending.partial;
    const summary =
      pending.decision === 'rejected'
        ? t('confirmReject', { name })
        : p
          ? t('confirmPartial', { name, o: p.overtime, n: p.night, h: p.holiday })
          : t('confirmApprove', { name, o: facts.overtime, n: facts.night, h: facts.holiday });
    return (
      <div className="flex flex-col gap-2 rounded-card border border-border p-3">
        <p className="text-sm">{summary}</p>
        {pending.decision === 'rejected' && <p className="text-xs text-muted">{t('rejectKeepsRecord')}</p>}
        <div className="flex gap-2">
          <Button
            disabled={busy}
            className="flex-1"
            onClick={() =>
              send({
                decision: pending.decision,
                approvedMinutes: p?.overtime ?? null,
                approvedNightMinutes: p?.night ?? null,
                approvedHolidayMinutes: p?.holiday ?? null,
              })
            }
          >
            {t('confirm')}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>
            {t('cancel')}
          </Button>
        </div>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.inbox" />}
      </div>
    );
  }

  if (partial) {
    const field = (k: keyof Facts) => (
      <label key={k} className="flex flex-col gap-1 text-xs text-muted">
        {t(k)}
        <input
          type="number"
          min={0}
          max={facts[k]}
          value={partial[k]}
          onChange={(e) => setPartial({ ...partial, [k]: Math.max(0, Math.min(facts[k], Number(e.target.value) || 0)) })}
          className="num min-h-11 rounded-button border border-border px-2 text-base text-text"
        />
      </label>
    );
    return (
      <div className="flex flex-col gap-2 rounded-card border border-border p-3">
        <p className="text-sm text-muted">{t('partialHint')}</p>
        <div className="grid grid-cols-3 gap-2">{(['overtime', 'night', 'holiday'] as const).map(field)}</div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setPending({ decision: 'approved', partial })}>
            {t('next')}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setPartial(null)}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button className="flex-1" onClick={() => setPending({ decision: 'approved' })}>
        {t('approve')}
      </Button>
      <Button variant="outline" className="flex-1" onClick={() => setPartial({ ...facts })}>
        {t('partial')}
      </Button>
      <Button variant="outline" className="flex-1" onClick={() => setPending({ decision: 'rejected' })}>
        {t('reject')}
      </Button>
    </div>
  );
}

/** 휴가 승인·거부. 출근 기록과 겹치면 경고만 — 자동으로 한쪽을 지우지 않는다 (②-2 7-3 요점 4) */
export function LeaveDecision({ id, name, summary }: { id: string; name: string; summary: string }) {
  const t = useTranslations('admin.inbox');
  const { busy, err, done, send } = useDecide(`/api/admin/leave/${id}/decide`);
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);
  if (done) return <p className="text-sm font-semibold text-muted">{t(done === 'already' ? 'already' : 'doneMsg')}</p>;
  if (pending) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-border p-3">
        <p className="text-sm">{t(pending === 'approved' ? 'confirmLeave' : 'confirmLeaveReject', { name, summary })}</p>
        <div className="flex gap-2">
          <Button disabled={busy} className="flex-1" onClick={() => send({ decision: pending })}>
            {t('confirm')}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>
            {t('cancel')}
          </Button>
        </div>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.inbox" />}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button className="flex-1" onClick={() => setPending('approved')}>
        {t('approve')}
      </Button>
      <Button variant="outline" className="flex-1" onClick={() => setPending('rejected')}>
        {t('reject')}
      </Button>
    </div>
  );
}

/** 승인된 휴가 취소 (관리자) — 출근 기록과 충돌할 때 관리자가 판단해 쓴다 */
export function LeaveCancel({ id, name }: { id: string; name: string }) {
  const t = useTranslations('admin.inbox');
  const { busy, err, done, send } = useDecide(`/api/admin/leave/${id}/decide`);
  const [ask, setAsk] = useState(false);
  if (done) return <p className="text-sm font-semibold text-muted">{t(done === 'already' ? 'already' : 'doneMsg')}</p>;
  if (!ask)
    return (
      <Button variant="outline" className="self-start" onClick={() => setAsk(true)}>
        {t('leaveCancel')}
      </Button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border p-3">
      <p className="text-sm">{t('confirmLeaveCancel', { name })}</p>
      <div className="flex gap-2">
        <Button disabled={busy} className="flex-1" onClick={() => send({ decision: 'cancelled' })}>
          {t('confirm')}
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setAsk(false)}>
          {t('cancel')}
        </Button>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.inbox" />}
    </div>
  );
}

export function CorrectionDecision({ id, name }: { id: string; name: string }) {
  const t = useTranslations('admin.inbox');
  const { busy, err, done, send } = useDecide(`/api/admin/corrections/${id}/decide`);
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);
  if (done) return <p className="text-sm font-semibold text-muted">{t(done === 'already' ? 'already' : done === 'conflict' ? 'conflict' : 'doneMsg')}</p>;
  if (pending) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-border p-3">
        <p className="text-sm">{t(pending === 'approved' ? 'confirmCorrection' : 'confirmCorrectionReject', { name })}</p>
        <p className="text-xs text-muted">{t('originalKept')}</p>
        <div className="flex gap-2">
          <Button disabled={busy} className="flex-1" onClick={() => send({ decision: pending })}>
            {t('confirm')}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>
            {t('cancel')}
          </Button>
        </div>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.inbox" />}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button className="flex-1" onClick={() => setPending('approved')}>
        {t('approve')}
      </Button>
      <Button variant="outline" className="flex-1" onClick={() => setPending('rejected')}>
        {t('reject')}
      </Button>
    </div>
  );
}
