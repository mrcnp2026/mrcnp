// 출퇴근 장소 상세 (의뢰인 2026-10-10: 시프티의 「출퇴근 장소」 화면처럼) — 장소명 · 주소 · 수단 · 반경 · 지도(핀 + 반경 원).
// 고치기는 오른쪽 위 「수정」(폰) 또는 옆 양식(PC). 어느 지점이 이 장소를 쓰는지도 보인다.
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { OpenSheetButton } from '@/components/Fab';
import { Field, FieldList, RowList } from '@/components/list';
import { PlaceMap } from '@/components/PlaceMap';
import { DetailBar } from '@/components/detail';
import { TwoPane } from '@/components/settings';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { ConfirmButton, NetworkForm } from '@/app/admin/settings/SettingsForms';
import { loadGroupLocationLinks, loadOfficeLocations } from '@/lib/geo-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { isOfficeIp, parseCidr, traceClientIp } from '@/lib/verify-location';
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
  // 이 장소의 인터넷 주소(고정 IP · 와이파이) — 2026-10-23 의뢰인: 지점마다 다르니 장소에 묶는다
  const ts = await getTranslations('admin.settings');
  const { data: nets } = await createAdminClient().from('office_networks').select('id, cidr, label, active').eq('location_id', id).order('created_at');
  const trace = traceClientIp(await headers(), OFFICE.ipHeaderOrder);
  const here = isOfficeIp(trace.ip, (nets ?? []).filter((n) => n.active).map((n) => String(n.cidr)).filter((c) => parseCidr(c)));
  const labels = { zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), credit: t('mapCredit'), map: t('map') };

  const tf = await getTranslations('frame');
  const editKey = `${p.lat},${p.lng},${p.radiusM},${p.label},${p.address},${p.anywhere}`;
  const initial = { id: p.id, label: p.label ?? '', address: p.address ?? '', lat: p.lat, lng: p.lng, radiusM: p.radiusM, anywhere: p.anywhere };
  const branchList = (
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
  );
  const networkList = (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-medium text-muted">{t('networkTitle')}</h2>
      <p className="px-1 text-sm text-muted">{t('networkHint')}</p>
      <ul className="divide-y divide-border rounded-card border border-border bg-bg px-4">
        {(nets ?? []).length === 0 && <li className="py-4 text-sm text-faint">{t('networkNone')}</li>}
        {(nets ?? []).map((n) => (
          <li key={n.id} className={`flex min-h-12 items-center gap-2 ${n.active ? '' : 'opacity-60'}`}>
            <span className="min-w-0 flex-1">
              <span className="num block truncate text-sm">{String(n.cidr)}</span>
              {n.label && <span className="block truncate text-xs text-muted">{n.label}</span>}
            </span>
            {!n.active && <Chip>{ts('off')}</Chip>}
            <ConfirmButton
              body={{ action: 'network.toggle', id: n.id, active: !n.active }}
              label={n.active ? ts('turnOff') : ts('turnOn')}
              confirmLabel={n.active ? ts('turnOffConfirm') : ts('turnOn')}
              ariaLabel={n.active ? ts('turnOffOf', { what: String(n.cidr) }) : ts('turnOnOf', { what: String(n.cidr) })}
            />
          </li>
        ))}
      </ul>
      <NetworkForm currentIp={trace.ip} currentKnown={here} locationId={id} />
    </section>
  );
  return (
    <PageShell wide>
      <TwoPane
        showOff
        title={tf('item.places')}
        current={`/admin/places/${id}`}
        action={{ id: 'place', href: '/admin/places?new=1', label: t('add') }}
        items={all.filter((l) => l.active || l.id === id || !l.label?.startsWith('e2e-')).map((l) => ({ href: `/admin/places/${l.id}`, label: l.label ?? t('unnamed'), sub: l.address, off: !l.active }))}
      >
        {/* PC (2026-10-22, 다우오피스 「근무지 설정」처럼): 왼쪽 목록에서 고르면 오른쪽에서 바로 고친다 — 보기 화면 · 수정 팝업을 따로 두지 않는다 */}
        <div className="hidden flex-col gap-4 lg:flex">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{p.label ?? t('unnamed')}</h1>
            {!p.active && <Chip>{t('offChip')}</Chip>}
            <span className="ml-auto">
              <PlaceToggle id={p.id} active={p.active} />
            </span>
          </div>
          <Card className="p-6">
            <PlaceForm key={editKey} initial={initial} />
          </Card>
          {networkList}
          {branchList}
        </div>
        {/* 폰: 보기 + 「수정」 팝업 (예전처럼) */}
        <div className="flex flex-col gap-3 lg:hidden">
          <DetailBar plain back={p.active ? '/admin/places' : '/admin/places?tab=off'} backLabel={tc('back')} title={t('title')} extra={<OpenSheetButton sheet="place-edit">{t('edit')}</OpenSheetButton>} />
          <div className="flex flex-wrap items-center gap-2 px-1">
            <h1 className="text-2xl font-extrabold tracking-tight">{p.label ?? t('unnamed')}</h1>
            {!p.active && <Chip>{t('offChip')}</Chip>}
          </div>
          <FieldList>
            <Field label={t('name')}>{p.label ?? t('unnamed')}</Field>
            <Field label={t('address')}>{p.address ?? t('noAddress')}</Field>
            <Field label={t('radius')}>
              <span className="num">{p.anywhere ? t('radiusAny') : t('radiusM', { n: p.radiusM })}</span>
            </Field>
          </FieldList>
          <PlaceMap lat={p.lat} lng={p.lng} radiusM={p.radiusM} labels={labels} />
          {networkList}
          {branchList}
          <PlaceToggle id={p.id} active={p.active} />
        </div>
        <AddSheet id="place-edit" title={t('edit')} modal>
          <Card className="flex flex-col gap-3">
            <PlaceForm key={editKey} sheet="place-edit" initial={initial} />
          </Card>
        </AddSheet>
      </TwoPane>
    </PageShell>
  );
}
