// 직원 등록 — 정보 입력 → 초대 보내기 2단계 (2026-10-05 의뢰인: 샤플 구성원 등록 대조. 예전에는 직원 목록 아래에 펼쳐지는 작은 양식이었다).
import { getMe } from '@/lib/auth';
import { loadNewStaffPayDefaults } from '@/lib/payroll/data';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { LOCALE_NAMES, LOCALES } from '@/i18n/locales';
import { orgOptions } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { toKstDate } from '@/lib/time';
import { RegisterWizard } from './RegisterWizard';
import { StaffAddTabs } from '../StaffImport';

export default async function NewMemberPage() {
  const t = await getTranslations('admin.members');
  const groups = orgOptions(await loadOrgGroups());
  const localhost = new URL(OFFICE.appOrigin).hostname === 'localhost';
  const me = await getMe();
  const pay = me?.canViewPayroll ? await loadNewStaffPayDefaults(toKstDate(new Date())) : undefined; // 급여를 볼 수 있는 관리자에게만 급여 칸 (2026-10-25)
  return (
    <PageShell wide>
      <Link href="/admin/members" className="-mb-2 inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('title')}
      </Link>
      <h1 className="px-1 text-2xl font-extrabold tracking-tight">{t('addTitle')}</h1>
      {localhost && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{t('localhostWarning')}</p>}
      <StaffAddTabs one={<RegisterWizard groups={groups} locales={LOCALES.map((code) => ({ code, name: LOCALE_NAMES[code] }))} today={toKstDate(new Date())} pay={pay} />} />
    </PageShell>
  );
}
