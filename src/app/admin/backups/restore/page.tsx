// 백업으로 되돌리기 (2026-10-25 의뢰인): 어느 백업의 어느 표를 어떻게 되돌릴지 고르고, 먼저 견주어 본 뒤에 되돌린다. 시스템관리자만.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { canDownloadBackup } from '@/lib/backup/github';
import { backupPrefix, backupReady } from '@/lib/backup/run';
import { parseName } from '@/lib/backup/store';
import { RestorePanel } from './RestorePanel';

export default async function RestorePage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const [t, me, sp] = await Promise.all([getTranslations('admin.backups'), getMe(), searchParams]);
  const name = sp.name ?? '';
  const p = parseName(name);
  const ok = canDownloadBackup(me) && backupReady() && !!p && name.startsWith(backupPrefix() + '/');
  return (
    <PageShell wide>
      <Link href="/admin/backups" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">‹ {t('title')}</Link>
      <h1 className="text-2xl font-bold">{t('restoreTitle')}</h1>
      {ok && p ? (
        <>
          <p className="rounded-card bg-surface p-3 text-sm">{t('restoreFrom', { date: p.date, time: p.time })}</p>
          <RestorePanel name={name} />
        </>
      ) : (
        <p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('restoreForbidden')}</p>
      )}
    </PageShell>
  );
}
