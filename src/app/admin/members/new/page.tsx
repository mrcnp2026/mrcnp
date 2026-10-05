// 직원 등록 — 정보 입력 → 초대 보내기 2단계 (2026-10-05 의뢰인: 샤플 구성원 등록 대조. 예전에는 직원 목록 아래에 펼쳐지는 작은 양식이었다).
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { LOCALE_NAMES, LOCALES } from '@/i18n/locales';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { toKstDate } from '@/lib/time';
import { RegisterWizard } from './RegisterWizard';

export default async function NewMemberPage() {
  const t = await getTranslations('admin.members');
  const tree = buildOrgTree(await loadOrgGroups());
  const groups = tree.flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const localhost = new URL(OFFICE.appOrigin).hostname === 'localhost';
  return (
    <PageShell>
      <Link href="/admin/members" className="-mb-2 inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('title')}
      </Link>
      <h1 className="px-1 text-2xl font-extrabold tracking-tight">{t('addTitle')}</h1>
      {localhost && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{t('localhostWarning')}</p>}
      <RegisterWizard groups={groups} locales={LOCALES.map((code) => ({ code, name: LOCALE_NAMES[code] }))} today={toKstDate(new Date())} />
    </PageShell>
  );
}
