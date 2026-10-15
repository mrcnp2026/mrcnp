'use client';
// 휴가 신청 양식. 일수는 서버가 근무일만 세어 정한다 — 화면은 보내기만 한다.
// direct: 최고관리자 직권 추가 · 고치기(2026-10-15 의뢰인) — 같은 양식으로 api/admin/leave/direct에 보낸다. 사유는 필수(결정 기록에 남는다).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export type DirectLeave = { employeeId: string; replaceId?: string; initial?: { typeCode: string; startDate: string; endDate: string; startTime: string | null } };

export function LeaveForm({ today, types, direct }: { today: string; types: { code: string; name: string; unit: number; deducts: boolean; hours: number; startTime: string | null; endTime: string | null; group: string | null }[]; direct?: DirectLeave }) {
  const t = useTranslations('leave');
  const router = useRouter();
  const init = direct?.initial;
  const [code, setCode] = useState(init && types.some((x) => x.code === init.typeCode) ? init.typeCode : (types[0]?.code ?? 'annual'));
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const cur = types.find((x) => x.code === code);
  const oneDay = (cur?.unit ?? 1) < 1;
  const groups = [...new Set(types.map((x) => x.group))];
  const option = (x: (typeof types)[number]) => (
    <option key={x.code} value={x.code}>
      {x.name}
    </option>
  );

  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          setBusy(true);
          setErr(null);
          setSent(null);
          const r = await callApi<{ days: number }>(direct ? '/api/admin/leave/direct' : '/api/leave', {
            ...(direct ? { employeeId: direct.employeeId, replaceId: direct.replaceId ?? null, adminReason: fd.get('reason') } : {}),
            typeCode: code,
            startDate: fd.get('startDate'),
            endDate: oneDay ? fd.get('startDate') : fd.get('endDate'),
            startTime: oneDay && !cur?.startTime ? fd.get('startTime') : null,
            reason: fd.get('reason'),
          });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setSent(r.data.days);
          if (!direct?.replaceId) form.reset();
          router.refresh();
        }}
      >
        <h2 className="font-semibold">{t(direct ? (direct.replaceId ? 'directEdit' : 'directAdd') : 'request')}</h2>
        {direct && <p className="text-sm text-muted">{t('directHint')}</p>}
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('typeLabel')}
          <select value={code} onChange={(e) => setCode(e.target.value)} className={field}>
            {groups.length <= 1
              ? types.map(option)
              : groups.map((g) =>
                  g ? (
                    <optgroup key={g} label={g}>
                      {types.filter((x) => x.group === g).map(option)}
                    </optgroup>
                  ) : (
                    types.filter((x) => !x.group).map(option)
                  ),
                )}
          </select>
        </label>
        {cur && (
          <p className="num rounded-button bg-surface p-3 text-sm text-muted">
            {t('typeInfo', { h: cur.hours })}
            {cur.startTime && ` · ${cur.startTime} - ${cur.endTime}`}
            {' · '}
            {cur.deducts ? t('typeDeducts', { d: cur.unit }) : t('typeNoDeduct')}
          </p>
        )}
        <div className={`grid gap-3 ${oneDay ? '' : 'grid-cols-2'}`}>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {oneDay ? t('date') : t('start')}
            <DateTimeInput name="startDate" type="date" required defaultValue={init?.startDate ?? today} className={`num ${field}`} />
          </label>
          {!oneDay && (
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('end')}
              <DateTimeInput name="endDate" type="date" required defaultValue={init?.endDate ?? today} className={`num ${field}`} />
            </label>
          )}
        </div>
        {oneDay && !cur?.startTime && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('startTime')}
            <DateTimeInput name="startTime" type="time" required defaultValue={init?.startTime ?? undefined} className={`num ${field}`} />
            <span className="text-xs text-faint">{t('startTimeHint', { h: cur?.hours ?? 0 })}</span>
          </label>
        )}
        <p className="text-xs text-faint">{t('workdaysOnly')}</p>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t(direct ? 'directReason' : 'reason')}
          <textarea name="reason" maxLength={200} rows={2} required={!!direct} minLength={direct ? 2 : undefined} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
          <span className="text-xs text-faint">{t(direct ? 'directReasonHint' : 'reasonHint')}</span>
        </label>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="leave" />}
        {sent !== null && <p className="text-sm font-semibold text-ok">{t(direct ? 'directDone' : 'sent', { n: sent })}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {t(direct ? (direct.replaceId ? 'directEditSave' : 'directAddSave') : 'submit')}
        </Button>
      </form>
    </Card>
  );
}

export function CancelLeave({ id }: { id: string }) {
  const t = useTranslations('leave');
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (!ask)
    return (
      <Button variant="outline" className="mt-1 self-start" onClick={() => setAsk(true)}>
        {t('cancel')}
      </Button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border p-3">
      <p className="text-sm">{t('cancelConfirm')}</p>
      <div className="flex gap-2">
        <Button
          disabled={busy}
          className="flex-1"
          onClick={async () => {
            setBusy(true);
            const r = await callApi(`/api/leave/${id}/cancel`);
            setBusy(false);
            if (!r.ok) return setErr(r);
            router.refresh();
          }}
        >
          {t('cancelYes')}
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setAsk(false)}>
          {t('back')}
        </Button>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="leave" />}
    </div>
  );
}

/** 승인된 휴가의 「삭제 요청」 (2026-10-11) — 사유를 적어 보내면 관리자가 승인해야 휴가가 취소된다. 대기 중이면 요청을 거둘 수 있다 */
export function DeleteLeaveRequest({ leaveId, pendingId }: { leaveId: string; pendingId: string | null }) {
  const t = useTranslations('leave');
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (pendingId)
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="rounded-button bg-warn-tint px-2 py-1 text-sm font-bold text-warn">{t('deletePending')}</span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await callApi(`/api/leave/change/${pendingId}`, { cancel: true });
            setBusy(false);
            router.refresh();
          }}
          className="min-h-11 rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-60"
        >
          {t('deleteWithdraw')}
        </button>
      </div>
    );
  if (!ask)
    return (
      <Button variant="outline" className="mt-1 self-start" onClick={() => setAsk(true)}>
        {t('deleteRequest')}
      </Button>
    );
  return (
    <form
      className="mt-1 flex flex-col gap-2 rounded-card border border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await callApi('/api/leave/change', { leaveId, reason });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setAsk(false);
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('deleteReason')}
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required autoComplete="off" className="min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text" />
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="leave" />}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || reason.trim().length < 1} className="flex-1">
          {t('deleteSend')}
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={() => setAsk(false)}>
          {t('deleteClose')}
        </Button>
      </div>
    </form>
  );
}
