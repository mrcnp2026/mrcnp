// 출퇴근 장소 관리 (의뢰인 2026-10-10: 시프티 화면 기준) — 공장·거래처·외근지를 좌표 + 반경으로 등록한다.
// 목록이 먼저, 새 장소는 + 버튼 뒤 (폰). 꺼 둔 장소는 「꺼 둔 장소」 탭. 지우지 않는다 — 예전 기록이 그 장소를 가리킨다.
import { ChevronRight, MapPin, Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { DetailBar } from '@/components/detail';
import { Fab } from '@/components/Fab';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { Card, PageShell } from '@/components/ui';
import { loadGroupLocationLinks, loadOfficeLocations } from '@/lib/geo-data';
import { PlaceForm } from './PlaceForm';

export default async function PlacesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; new?: string }> }) {
  const t = await getTranslations('admin.places');
  const tc = await getTranslations('common');
  const sp = await searchParams;
  const off = sp.tab === 'off';
  const q = (sp.q ?? '').trim().toLowerCase();
  const [all, links] = await Promise.all([loadOfficeLocations(true), loadGroupLocationLinks()]);
  // 검사 스크립트가 만든 장소(e2e-…)는 꺼 둔 목록에 보이지 않게 (검사 계정과 같은 규칙)
  const shown = all
    .filter((l) => l.active !== off && (l.active || !l.label?.startsWith('e2e-')))
    .filter((l) => !q || `${l.label ?? ''} ${l.address ?? ''}`.toLowerCase().includes(q));
  const used = (id: string) => links.filter((k) => k.locationId === id).length;
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center border-b-2 text-sm font-bold ${on ? 'border-text text-text' : 'border-transparent text-muted'}`;

  return (
    <PageShell wide>
      <DetailBar back="/punch" backLabel={tc('back')} title={t('title')} extra={<Help>{t('intro')}</Help>} />
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <nav aria-label={t('title')} className="-mx-4 -mt-3 flex border-b border-border bg-bg px-2 lg:mx-0 lg:mt-0 lg:rounded-card lg:border-0">
            <Link href="/admin/places" aria-current={!off ? 'page' : undefined} className={tab(!off)}>
              {t('tabOn')}
            </Link>
            <Link href="/admin/places?tab=off" aria-current={off ? 'page' : undefined} className={tab(off)}>
              {t('tabOff')}
            </Link>
          </nav>
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
                  <span className="num shrink-0 text-sm text-muted">{t('radiusM', { n: l.radiusM })}</span>
                  {used(l.id) > 0 && <span className="num shrink-0 text-sm text-faint">{t('usedBy', { n: used(l.id) })}</span>}
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </RowList>
        </div>
        <AddSheet id="place" title={t('add')} defaultOpen={sp.new === '1'} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('add')}</h2>
            <PlaceForm sheet="place" />
          </Card>
        </AddSheet>
      </div>
      <Fab label={t('add')} items={[{ id: 'place', label: t('add') }]} />
    </PageShell>
  );
}
