'use client';
// 직원 정보 수정 — 등록 화면과 같은 칸 (EmployeeFields). 저장하면 고친 사람이 변경 기록에 남는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { EmployeeFields, type EmployeeValues, type OrgOption } from '../EmployeeFields';

export function ProfileForm({ employeeId, initial, groups, locales, today }: { employeeId: string; initial: EmployeeValues; groups: OrgOption[]; locales: { code: string; name: string }[]; today: string }) {
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
      }}
    >
      <EmployeeFields initial={initial} groups={groups} locales={locales} today={today} />
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.members" />}
      {saved && <p role="status" className="text-sm font-semibold text-ok">{t('profileSaved')}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? tc('working') : t('profileSave')}
      </Button>
    </form>
  );
}
