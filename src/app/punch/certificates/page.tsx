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
      <div>
        <h1 className="text-2xl font-bold">{t('myTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('myIntro')}</p>
      </div>
      {missing ? (
        <p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('missing')}</p>
      ) : (
        // 2026-10-30 의뢰인: 직원 홈 · 내 프로필처럼 칸을 나눈다 — 왼쪽: 신청(종류 카드 · 용도 · 부수), 오른쪽: 신청 · 발급 내역. 폰은 신청 → 내역 순서
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-6">
          <Card className="flex flex-col gap-3 lg:sticky lg:top-4">
            <h2 className="font-bold">{t('newTitle')}</h2>
            <CertRequestForm kinds={['EMPLOYMENT', 'CAREER']} />
          </Card>
          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="flex min-h-8 items-center gap-2 font-bold">
              {t('historyTitle')}
              <span className="num rounded-chip bg-surface px-2 text-xs text-muted">{rows.length}</span>
            </h2>
            <CertList rows={rows} />
          </section>
        </div>
      )}
    </PageShell>
  );
}
