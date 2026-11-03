'use client';
// 권한 등급 고르기 — 다섯 등급을 한곳에서 (2026-10-15 의뢰인: `스샷/스샷2/권한3.png` — 「관리자 해제 · 급여 담당 지정」만 있고 등급을 직접 줄 수 없었다).
// 고를 수 없는 등급은 흐리게 두고 이유를 한 줄로 알려 준다. 서버가 같은 규칙을 다시 검사한다(api/admin/employees/[id]/grade).
// 2026-10-16 의뢰인 권한-10: 최고관리자(대표자 포함 최대 3명) · 대표자(1명) · 지점관리자 · 일반직원. 최고관리자 · 대표자는 권한이 같다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { SHOWN_GRADES } from '@/lib/staff-rules';

export type GradeKey = 'super' | 'ceo' | 'manager' | 'employee';

// 지점관리자를 고르면 맡을 지점 체크 칸이 바로 아래 나오고, 저장 한 번에 등급과 지점을 같이 저장한다 (2026-11-03 의뢰인). 이미 지점관리자면 지점만 바꿔 저장할 수 있다
export function GradeForm({ employeeId, current, allowed, topNames, ceoName, groups = [], managed = [] }: { employeeId: string; current: GradeKey; allowed: GradeKey[]; topNames: string[]; ceoName?: string; groups?: { id: string; label: string }[]; managed?: string[] }) {
  const t = useTranslations('admin.manage');
  const router = useRouter();
  const [pick, setPick] = useState<GradeKey>(current);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'pending' | 'ok' | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set(managed));
  const changed = pick !== current;
  const scopeChanged = pick === 'manager' && (sel.size !== managed.length || managed.some((g) => !sel.has(g)));
  const needScope = pick === 'manager' && sel.size === 0;
  const canSave = !busy && !needScope && (changed ? reason.trim().length >= 2 : scopeChanged);
  const toggle = (id: string) => {
    setDone(null);
    setSel((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  return (
    <form
      className="flex flex-col gap-3 px-5 pb-4"
      data-grade-form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSave) return;
        setBusy(true);
        setErr(null);
        const r = changed
          ? await callApi<{ pending?: boolean }>(`/api/admin/employees/${employeeId}/grade`, { grade: pick, reason, groupIds: pick === 'manager' ? [...sel] : undefined })
          : await callApi<{ pending?: boolean }>(`/api/admin/employees/${employeeId}/manager-scope`, { groupIds: [...sel] }); // 이미 지점관리자 — 지점만
        setBusy(false);
        if (!r.ok) return setErr({ code: r.code, requestId: r.requestId });
        setDone(r.data.pending ? 'pending' : 'ok');
        setReason('');
        router.refresh();
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-sm text-muted">{t('gradePick')}</legend>
        {SHOWN_GRADES.map((g) => {
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
                {g === 'ceo' && ceoName && <span className="text-xs text-faint">{t('gradeTaken', { name: ceoName })}</span>}
              </span>
            </label>
          );
        })}
      </fieldset>
      {pick === 'manager' && (
        <fieldset className="flex flex-col gap-1 rounded-button border border-border p-3">
          <legend className="px-1 text-sm font-bold">{t('scopeTitle')}</legend>
          <p className="text-xs text-muted">{t('scopeHint')}</p>
          {groups.length === 0 && <p className="text-sm text-warn">{t('scopeNoGroups')}</p>}
          {groups.map((g) => (
            <label key={g.id} className="flex min-h-9 items-center gap-2 text-sm">
              <input type="checkbox" checked={sel.has(g.id)} onChange={() => toggle(g.id)} className="size-5 accent-primary" />
              {g.label}
            </label>
          ))}
          {needScope && <p className="text-sm text-warn">{t('scopeEmpty')}</p>}
        </fieldset>
      )}
      {changed && (
        <>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} rows={2} placeholder={t('reason')} aria-label={t('reason')} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
          <span className="text-xs text-faint">{t('gradeNote')}</span>
        </>
      )}
      {done && <p role="status" className="text-sm font-semibold text-ok">{t(done === 'pending' ? 'gradePending' : changed || pick !== 'manager' ? 'gradeDone' : 'scopeSaved')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.manage" />}
      <Button type="submit" disabled={!canSave}>
        {t(!changed && pick === 'manager' ? 'scopeSave' : 'gradeSave')}
      </Button>
    </form>
  );
}
