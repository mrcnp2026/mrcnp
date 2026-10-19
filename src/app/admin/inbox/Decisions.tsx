'use client';
// 승인·거부 버튼 — 승인만 색을 채우고 거부·부분 승인은 외곽선 (R-10-7). 한 줄 요약 + 한 번 더 확인 (5장 규칙 5).
// 두 관리자가 동시에 누르면 먼저 반영된 쪽만 유효, 나중 사람에게는 "이미 처리됨" (R-2의 6) — 에러 화면이 아니다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { reloadAlerts } from '@/components/Alerts';
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
    reloadAlerts(); // 종 · 요청 배지 숫자도 바로 (화면을 옮기지 않으므로 따로 부른다)
  }
  return { busy, err, done, send };
}

/** 같은 사람 · 같은 날의 요청 한 번에 승인 (2026-10-18 의뢰인) — 출퇴근 요청 · 정정을 먼저, 연장근로는 뒤에. 하나씩 거절하려면 아래 카드의 단추를 쓴다 */
export function ApproveDay({ name, day, count, items, punchFirst, employeeId, workDate, preview, note }: { name: string; day: string; count: number; items: { url: string; body: unknown }[]; punchFirst: boolean; employeeId: string; workDate: string; preview: string | null; note: string | null }) {
  const t = useTranslations('admin.inbox');
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [got, setGot] = useState<{ overtime: number; night: number; holiday: number } | null>(null);
  async function run() {
    setBusy(true);
    setErr(null);
    let failed = false;
    for (const it of items) {
      const r = await callApi<{ result: string }>(it.url, it.body);
      if (!r.ok) {
        setErr(r);
        failed = true;
        break;
      }
    }
    // 마지막에 그날 연장 · 야간 · 휴일 시간을 계산된 그대로 인정 (2026-10-18 의뢰인: 승인 한 번)
    if (!failed) {
      const r = await callApi<{ result: string; overtime: number; night: number; holiday: number }>('/api/admin/overtime/day', { employeeId, workDate });
      if (!r.ok) setErr(r);
      else if (r.data.result !== 'none') setGot(r.data);
    }
    setBusy(false);
    setAsking(false);
    router.refresh();
    reloadAlerts();
  }
  return (
    <div className="flex flex-col gap-2 rounded-card border border-primary bg-primary-tint p-3" data-approve-day>
      <p className="text-sm font-semibold">{t('dayTitle', { name, day, n: count })}</p>
      {preview && <p className="num text-sm">{preview}</p>}
      <p className="rounded-button bg-bg p-2 text-sm">
        <span className="block text-xs text-muted">{t('dayReason')}</span>
        {note ? <span className="whitespace-pre-wrap break-words">{note}</span> : <span className="text-faint">{t('dayNoReason')}</span>}
      </p>
      <p className="text-xs text-muted">{t(punchFirst ? 'dayPunchFirst' : 'dayAll')}</p>
      {got && <p role="status" className="num text-sm font-semibold text-ok">{t('dayDone', { o: got.overtime, n: got.night, h: got.holiday })}</p>}
      {asking ? (
        <div className="flex gap-2">
          <Button disabled={busy} className="flex-1" onClick={run}>
            {t('dayConfirm', { n: count })}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setAsking(false)}>
            {t('cancel')}
          </Button>
        </div>
      ) : (
        <Button onClick={() => setAsking(true)}>{t('dayApprove', { n: count })}</Button>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.inbox" />}
    </div>
  );
}

export function OvertimeDecision({ id, name, facts, compact = false }: { id: string; name: string; facts: Facts; compact?: boolean }) {
  const size = compact ? 'sm' : 'md';
  const grow = compact ? '' : 'flex-1';
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
            size={size}
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
          <Button size={size} variant="outline" className="flex-1" onClick={() => setPending(null)}>
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
          <Button size={size} className="flex-1" onClick={() => setPending({ decision: 'approved', partial })}>
            {t('next')}
          </Button>
          <Button size={size} variant="outline" className="flex-1" onClick={() => setPartial(null)}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} className={grow} onClick={() => setPending({ decision: 'approved' })}>
        {t('approve')}
      </Button>
      <Button size={size} variant="outline" className={grow} onClick={() => setPartial({ ...facts })}>
        {t('partial')}
      </Button>
      <Button size={size} variant="outline" className={grow} onClick={() => setPending({ decision: 'rejected' })}>
        {t('reject')}
      </Button>
    </div>
  );
}

