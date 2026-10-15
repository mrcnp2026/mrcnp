'use client';
// 권한 등급 고르기 — 다섯 등급을 한곳에서 (2026-10-15 의뢰인: `스샷/스샷2/권한3.png` — 「관리자 해제 · 급여 담당 지정」만 있고 등급을 직접 줄 수 없었다).
// 고를 수 없는 등급은 흐리게 두고 이유를 한 줄로 알려 준다. 서버가 같은 규칙을 다시 검사한다(api/admin/employees/[id]/grade).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export type GradeKey = 'super' | 'ceo' | 'general' | 'manager' | 'employee';

export function GradeForm({ employeeId, current, allowed, taken }: { employeeId: string; current: GradeKey; allowed: GradeKey[]; taken: Partial<Record<GradeKey, string>> }) {
  const t = useTranslations('admin.manage');
  const router = useRouter();
  const [pick, setPick] = useState<GradeKey>(current);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'pending' | 'ok' | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const changed = pick !== current;
  return (
    <form
      className="flex flex-col gap-3 px-5 pb-4"
      data-grade-form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!changed || reason.trim().length < 2) return;
        setBusy(true);
        setErr(null);
        const r = await callApi<{ pending?: boolean }>(`/api/admin/employees/${employeeId}/grade`, { grade: pick, reason });
        setBusy(false);
        if (!r.ok) return setErr({ code: r.code, requestId: r.requestId });
        setDone(r.data.pending ? 'pending' : 'ok');
        setReason('');
        router.refresh();
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-sm text-muted">{t('gradePick')}</legend>
        {(['super', 'ceo', 'general', 'manager', 'employee'] as const).map((g) => {
          const can = allowed.includes(g) || g === current;
          return (
            <label key={g} className={`flex min-h-11 items-center gap-3 rounded-button border px-3 ${pick === g ? 'border-primary bg-primary-tint' : 'border-border'} ${can ? 'cursor-pointer' : 'opacity-50'}`}>
              <input type="radio" name="grade" value={g} checked={pick === g} disabled={!can} onChange={() => setPick(g)} className="size-4 accent-primary" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold">
                  {t(`grade.${g}`)}
                  {g === current && <span className="ml-1.5 text-xs font-normal text-primary">{t('gradeNow')}</span>}
                </span>
                <span className="text-xs text-muted">{taken[g] ? t('gradeTaken', { name: taken[g] }) : t(`gradeHint.${g}`)}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {changed && (
        <>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} rows={2} placeholder={t('reason')} aria-label={t('reason')} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
          <span className="text-xs text-faint">{t('gradeNote')}</span>
        </>
      )}
      {done && <p className="text-sm font-semibold text-ok">{t(done === 'pending' ? 'gradePending' : 'gradeDone')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.manage" />}
      <Button type="submit" disabled={!changed || busy || reason.trim().length < 2}>
        {t('gradeSave')}
      </Button>
    </form>
  );
}
