'use client';
// 휴가 종류별 신청 규칙 — 한 번에 낼 수 있는 일수 · 며칠 전까지 · 사유 필수. 저장하면 새 판이 쌓이고 직원의 신청에 바로 적용된다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSaveRule } from '@/components/useSaveRule';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import type { LeaveTypeRule } from '@/lib/leave-ledger';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';

export function TypeRuleForm({ code, version, rule, groups, people, builtin }: { code: string; version: number; rule: LeaveTypeRule; groups: { id: string; name: string }[]; people: { id: string; name: string }[]; builtin: boolean }) {
  const t = useTranslations('admin.leaveTypeRule');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const num = (v: FormDataEntryValue | null) => (v === null || v === '' ? null : Number(v));
  const save = useSaveRule();
  return (
    <form
      ref={save.ref}
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        setDone(false);
        const r = await callApi('/api/admin/leave/ledger', { action: 'typeRule', code, expectedVersion: version, rule: { maxDaysPerRequest: num(f.get('max')), minNoticeDays: num(f.get('notice')), reasonRequired: f.get('reason') === 'on', evidenceRequired: false,weekdays: f.getAll('wd').length ? f.getAll('wd').map(Number) : null, targets: { groupIds: f.getAll('tg').map(String), employeeIds: f.getAll('te').map(String) }, nameEn: String(f.get('nameEn') ?? '').trim() || null } });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setDone(true);
        save.settle();
        router.refresh();
      }}
    >
      <h2 className="font-bold">{t('title')}</h2>
      <p className="text-muted">{t('intro')}</p>
      {!builtin && (
        <label className="flex flex-col gap-1">
          <span>{t('nameEn')}</span>
          <input name="nameEn" maxLength={40} defaultValue={rule.nameEn ?? ''} lang="en" className={field} autoComplete="off" />
          <span className="text-xs text-faint">{t('nameEnHint')}</span>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span>{t('max')}</span>
        <input name="max" type="number" min="0.03125" max="365" step="0.03125" defaultValue={rule.maxDaysPerRequest ?? ''} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t('notice')}</span>
        <input name="notice" type="number" min="0" max="365" step="1" defaultValue={rule.minNoticeDays ?? ''} className={field} />
      </label>
      <label className="flex min-h-9 items-center gap-2">
        <input name="reason" type="checkbox" defaultChecked={rule.reasonRequired} className="size-5 accent-primary" />
        {t('reason')}
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend>{t('weekdays')}</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="flex min-h-9 items-center gap-1.5 rounded-button border border-border px-2.5">
              <input type="checkbox" name="wd" value={d} defaultChecked={!rule.weekdays || rule.weekdays.includes(d)} className="size-4 accent-primary" />
              {t(`wd.${d}`)}
            </label>
          ))}
        </div>
        <span className="text-xs text-faint">{t('weekdaysHint')}</span>
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend>{t('targets')}</legend>
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-button border border-border p-2">
          {groups.map((g) => (
            <label key={g.id} className="flex min-h-8 items-center gap-2">
              <input type="checkbox" name="tg" value={g.id} defaultChecked={rule.targets.groupIds.includes(g.id)} className="size-4 accent-primary" />
              {g.name}
            </label>
          ))}
          {people.map((p) => (
            <label key={p.id} className="flex min-h-8 items-center gap-2">
              <input type="checkbox" name="te" value={p.id} defaultChecked={rule.targets.employeeIds.includes(p.id)} className="size-4 accent-primary" />
              {p.name}
            </label>
          ))}
        </div>
        <span className="text-xs text-faint">{t('targetsHint')}</span>
      </fieldset>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.leaveTypeRule" />}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy || !save.dirty}>
          {t('save')}
        </Button>
        {done && (
          <span role="status" className="text-ok">
            {t('saved')}
          </span>
        )}
      </div>
    </form>
  );
}
