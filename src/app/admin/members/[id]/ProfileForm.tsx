'use client';
// 직원 정보 수정 — 등록 화면과 같은 칸 (EmployeeFields). 저장하면 고친 사람이 변경 기록에 남는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { EmployeeFields, type EmployeeValues, type OrgOption } from '../EmployeeFields';

export function ProfileForm({ employeeId, initial, groups, today, onDone }: { employeeId: string; initial: EmployeeValues; groups: OrgOption[]; today: string; onDone?: () => void }) {
  const t = useTranslations('admin.members');
  const tc = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-6"
      onChange={() => setSaved(false)}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        setSaved(false);
        const r = await callApi(`/api/admin/employees/${employeeId}/profile`, Object.fromEntries(new FormData(e.currentTarget)));
        setBusy(false);
        if (!r.ok) return setErr(r);
        setSaved(true);
        router.refresh();
        onDone?.();
      }}
    >
      <EmployeeFields initial={initial} groups={groups} today={today} />
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.members" />}
      {saved && <p role="status" className="text-sm font-semibold text-ok">{t('profileSaved')}</p>}
      <div className="flex gap-2">
        {onDone && (
          <button type="button" onClick={onDone} className="min-h-12 flex-1 rounded-button border border-border bg-bg px-4 text-sm font-semibold lg:flex-none">
            {t('profileCancel')}
          </button>
        )}
        <Button type="submit" disabled={busy} className="flex-1 lg:flex-none lg:px-8">
          {busy ? tc('working') : t('profileSave')}
        </Button>
      </div>
    </form>
  );
}
