// 출퇴근 장소 관리 (의뢰인 2026-10-10: 시프티 화면 기준) — 공장·거래처·외근지를 좌표 + 반경으로 등록한다.
// 목록이 먼저, 새 장소는 + 버튼 뒤 (폰). 꺼 둔 장소는 「꺼 둔 장소」 탭. 지우지 않는다 — 예전 기록이 그 장소를 가리킨다.
import { ChevronRight, MapPin, Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { OffToggle } from '@/components/OffToggle';
import { PcTable } from '@/components/PcTable';
import { DetailBar } from '@/components/detail';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { Card, PageShell } from '@/components/ui';
import { loadGroupLocationLinks, loadOfficeLocations } from '@/lib/geo-data';
import { PlaceForm } from './PlaceForm';

export default async function PlacesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; new?: string }> }) {
  const t = await getTranslations('admin.places');
  const tc = await getTranslations('common');
  const ts = await getTranslations('side');
  const sp = await searchParams;
  const off = sp.tab === 'off';
  const q = (sp.q ?? '').trim().toLowerCase();
  const [all, links] = await Promise.all([loadOfficeLocations(true), loadGroupLocationLinks()]);
  // 검사 스크립트가 만든 장소(e2e-…)는 꺼 둔 목록에 보이지 않게 (검사 계정과 같은 규칙)
  const shown = all
    .filter((l) => l.active !== off && (l.active || !l.label?.startsWith('e2e-')))
    .filter((l) => !q || `${l.label ?? ''} ${l.address ?? ''}`.toLowerCase().includes(q));
  const used = (id: string) => links.filter((k) => k.locationId === id).length;

  return (
    <PageShell wide>
      <DetailBar sheet={{ id: 'place', label: t('add'), mobile: tc('addShort') }} back="/admin/console" backLabel={tc('back')} menuLabel={ts('menu')} title={t('title')} extra={<Help>{t('intro')}</Help>} desc={t('intro')} />
      <div className="grid grid-cols-1 items-start gap-3">
        {/* PC: 시프티의 목록 — 「비활성화된 … 보기」 토글 + 열마다 검색 · 정렬이 되는 표 (2026-10-11 의뢰인 스샷). 폰은 아래의 탭 + 줄 목록 */}
        <div className="hidden flex-col gap-3 lg:flex">
          <OffToggle href={off ? '/admin/places' : '/admin/places?tab=off'} on={off} label={t('showOff')} />
          <PcTable
            labels={{ search: tc('colSearch'), empty: t(off ? 'emptyOff' : 'empty') }}
            cols={[{ key: 'name', label: t('colName') }, { key: 'address', label: t('colAddress') }, { key: 'radius', label: t('colRadius'), align: 'right' }, { key: 'used', label: t('colUsed'), align: 'right' }]}
            rows={shown.map((l) => ({
              id: l.id,
              cells: {
                name: { text: l.label ?? t('unnamed'), node: <Link href={`/admin/places/${l.id}`} className="font-bold hover:text-primary">{l.label ?? t('unnamed')}</Link> },
                // 주소는 한 줄로 줄여 「…」 — 전체 주소는 마우스를 올리면 보인다 (2026-10-17 의뢰인)
                address: { text: l.address ?? '', node: <span title={l.address ?? ''} className="block max-w-88 truncate">{l.address ?? ''}</span> },
                radius: { text: l.anywhere ? t('radiusAny') : t('radiusM', { n: l.radiusM }) },
                used: { text: String(used(l.id)) },
              },
            }))}
          />
        </div>
        <div className="flex flex-col gap-3 lg:hidden">
          {/* 폰도 PC와 같은 「꺼 둔 것 보기」 토글 (2026-10-17 의뢰인: PC · 폰 작동 방식을 같게) */}
          <OffToggle href={off ? '/admin/places' : '/admin/places?tab=off'} on={off} label={t('showOff')} />
          <form method="get" className="flex items-center gap-2 rounded-card bg-bg px-4">
            {off && <input type="hidden" name="tab" value="off" />}
            <Search aria-hidden size={20} className="shrink-0 text-muted" />
            <input name="q" defaultValue={sp.q ?? ''} placeholder={t('search')} aria-label={t('search')} className="min-h-12 w-full bg-transparent text-base outline-none" autoComplete="off" />
          </form>
          {shown.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(q ? 'noMatch' : off ? 'emptyOff' : 'empty')}</p>}
          <RowList>
            {shown.map((l) => (
              <li key={l.id}>
                <Link href={`/admin/places/${l.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <MapPin aria-hidden size={22} className="shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">{l.label ?? t('unnamed')}</span>
                    <span className="truncate text-sm text-muted">{l.address ?? t('noAddress')}</span>
                  </span>
                  {/* 반경 · 쓰는 지점은 오른쪽에 두 줄로 좁게 — 주소 칸이 넓어진다 */}
                  <span className="num flex shrink-0 flex-col items-end text-xs text-muted">
                    <span>{l.anywhere ? t('radiusAny') : t('radiusM', { n: l.radiusM })}</span>
                    {used(l.id) > 0 && <span className="text-faint">{t('usedBy', { n: used(l.id) })}</span>}
                  </span>
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </RowList>
        </div>
        <AddSheet id="place" title={t('add')} defaultOpen={sp.new === '1'} modal>
          <Card className="flex flex-col gap-3">
            <PlaceForm sheet="place" />
          </Card>
        </AddSheet>
      </div>
    </PageShell>
  );
}
