// 출퇴근 장소 관리 (의뢰인 2026-10-10: 시프티 화면 기준) — 공장·거래처·외근지를 좌표 + 반경으로 등록한다.
// 목록이 먼저, 새 장소는 + 버튼 뒤 (폰). 꺼 둔 장소는 「꺼 둔 장소」 탭. 지우지 않는다 — 예전 기록이 그 장소를 가리킨다.
import { ChevronRight, MapPin, Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { OffToggle } from '@/components/OffToggle';
import { TwoPane } from '@/components/settings';
import { isPhoneUserAgent } from '@/lib/passkey';
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
  // PC (2026-10-22): 목록 + 바로 고치기 한 화면 — 장소가 있으면 첫 장소로 들어간다. 「+ 추가」(?new=1)면 오른쪽 칸에 새 장소 양식
  const phone = isPhoneUserAgent((await headers()).get('user-agent'));
  if (!phone && sp.new !== '1' && !q && shown[0]) redirect(`/admin/places/${shown[0].id}`);
  const tf = await getTranslations('frame');

  return (
    <PageShell wide>
      <div className="lg:hidden">
      <DetailBar sheet={{ id: 'place', label: t('add'), mobile: tc('addShort') }} back="/admin/console" backLabel={tc('back')} menuLabel={ts('menu')} title={t('title')} extra={<Help>{t('intro')}</Help>} desc={t('intro')} />
      </div>
      <div className="grid grid-cols-1 items-start gap-3">
        {/* PC: 시프티의 목록 — 「비활성화된 … 보기」 토글 + 열마다 검색 · 정렬이 되는 표 (2026-10-11 의뢰인 스샷). 폰은 아래의 탭 + 줄 목록 */}
        <div className="hidden lg:block">
          <TwoPane showOff title={tf('item.places')} current="" action={{ id: 'place', href: '/admin/places?new=1', label: t('add') }} items={all.filter((l) => l.active || !l.label?.startsWith('e2e-')).map((l) => ({ href: `/admin/places/${l.id}`, label: l.label ?? t('unnamed'), sub: l.address, off: !l.active }))}>
            <h1 className="text-2xl font-bold tracking-tight">{t('add')}</h1>
            <Card className="p-6">
              <PlaceForm />
            </Card>
          </TwoPane>
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
        <AddSheet id="place" title={t('add')} defaultOpen={phone && sp.new === '1'} modal>
          <Card className="flex flex-col gap-3">
            <PlaceForm sheet="place" />
          </Card>
        </AddSheet>
      </div>
    </PageShell>
  );
}
