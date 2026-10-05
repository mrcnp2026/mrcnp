'use client';
// 관리자 대리 등록 (②-3 7-6). 버튼 → 입력 → 확인 → 저장. 넣은 기록은 지울 수 없으므로 저장 전에 한 번 더 보여 준다.
// 사유는 필수 — 자주 쓰는 사유는 버튼으로 채운다 (자유 입력만 두면 "."을 찍는다, 요점 1).
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

type Kind = 'in' | 'out';
const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
const PRESETS = ['battery', 'noPhone', 'appError'] as const;

export function ProxyEntry({
  employeeId,
  name,
  workDate,
  dateLabel,
  kinds,
  today,
}: {
  employeeId: string;
  name: string;
  workDate?: string; // 정해진 날짜 (줄마다 붙는 버튼). 없으면 날짜를 고른다
  dateLabel?: string;
  kinds: Kind[];
  today: string;
}) {
  const t = useTranslations('admin.detail');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [date, setDate] = useState(workDate ?? '');
  const [kind, setKind] = useState<Kind>(kinds[0]);
  const [time, setTime] = useState('');
  const [nextDay, setNextDay] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const ready = !!date && !!time && reason.trim().length >= 2;

  const close = () => {
    setOpen(false);
    setStep('form');
    setErr(null);
  };
  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = await callApi(`/api/admin/employees/${employeeId}/punch`, { workDate: date, kind, time, nextDay: kind === 'out' && nextDay, reason });
    setBusy(false);
    if (!r.ok) {
      setStep('form');
      return setErr(r);
    }
    setDone(true);
    close();
    setTime('');
    setReason('');
    setNextDay(false);
    router.refresh();
  };

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button type="button" onClick={() => { setOpen(true); setDone(false); }} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary">
          <Plus aria-hidden size={16} strokeWidth={2} />
          {workDate ? t('add') : t('addOther')}
        </button>
        {done && <p role="status" className="text-sm font-semibold text-ok">{t('saved')}</p>}
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="flex flex-col gap-3 rounded-button bg-surface p-4">
        <p className="font-semibold">{t('confirmTitle', { name })}</p>
        <dl className="num grid grid-cols-3 gap-y-1 text-sm">
          <dt className="text-muted">{t('date')}</dt>
          <dd className="col-span-2">{dateLabel ?? date}</dd>
          <dt className="text-muted">{t('which')}</dt>
          <dd className="col-span-2">{t(`kind.${kind}`)} {time}{kind === 'out' && nextDay ? ` (${t('nextDayShort')})` : ''}</dd>
          <dt className="text-muted">{t('reason')}</dt>
          <dd className="col-span-2 break-words whitespace-pre-wrap">{reason.trim()}</dd>
        </dl>
        <p className="text-sm text-warn">{t('confirmWarn')}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setStep('form')}>
            {t('back')}
          </Button>
          <Button className="flex-1" disabled={busy} onClick={save}>
            {t('save')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-button bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) setStep('confirm');
      }}
    >
      <p className="font-semibold">{t('formTitle', { name })}</p>
      {!workDate && (
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('date')}
          <DateTimeInput type="date" required max={today} value={date} onChange={setDate} className={`num ${field}`} />
        </label>
      )}
      {kinds.length > 1 ? (
        <fieldset className="grid grid-cols-2 rounded-button bg-bg p-1">
          <legend className="sr-only">{t('which')}</legend>
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-11 rounded-button text-sm font-bold ${kind === k ? 'bg-primary-tint text-primary' : 'text-muted'}`}
            >
              {t(`kind.${k}`)}
            </button>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-muted">{t('whichOne', { kind: t(`kind.${kind}`) })}</p>
      )}
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('time')}
        <DateTimeInput type="time" required value={time} onChange={setTime} className={`num ${field}`} />
      </label>
      {kind === 'out' && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={nextDay} onChange={(e) => setNextDay(e.target.checked)} className="size-5" />
          {t('nextDay')}
        </label>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">{t('reason')}</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setReason(t(`preset.${p}`))} className="min-h-11 rounded-chip bg-bg px-3 text-sm font-medium text-primary">
              {t(`preset.${p}`)}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={200}
          rows={2}
          aria-label={t('reason')}
          className="w-full rounded-button border border-border bg-bg p-3 text-base text-text"
        />
        <span className="text-xs text-faint">{t('reasonHint')}</span>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.detail" />}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={close}>
          {t('cancel')}
        </Button>
        <Button type="submit" className="flex-1" disabled={!ready}>
          {t('next')}
        </Button>
      </div>
    </form>
  );
}
