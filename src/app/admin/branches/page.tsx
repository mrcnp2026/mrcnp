// 지점 관리 (의뢰인 2026-10-10: 시프티 화면 기준) — 공장·부서를 한 줄씩. 누르면 지점 상세(출퇴근 장소·메모·직원 수).
// 지점은 조직도와 같은 표(org_groups, 지점 › 하위 지점 2단계)다. 그림으로 보는 조직도는 아래 링크로 남겼다.
import { ChevronRight, MapPin, Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { Card, PageShell } from '@/components/ui';
import { loadGroupLocationLinks } from '@/lib/geo-data';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { BranchAddForm } from './BranchForms';

export default async function BranchesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const t = await getTranslations('admin.branches');
  const sp = await searchParams;
  const off = sp.tab === 'off';
  const q = (sp.q ?? '').trim().toLowerCase();
  const [groups, links, { data: people }] = await Promise.all([
    loadOrgGroups(),
    loadGroupLocationLinks(),
    createAdminClient().from('profiles').select('group_id').eq('active', true).not('group_id', 'is', null),
  ]);
  const countOf = new Map<string, number>();
  for (const p of people ?? []) countOf.set(p.group_id, (countOf.get(p.group_id) ?? 0) + 1);
  const placesOf = (id: string) => links.filter((k) => k.groupId === id).length;
  const tree = buildOrgTree(groups, true);
  // 화면 순서: 지점, 그 밑의 하위 지점. 꺼 둔 탭에서는 숨긴 것만 (검사 스크립트가 만든 e2e-… 는 빼고)
  const rows = tree
    .flatMap((d) => [{ g: d, parent: null as string | null }, ...d.teams.map((x) => ({ g: x, parent: d.name }))])
    .filter(({ g }) => g.active !== off && (g.active || !g.name.startsWith('e2e-')))
    .filter(({ g, parent }) => !q || `${parent ?? ''} ${g.name}`.toLowerCase().includes(q));
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center border-b-2 text-sm font-bold ${on ? 'border-text text-text' : 'border-transparent text-muted'}`;

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-center gap-x-1 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <Help>{t('intro')}</Help>
        <Link href="/admin/members/groups" className="ml-auto inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {t('diagram')} ›
        </Link>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <nav aria-label={t('title')} className="flex rounded-card bg-bg px-2">
            <Link href="/admin/branches" aria-current={!off ? 'page' : undefined} className={tab(!off)}>
              {t('tabOn')}
            </Link>
            <Link href="/admin/branches?tab=off" aria-current={off ? 'page' : undefined} className={tab(off)}>
              {t('tabOff')}
            </Link>
          </nav>
          <form method="get" className="flex items-center gap-2 rounded-card bg-bg px-4">
            {off && <input type="hidden" name="tab" value="off" />}
            <Search aria-hidden size={20} className="shrink-0 text-muted" />
            <input name="q" defaultValue={sp.q ?? ''} placeholder={t('search')} aria-label={t('search')} className="min-h-12 w-full bg-transparent text-base outline-none" autoComplete="off" />
          </form>
          {rows.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(q ? 'noMatch' : off ? 'emptyOff' : 'empty')}</p>}
          <RowList>
            {rows.map(({ g, parent }) => (
              <li key={g.id}>
                <Link href={`/admin/branches/${g.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">{g.name}</span>
                    {parent && <span className="truncate text-sm text-muted">{parent}</span>}
                  </span>
                  <span className="num shrink-0 text-sm text-muted">{t('people', { n: countOf.get(g.id) ?? 0 })}</span>
                  <span className={`num inline-flex shrink-0 items-center gap-1 text-sm ${placesOf(g.id) > 0 ? 'text-primary' : 'text-faint'}`}>
                    <MapPin aria-hidden size={18} />
                    {placesOf(g.id)}
                  </span>
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </RowList>
        </div>
        <AddSheet id="branch" title={t('add')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('add')}</h2>
            <BranchAddForm sheet="branch" parents={tree.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name }))} />
          </Card>
        </AddSheet>
      </div>
      <Fab label={t('add')} items={[{ id: 'branch', label: t('add') }]} />
    </PageShell>
  );
}
