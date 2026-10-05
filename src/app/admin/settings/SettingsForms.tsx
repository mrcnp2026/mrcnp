'use client';
// 설정 화면의 입력 양식들 — 전부 /api/admin/settings 한 곳으로 보낸다. 저장하면 화면을 새로 읽는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
type Err = { code: string; requestId?: string } | null;

function useSettingsPost() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const r = await callApi('/api/admin/settings', body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return false;
    }
    router.refresh();
    return true;
  };
  return { busy, err, post };
}

/** 한 번 더 확인하고 실행하는 작은 버튼 (숨기기·빼기·끄기) */
export function ConfirmButton({ body, label, confirmLabel, ariaLabel }: { body: Record<string, unknown>; label: string; confirmLabel: string; ariaLabel: string }) {
  const { busy, err, post } = useSettingsPost();
  const [ask, setAsk] = useState(false);
  return (
    <span className="flex shrink-0 flex-col items-end">
      {ask ? (
        <span className="flex items-center gap-1">
          <button type="button" disabled={busy} onClick={async () => (await post(body)) && setAsk(false)} className="min-h-11 rounded-button bg-danger px-3 text-sm font-bold text-on-primary disabled:opacity-60">
            {confirmLabel}
          </button>
          <button type="button" onClick={() => setAsk(false)} aria-label={ariaLabel} className="min-h-11 px-2 text-sm text-muted">
            ✕
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setAsk(true)} aria-label={ariaLabel} className="min-h-11 px-2 text-sm font-medium text-muted">
          {label}
        </button>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
    </span>
  );
}

function Fold({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 self-start text-sm font-bold text-primary">
        + {label}
      </button>
    );
  }
  return <div className="rounded-button bg-surface p-4">{children(() => setOpen(false))}</div>;
}

export type RuleValues = { startTime: string; endTime: string; lateGraceMin: number; breakStart: string; breakEnd: string; workdays: number[]; weeklyRestDay: number };

export function RuleForm({ initial, tomorrow, weekdays }: { initial: RuleValues; tomorrow: string; weekdays: string[] }) {
  const t = useTranslations('admin.settings');
  const { busy, err, post } = useSettingsPost();
  const [days, setDays] = useState<number[]>(initial.workdays);
  const [rest, setRest] = useState(initial.weeklyRestDay);
  return (
    <Fold label={t('ruleAdd')}>
      {(close) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (await post({ action: 'rule.add', ...Object.fromEntries(fd), workdays: days, weeklyRestDay: rest })) close();
          }}
        >
          <p className="text-sm text-muted">{t('ruleAddHint')}</p>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('effectiveFrom')}
            <DateTimeInput name="effectiveFrom" type="date" required defaultValue={tomorrow} className={`num ${field}`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('start')}
              <DateTimeInput name="startTime" type="time" required defaultValue={initial.startTime} className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('end')}
              <DateTimeInput name="endTime" type="time" required defaultValue={initial.endTime} className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('breakStart')}
              <DateTimeInput name="breakStart" type="time" defaultValue={initial.breakStart} className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('breakEnd')}
              <DateTimeInput name="breakEnd" type="time" defaultValue={initial.breakEnd} className={`num ${field}`} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('grace')}
            <input name="lateGraceMin" type="number" inputMode="numeric" min={0} max={120} required defaultValue={initial.lateGraceMin} className={`num ${field}`} />
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm text-muted">{t('workdays')}</legend>
            <div className="grid grid-cols-7 gap-1">
              {weekdays.map((w, i) => {
                const d = i + 1;
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    disabled={d === rest}
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                    className={`min-h-11 rounded-button text-sm font-bold disabled:opacity-40 ${on ? 'bg-primary text-on-primary' : 'bg-bg text-muted'}`}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('restDay')}
            <select
              value={rest}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRest(v);
                setDays(days.filter((x) => x !== v));
              }}
              className={field}
            >
              {weekdays.map((w, i) => (
                <option key={w} value={i + 1}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              {t('cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || days.length === 0}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}
    </Fold>
  );
}

export function HolidayForm({ monthStart }: { monthStart: string }) {
  const t = useTranslations('admin.settings');
  const { busy, err, post } = useSettingsPost();
  return (
    <Fold label={t('holidayAdd')}>
      {(close) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post({ action: 'holiday.add', ...Object.fromEntries(new FormData(e.currentTarget)) })) close();
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('holidayDate')}
            <DateTimeInput name="date" type="date" required className={`num ${field}`} />
            <span className="text-xs text-faint">{t('holidayDateHint', { date: monthStart })}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('holidayLabel')}
            <input name="label" required maxLength={40} className={field} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('holidayKind')}
            <select name="kind" defaultValue="company" className={field}>
              <option value="company">{t('kind.company')}</option>
              <option value="public">{t('kind.public')}</option>
            </select>
          </label>
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              {t('cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}
    </Fold>
  );
}

export function NetworkForm({ currentIp, currentKnown }: { currentIp: string | null; currentKnown: boolean }) {
  const t = useTranslations('admin.settings');
  const { busy, err, post } = useSettingsPost();
  const [cidr, setCidr] = useState('');
  return (
    <Fold label={t('networkAdd')}>
      {(close) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post({ action: 'network.add', cidr, label: new FormData(e.currentTarget).get('label') })) close();
          }}
        >
          <p className="text-sm text-muted">{t('networkAddHint')}</p>
          {currentIp && !currentKnown && (
            <button type="button" onClick={() => setCidr(currentIp)} className="min-h-11 self-start rounded-chip bg-bg px-3 text-sm font-medium text-primary">
              {t('networkUseCurrent', { ip: currentIp })}
            </button>
          )}
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('networkCidr')}
            <input value={cidr} onChange={(e) => setCidr(e.target.value)} required maxLength={50} className={`num ${field}`} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('networkLabel')}
            <input name="label" maxLength={40} className={field} autoComplete="off" />
          </label>
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              {t('cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || !cidr.trim()}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}
    </Fold>
  );
}
