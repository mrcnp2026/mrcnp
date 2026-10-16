// 지점 관리 (의뢰인 2026-10-10: 시프티 화면 기준) — 공장·부서를 한 줄씩. 누르면 지점 상세(출퇴근 장소·메모·직원 수).
// 지점은 조직도와 같은 표(org_groups, 지점 › 하위 지점 2단계)다. 그림으로 보는 조직도는 아래 링크로 남겼다.
import { ChevronRight, MapPin, Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { OffToggle } from '@/components/OffToggle';
import { PcTable } from '@/components/PcTable';
import { DetailBar } from '@/components/detail';
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
  const tc = await getTranslations('common');
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
  const tab = (on: boolean) => `flex min-h-11 flex-1 lg:flex-none lg:px-4 items-center justify-center border-b-2 text-sm font-bold ${on ? 'border-text text-text lg:border-primary lg:text-primary' : 'border-transparent text-muted hover:text-text'}`;

  return (
    <PageShell wide>
      <DetailBar sheet={{ id: 'branch', label: t('add') }} back="/punch" backLabel={tc('back')} title={t('title')} extra={<Help>{t('intro')}</Help>} desc={t('intro')} action={{ href: '/admin/members/groups', label: t('diagram') }} />
      <div className="grid items-start gap-3">
        {/* PC: 시프티의 목록 — 「비활성화된 … 보기」 토글 + 열마다 검색 · 정렬이 되는 표 (2026-10-11 의뢰인 스샷). 폰은 아래의 탭 + 줄 목록 */}
        <div className="hidden flex-col gap-3 lg:flex">
          <OffToggle href={off ? '/admin/branches' : '/admin/branches?tab=off'} on={off} label={t('showOff')} />
          <PcTable
            labels={{ search: tc('colSearch'), empty: t(off ? 'emptyOff' : 'empty') }}
            cols={[{ key: 'name', label: t('colName') }, { key: 'parent', label: t('colParent') }, { key: 'people', label: t('colPeople'), align: 'right' }, { key: 'places', label: t('colPlaces'), align: 'right' }]}
            rows={rows.map(({ g, parent }) => ({
              id: g.id,
              cells: {
                name: { text: g.name, node: <Link href={`/admin/branches/${g.id}`} className="font-bold hover:text-primary">{g.name}</Link> },
                parent: { text: parent ?? '' },
                people: { text: String(countOf.get(g.id) ?? 0) },
                places: { text: String(placesOf(g.id)) },
              },
            }))}
          />
        </div>
        <div className="flex flex-col gap-3 lg:hidden">
          <nav aria-label={t('title')} className="-mx-4 -mt-3 flex border-b border-border bg-bg px-2 lg:mx-0 lg:mt-0 lg:rounded-card lg:border-0">
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
        <AddSheet id="branch" title={t('add')} modal>
          <Card className="flex flex-col gap-3">
            <BranchAddForm sheet="branch" parents={tree.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name }))} />
          </Card>
        </AddSheet>
      </div>
      <Fab label={t('add')} items={[{ id: 'branch', label: t('add') }]} />
    </PageShell>
  );
}
