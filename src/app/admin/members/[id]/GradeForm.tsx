'use client';
// 권한 등급 고르기 — 다섯 등급을 한곳에서 (2026-10-15 의뢰인: `스샷/스샷2/권한3.png` — 「관리자 해제 · 급여 담당 지정」만 있고 등급을 직접 줄 수 없었다).
// 고를 수 없는 등급은 흐리게 두고 이유를 한 줄로 알려 준다. 서버가 같은 규칙을 다시 검사한다(api/admin/employees/[id]/grade).
// 2026-10-15 의뢰인: 등급은 「최고관리자(최대 3명, 대표자 포함) · 일반직원」 두 가지만 보인다. 총괄 · 지점관리자는 화면에서만 숨기고 기능은 남긴다
//   (지금 그 등급인 사람은 「지금 등급」으로만 보인다). 대표자(ceo)는 최고관리자로 보인다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { SHOWN_GRADES } from '@/lib/staff-rules';

export type GradeKey = 'super' | 'ceo' | 'general' | 'manager' | 'employee';

export function GradeForm({ employeeId, current, allowed, topNames }: { employeeId: string; current: GradeKey; allowed: GradeKey[]; topNames: string[] }) {
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
        {[...(SHOWN_GRADES as readonly GradeKey[]).includes(current) ? [] : [current], ...SHOWN_GRADES].map((g) => {
          const can = allowed.includes(g) || g === current;
          return (
            <label key={g} className={`flex min-h-11 items-center gap-3 rounded-button border px-3 ${pick === g ? 'border-primary bg-primary-tint' : 'border-border'} ${can ? 'cursor-pointer' : 'opacity-50'}`}>
              <input type="radio" name="grade" value={g} checked={pick === g} disabled={!can} onChange={() => setPick(g)} className="size-4 accent-primary" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold">
                  {t(`grade.${g}`)}
                  {g === current && <span className="ml-1.5 text-xs font-normal text-primary">{t('gradeNow')}</span>}
                </span>
                <span className="text-xs text-muted">{t(`gradeHint.${g}`)}</span>
                {g === 'super' && <span className="text-xs text-faint">{t('gradeTopNow', { n: topNames.length, names: topNames.join(', ') || '-' })}</span>}
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
