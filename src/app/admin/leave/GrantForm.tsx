'use client';
// 연차 부여 입력 (4-7 → 2026-10-02 의뢰인 결정: 입사일 기준 계산값을 칸에 미리 채우고, 관리자가 확인해 저장).
// 저장은 언제나 관리자가 누른다 — 자동 저장 없음. 같은 기간 이름으로 다시 저장하면 고친다 (변경 기록에 남음).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

type Values = { periodLabel: string; effectiveFrom: string; basis: 'hire_date' | 'fiscal_year'; grantedDays: string; carriedDays: string };

export function GrantForm({
  employeeId,
  current,
  suggested,
}: {
  employeeId: string;
  current: Values | null; // 지금 적용 중인 부여
  suggested: { days: number; periodLabel: string; effectiveFrom: string } | null; // 입사일 기준 계산값
}) {
  const t = useTranslations('admin.leave');
  const router = useRouter();
  const fromSuggest = (s: NonNullable<typeof suggested>): Values => ({ periodLabel: s.periodLabel, effectiveFrom: s.effectiveFrom, basis: 'hire_date', grantedDays: String(s.days), carriedDays: current?.carriedDays ?? '0' });
  const initial = (): Values => current ?? (suggested ? fromSuggest(suggested) : { periodLabel: '', effectiveFrom: '', basis: 'hire_date', grantedDays: '', carriedDays: '0' });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  // 이미 입력된 값이 계산값과 다르면 (예: 입사 첫해에 한 달이 지남, 기념일이 지나 새 기간) 바꾸기 버튼
  const differs = !!suggested && !!current && (current.periodLabel !== suggested.periodLabel || Number(current.grantedDays) !== suggested.days);
  const set = (k: keyof Values) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  if (!open)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={current && !differs ? 'outline' : 'primary'} onClick={() => {
            setV(suggested && (differs || !current) ? fromSuggest(suggested) : initial());
            setOpen(true);
          }}>
          {!current ? (suggested ? t('addSuggested', { n: suggested.days }) : t('add')) : differs ? t('updateSuggested', { n: suggested!.days }) : t('edit')}
        </Button>
        {saved && <span className="text-sm font-semibold text-ok">{t('saved')}</span>}
      </div>
    );
  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await callApi('/api/admin/leave/grants', { employeeId, ...v });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setSaved(true);
        setOpen(false);
        router.refresh();
      }}
    >
      {suggested && <p className="text-xs text-primary">{t('prefilled', { n: suggested.days })}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('periodLabel')}
          <input required maxLength={40} value={v.periodLabel} onChange={set('periodLabel')} className={`num ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('effectiveFrom')}
          <DateTimeInput type="date" required value={v.effectiveFrom} onChange={(x) => setV({ ...v, effectiveFrom: x })} className={`num ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('grantedDays')}
          <input type="number" required min={0} max={99} step={0.25} inputMode="decimal" value={v.grantedDays} onChange={set('grantedDays')} className={`num ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('carriedDays')}
          <input type="number" min={0} max={99} step={0.25} inputMode="decimal" value={v.carriedDays} onChange={set('carriedDays')} className={`num ${field}`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('basis')}
        <select value={v.basis} onChange={set('basis')} className={field}>
          <option value="hire_date">{t('basisHire')}</option>
          <option value="fiscal_year">{t('basisFiscal')}</option>
        </select>
      </label>
      <p className="text-xs text-faint">{t('manualHint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.leave" />}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {t('save')}
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
          {t('close')}
        </Button>
      </div>
    </form>
  );
}

/** 입사일 입력·수정 — 저장하면 위 계산값이 바로 바뀐다 */
export function JoinedOnForm({ employeeId, joinedOn, today }: { employeeId: string; joinedOn: string | null; today: string }) {
  const t = useTranslations('admin.leave');
  const router = useRouter();
  const [v, setV] = useState(joinedOn ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm text-muted">
          {t('joinedOn')}
          <DateTimeInput type="date" value={v} max={today} onChange={setV} className={`num ${field}`} />
        </label>
        <Button
          variant="outline"
          disabled={busy || v === (joinedOn ?? '')}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const r = await callApi(`/api/admin/employees/${employeeId}/joined-on`, { joinedOn: v || null });
            setBusy(false);
            if (!r.ok) return setErr(r);
            router.refresh();
          }}
        >
          {t('saveJoined')}
        </Button>
      </div>
      {!joinedOn && <p className="text-xs text-warn">{t('joinedOnHint')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.leave" />}
    </div>
  );
}
