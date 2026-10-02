'use client';
// 연차 부여 입력 (4-7). 숫자는 관리자가 직접 쓴다 — 참고 계산값을 미리 채우지 않는다.
// 같은 기간 이름으로 다시 저장하면 고친다 (변경 기록에 남음).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function GrantForm({
  employeeId,
  defaults,
}: {
  employeeId: string;
  defaults: { periodLabel: string; effectiveFrom: string; basis: 'hire_date' | 'fiscal_year'; grantedDays: string; carriedDays: string };
}) {
  const t = useTranslations('admin.leave');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (!open)
    return (
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => setOpen(true)}>
          {defaults.grantedDays ? t('edit') : t('add')}
        </Button>
        {saved && <span className="text-sm font-semibold text-ok">{t('saved')}</span>}
      </div>
    );
  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        const r = await callApi('/api/admin/leave/grants', {
          employeeId,
          periodLabel: fd.get('periodLabel'),
          grantedDays: fd.get('grantedDays'),
          carriedDays: fd.get('carriedDays'),
          basis: fd.get('basis'),
          effectiveFrom: fd.get('effectiveFrom'),
          note: fd.get('note'),
        });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setSaved(true);
        setOpen(false);
        router.refresh();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('periodLabel')}
          <input name="periodLabel" required maxLength={40} defaultValue={defaults.periodLabel} className={`num ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('effectiveFrom')}
          <DateTimeInput name="effectiveFrom" type="date" required defaultValue={defaults.effectiveFrom} className={`num ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('grantedDays')}
          <input name="grantedDays" type="number" required min={0} max={99} step={0.25} inputMode="decimal" defaultValue={defaults.grantedDays} className={`num ${field}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('carriedDays')}
          <input name="carriedDays" type="number" min={0} max={99} step={0.25} inputMode="decimal" defaultValue={defaults.carriedDays} className={`num ${field}`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('basis')}
        <select name="basis" defaultValue={defaults.basis} className={field}>
          <option value="hire_date">{t('basisHire')}</option>
          <option value="fiscal_year">{t('basisFiscal')}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('note')}
        <input name="note" maxLength={200} className={field} />
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
