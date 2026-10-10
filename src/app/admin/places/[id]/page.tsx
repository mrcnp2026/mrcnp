// 출퇴근 장소 상세 (의뢰인 2026-10-10: 시프티의 「출퇴근 장소」 화면처럼) — 장소명 · 주소 · 수단 · 반경 · 지도(핀 + 반경 원).
// 고치기는 오른쪽 위 「수정」(폰) 또는 옆 양식(PC). 어느 지점이 이 장소를 쓰는지도 보인다.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { OpenSheetButton } from '@/components/Fab';
import { Field, FieldList, RowList } from '@/components/list';
import { PlaceMap } from '@/components/PlaceMap';
import { DetailBar } from '@/components/detail';
import { Card, Chip, PageShell } from '@/components/ui';
import { loadGroupLocationLinks, loadOfficeLocations } from '@/lib/geo-data';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { PlaceForm, PlaceToggle } from '../PlaceForm';

export default async function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('admin.places');
  const tc = await getTranslations('common');
  const { id } = await params;
  const [all, links, groups] = await Promise.all([loadOfficeLocations(true), loadGroupLocationLinks(), loadOrgGroups()]);
  const p = all.find((l) => l.id === id);
  if (!p) notFound();
  const branches = links.filter((k) => k.locationId === id).map((k) => ({ id: k.groupId, path: groupPath(groups, k.groupId) })).filter((b) => b.path);
  const labels = { zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), credit: t('mapCredit'), map: t('map') };

  return (
    <PageShell wide>
      <DetailBar plain back={p.active ? '/admin/places' : '/admin/places?tab=off'} backLabel={tc('back')} title={t('title')} extra={<OpenSheetButton sheet="place-edit">{t('edit')}</OpenSheetButton>} />
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{p.label ?? t('unnamed')}</h1>
        {!p.active && <Chip>{t('offChip')}</Chip>}
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <FieldList>
            <Field label={t('name')}>{p.label ?? t('unnamed')}</Field>
            <Field label={t('address')}>{p.address ?? t('noAddress')}</Field>
            <Field label={t('method')}>{t('methodCoords')}</Field>
            <Field label={t('radius')}>
              <span className="num">{t('radiusM', { n: p.radiusM })}</span>
            </Field>
            <Field label={t('coords')}>
              <span className="num">
                {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
              </span>
            </Field>
          </FieldList>
          <PlaceMap lat={p.lat} lng={p.lng} radiusM={p.radiusM} labels={labels} />
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-medium text-muted">{t('branches')}</h2>
            {branches.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('branchesNone')}</p>}
            <RowList>
              {branches.map((b) => (
                <li key={b.id}>
                  <Link href={`/admin/branches/${b.id}`} className="flex min-h-14 items-center px-5 font-bold">
                    {b.path}
                  </Link>
                </li>
              ))}
            </RowList>
          </section>
          <PlaceToggle id={p.id} active={p.active} />
        </div>
        <AddSheet id="place-edit" title={t('edit')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('edit')}</h2>
            <PlaceForm key={`${p.lat},${p.lng},${p.radiusM},${p.label},${p.address}`} sheet="place-edit" initial={{ id: p.id, label: p.label ?? '', address: p.address ?? '', lat: p.lat, lng: p.lng, radiusM: p.radiusM }} />
          </Card>
        </AddSheet>
      </div>
    </PageShell>
  );
}
