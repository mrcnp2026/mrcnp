// 조직도 — 부서 › 팀 2단계 (2026-10-05 의뢰인). 직원을 묶어 보는 용도다. 승인 권한은 그룹과 무관하게 관리자에게만 있다.
// 숫자는 그 그룹에 속한 재직 직원 수 (부서 줄은 소속 팀 직원까지 더한 수).
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageShell } from '@/components/ui';
import { BRAND } from '@/config/brand';
import { buildOrgTree, groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { GroupManager } from './GroupManager';
import { OrgDiagram } from './OrgDiagram';

export default async function OrgPage() {
  const t = await getTranslations('admin.org');
  const [groups, { data: people }] = await Promise.all([
    loadOrgGroups(),
    createAdminClient().from('profiles').select('group_id').eq('active', true).not('group_id', 'is', null),
  ]);
  const countOf = new Map<string, number>();
  for (const p of people ?? []) countOf.set(p.group_id, (countOf.get(p.group_id) ?? 0) + 1);
  const depts = buildOrgTree(groups).map((d) => {
    const teams = d.teams.map((x) => ({ id: x.id, name: x.name, active: x.active, count: countOf.get(x.id) ?? 0 }));
    const own = countOf.get(d.id) ?? 0;
    return { id: d.id, name: d.name, active: d.active, count: own, total: own + teams.reduce((a, x) => a + x.count, 0), teams };
  });
  // 검사 스크립트가 만든 그룹(e2e-…)은 숨긴 목록에도 보이지 않게 (검사 계정과 같은 규칙)
  const hidden = groups.filter((g) => !g.active && !g.name.startsWith('e2e-')).map((g) => ({ id: g.id, name: g.name, active: false, count: 0, path: groupPath(groups, g.id) ?? g.name }));

  return (
    <PageShell wide>
      <Link href="/admin/members" className="-mb-2 inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('back')}
      </Link>
      <h1 className="px-1 text-2xl font-extrabold tracking-tight">{t('title')}</h1>
      <p className="px-1 text-sm text-muted">{t('intro')}</p>
      <OrgDiagram root={BRAND.name} depts={depts.filter((d) => d.active).map((d) => ({ ...d, teams: d.teams.filter((x) => x.active) }))} countLabel={(n) => t('count', { n })} />
      <GroupManager depts={depts} hidden={hidden} />
    </PageShell>
  );
}
