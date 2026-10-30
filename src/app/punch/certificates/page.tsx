// 내 증명서 — 재직 · 경력증명서 신청과 발급된 증명서 내려받기 (2026-10-29 남은 일 9-3). 퇴직증명서는 관리자에게 요청한다(퇴사하면 로그인하지 못한다).
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { CertList } from '@/components/CertList';
import { CertRequestForm } from '@/components/CertForms';
import { Card, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadCerts } from '@/lib/certificates';

export default async function MyCertificatesPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, { rows, missing }] = await Promise.all([getTranslations('certificates'), loadCerts({ employeeId: me.id, practice: OFFICE.practiceMode })]);
  return (
    <PageShell>
      <div className="flex w-full flex-col gap-3 lg:gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('myTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('myIntro')}</p>
        </div>
        {missing ? (
          <p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('missing')}</p>
        ) : (
          <>
            <Card className="flex flex-col gap-3">
              <h2 className="font-bold">{t('newTitle')}</h2>
              <CertRequestForm kinds={['EMPLOYMENT', 'CAREER']} />
            </Card>
            <h2 className="pt-2 font-bold">{t('historyTitle')}</h2>
            <CertList rows={rows} />
          </>
        )}
      </div>
    </PageShell>
  );
}