/** 외근 승인·거부 — 연차와 같은 모양 (②-3 7-11 요점 6) */
export function WorkDecision({ id, name, summary, compact = false }: { id: string; name: string; summary: string; compact?: boolean }) {
  return <LeaveDecision compact={compact} id={id} name={name} summary={summary} url={`/api/admin/work/${id}/decide`} keys={['confirmWork', 'confirmWorkReject']} />;
}

/** 휴가 승인·거부. 출근 기록과 겹치면 경고만 — 자동으로 한쪽을 지우지 않는다 (②-2 7-3 요점 4) */
export function LeaveDecision({
  id,
  name,
  summary,
  url,
  keys = ['confirmLeave', 'confirmLeaveReject'],
  compact = false,
}: {
  id: string;
  name: string;
  summary: string;
  url?: string;
  keys?: [string, string];
  compact?: boolean;
}) {
  const size = compact ? 'sm' : 'md';
  const grow = compact ? '' : 'flex-1';
  const t = useTranslations('admin.inbox');
  const { busy, err, done, send } = useDecide(url ?? `/api/admin/leave/${id}/decide`);
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);
  if (done) return <p className="text-sm font-semibold text-muted">{t(done === 'already' ? 'already' : 'doneMsg')}</p>;
  if (pending) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-border p-3">
        <p className="text-sm">{t(pending === 'approved' ? keys[0] : keys[1], { name, summary })}</p>
        <div className="flex gap-2">
          <Button size={size} disabled={busy} className="flex-1" onClick={() => send({ decision: pending })}>
            {t('confirm')}
          </Button>
          <Button size={size} variant="outline" className="flex-1" onClick={() => setPending(null)}>
            {t('cancel')}
          </Button>
        </div>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.inbox" />}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button size={size} className={grow} onClick={() => setPending('approved')}>
        {t('approve')}
      </Button>
      <Button size={size} variant="outline" className={grow} onClick={() => setPending('rejected')}>
        {t('reject')}
      </Button>
    </div>
  );
}

/** 승인된 휴가 취소 (관리자) — 출근 기록과 충돌할 때 관리자가 판단해 쓴다 */
export function LeaveCancel({ id, name, compact = false }: { id: string; name: string; compact?: boolean }) {
  const t = useTranslations('admin.inbox');
  const { busy, err, done, send } = useDecide(`/api/admin/leave/${id}/decide`);
  const [ask, setAsk] = useState(false);
  if (done) return <p className="text-sm font-semibold text-muted">{t(done === 'already' ? 'already' : 'doneMsg')}</p>;
  if (!ask)
    return (
      compact ? (
        // 목록 줄마다 놓이는 되돌리기 — 작은 글자 단추로(파란 단추가 줄마다 있어 눈에 띄었다, 2026-10-19 디자인)
        <button type="button" className="inline-flex min-h-9 items-center self-start text-sm font-bold whitespace-nowrap text-muted hover:text-danger" onClick={() => setAsk(true)}>
          {t('leaveCancel')}
        </button>
      ) : (
        <Button variant="outline" size="md" className="self-start whitespace-nowrap lg:min-h-9 lg:px-3 lg:text-sm" onClick={() => setAsk(true)}>
          {t('leaveCancel')}
        </Button>
      )
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

export function CorrectionDecision({ id, name, compact = false }: { id: string; name: string; compact?: boolean }) {
  const size = compact ? 'sm' : 'md';
  const grow = compact ? '' : 'flex-1';
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
          <Button size={size} disabled={busy} className="flex-1" onClick={() => send({ decision: pending })}>
            {t('confirm')}
          </Button>
          <Button size={size} variant="outline" className="flex-1" onClick={() => setPending(null)}>
            {t('cancel')}
          </Button>
        </div>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.inbox" />}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button size={size} className={grow} onClick={() => setPending('approved')}>
        {t('approve')}
      </Button>
      <Button size={size} variant="outline" className={grow} onClick={() => setPending('rejected')}>
        {t('reject')}
      </Button>
    </div>
  );
}
