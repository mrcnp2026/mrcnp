// 조직도 — 최대 3단계 (2026-10-05 2단계 → 2026-10-25 3단계, 의뢰인). 직원을 묶어 보는 용도다. 승인 권한은 조직과 무관하게 관리자에게만 있다.
// 숫자는 그 조직에 속한 재직 직원 수 (위 조직 줄은 하위 조직 직원까지 더한 수).
import { getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { PageShell } from '@/components/ui';
import { companyName } from '@/lib/company'; // 통합설정 › 회사 기본설정의 회사명 (2026-10-18)
import { buildNested, groupPath, type OrgNode } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { GroupManager, type TreeRow } from './GroupManager';
import { OrgDiagram } from './OrgDiagram';
import { PrintButton } from './PrintButton';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin'; // 시스템관리자는 목록에 보이지 않는다 (2026-10-18)

export default async function OrgPage() {
  const t = await getTranslations('admin.org');
  const [groups, { data: people }] = await Promise.all([
    loadOrgGroups(),
    createAdminClient().from('profiles').select('group_id').or(NOT_SYSTEM_ADMIN).eq('active', true).not('group_id', 'is', null),
  ]);
  const countOf = new Map<string, number>();
  for (const p of people ?? []) countOf.set(p.group_id, (countOf.get(p.group_id) ?? 0) + 1);
  const rowOf = (n: OrgNode): TreeRow => {
    const children = n.children.map(rowOf);
    const count = countOf.get(n.id) ?? 0;
    return { id: n.id, name: n.name, active: n.active, count, total: count + children.reduce((a, c) => a + c.total, 0), children };
  };
  const tree = buildNested(groups).map(rowOf);
  // 검사 스크립트가 만든 그룹(e2e-…)은 숨긴 목록에도 보이지 않게 (검사 계정과 같은 규칙)
  const hidden = groups.filter((g) => !g.active && !g.name.startsWith('e2e-')).map((g) => ({ id: g.id, name: g.name, active: false, count: 0, path: groupPath(groups, g.id) ?? g.name }));

  return (
    <PageShell wide>
      {/* 인쇄: 가로 A4 한 장에 조직도 도형만 (메뉴 · 단추는 globals.css의 print 규칙으로 빠진다) */}
      <style>{'@media print { @page { size: A4 landscape; margin: 12mm; } }'}</style>
      <Link href="/admin/members" data-noprint className="-mb-2 inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}<HelpTip>{t('intro')}</HelpTip></h1>
        <span className="hidden text-sm text-muted print:inline">{toKstDate(new Date())}</span>
        <PrintButton />
      </div>
      <OrgDiagram root={await companyName()} tree={tree} countLabel={(n) => t('count', { n })} />
      <div data-noprint className="flex flex-col gap-3">
        <GroupManager tree={tree} hidden={hidden} />
      </div>
    </PageShell>
  );
}
