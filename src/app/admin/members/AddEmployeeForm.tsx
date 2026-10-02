'use client';
import { DateTimeInput } from '@/components/DateTimeInput';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';
import { InviteView, type Invite } from './InviteView';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function AddEmployeeForm({ locales }: { locales: { code: string; name: string }[]; localhost: boolean }) {
  const t = useTranslations('admin.members');
  const tc = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [created, setCreated] = useState<{ name: string; invite: Invite } | null>(null);

  if (created) return <InviteView name={created.name} invite={created.invite} onClose={() => setCreated(null)} />;

  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          setErr(null);
          const r = await callApi<{ name: string; invite: Invite }>('/api/admin/employees', Object.fromEntries(fd));
          setBusy(false);
          if (!r.ok) return setErr(r);
          setCreated(r.data);
          router.refresh();
        }}
      >
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <UserPlus aria-hidden size={22} strokeWidth={1.75} />
          {t('addTitle')}
        </h2>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('name')}
          <input name="name" required maxLength={50} className={field} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('employeeNo')}
          <input name="employeeNo" required maxLength={20} pattern="[A-Za-z0-9\-]{1,20}" className={`num ${field}`} autoComplete="off" />
          <span className="text-xs text-faint">{t('employeeNoHelp')}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('locale')}
          <select name="locale" defaultValue="en" className={field}>
            {locales.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('joinedOn')}
          <DateTimeInput name="joinedOn" type="date" className={`num ${field}`} />
        </label>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.members" />}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? tc('working') : t('submit')}
        </Button>
      </form>
    </Card>
  );
}
