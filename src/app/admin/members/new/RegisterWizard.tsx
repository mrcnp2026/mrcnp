'use client';
// 직원 등록 2단계: ① 정보 입력 → ② 초대 보내기 (관리자 폰의 공유 창으로 링크 전달 — 의뢰인 2026-10-05: 유료 문자·알림톡 없이).
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';
import { EmployeeFields, type OrgOption } from '../EmployeeFields';
import { InviteView, type Invite } from '../InviteView';

export function RegisterWizard({ groups, locales, today }: { groups: OrgOption[]; locales: { code: string; name: string }[]; today: string }) {
  const t = useTranslations('admin.members');
  const tc = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [created, setCreated] = useState<{ employeeId: string; name: string; invite: Invite } | null>(null);
  const step = created ? 2 : 1;

  return (
    <>
      <ol className="grid grid-cols-2 gap-2" aria-label={t('steps')}>
        {([1, 2] as const).map((n) => (
          <li key={n} aria-current={step === n ? 'step' : undefined} className={`flex min-h-12 items-center gap-2 rounded-card px-4 text-sm font-bold ${step === n ? 'bg-primary text-on-primary' : 'bg-bg text-muted'}`}>
            <span className={`num flex size-6 shrink-0 items-center justify-center rounded-chip text-xs ${step === n ? 'bg-bg text-primary' : n < step ? 'bg-ok-tint text-ok' : 'bg-surface text-muted'}`}>
              {n < step ? <Check aria-hidden size={14} strokeWidth={3} /> : n}
            </span>
            {t(n === 1 ? 'stepInfo' : 'stepInvite')}
          </li>
        ))}
      </ol>

      {created ? (
        <>
          <p role="status" className="rounded-card bg-ok-tint p-3 text-sm font-semibold text-ok">{t('registered', { name: created.name })}</p>
          <InviteView name={created.name} invite={created.invite} onClose={() => router.push(`/admin/members/${created.employeeId}`)} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { setCreated(null); setErr(null); }}>
              {t('addAnother')}
            </Button>
            <Link href="/admin/members" className="inline-flex min-h-12 items-center justify-center rounded-button bg-primary-tint px-4 font-bold text-primary">
              {t('toList')}
            </Link>
          </div>
        </>
      ) : (
        <Card>
          <form
            className="flex flex-col gap-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              setErr(null);
              const r = await callApi<{ employeeId: string; name: string; invite: Invite }>('/api/admin/employees', Object.fromEntries(fd));
              setBusy(false);
              if (!r.ok) return setErr(r);
              setCreated(r.data);
              router.refresh();
            }}
          >
            <EmployeeFields groups={groups} locales={locales} today={today} />
            {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.members" />}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? tc('working') : t('submit')}
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
