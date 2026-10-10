// 지점 상세 (의뢰인 2026-10-10: 시프티의 「지점」 화면처럼) — 지점명 · 상위 지점 · 이 지점의 출퇴근 장소 · 메모.
// 이 지점 직원은 여기 붙인 장소에서 찍어야 확인된다. 하나도 안 붙이면 켜진 장소 전체를 쓴다.
import { ChevronRight, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { OpenSheetButton } from '@/components/Fab';
import { Field, FieldList, RowList } from '@/components/list';
import { Card, Chip, PageShell } from '@/components/ui';
import { loadGroupLocationLinks, loadOfficeLocations } from '@/lib/geo-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { BranchEditForm } from '../BranchForms';

export default async function BranchPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('admin.branches');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const { data: g } = await db.from('org_groups').select('id, name, parent_id, memo, active').eq('id', id).maybeSingle();
  if (!g) notFound();
  const [locations, links, { data: parent }, { count }] = await Promise.all([
    loadOfficeLocations(true),
    loadGroupLocationLinks(),
    g.parent_id ? db.from('org_groups').select('id, name').eq('id', g.parent_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('group_id', id).eq('active', true),
  ]);
  const picked = links.filter((k) => k.groupId === id).map((k) => k.locationId);
  const mine = locations.filter((l) => picked.includes(l.id));
  const choices = locations.filter((l) => l.active || picked.includes(l.id)).map((l) => ({ id: l.id, label: l.label ?? t('unnamedPlace'), address: l.address ?? null }));

  return (
    <PageShell wide>
      <div className="flex items-center justify-between gap-2">
        <Link href={g.active ? '/admin/branches' : '/admin/branches?tab=off'} className="inline-flex min-h-11 items-center text-sm font-medium text-muted">
          ‹ {t('title')}
        </Link>
        <OpenSheetButton sheet="branch-edit">{t('edit')}</OpenSheetButton>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{g.name}</h1>
        {!g.active && <Chip>{t('offChip')}</Chip>}
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <FieldList>
            <Field label={t('name')}>{g.name}</Field>
            <Field label={t('parent')}>{parent ? <Link href={`/admin/branches/${parent.id}`}>{parent.name}</Link> : t('parentNone')}</Field>
            <Field label={t('staff')}>
              <Link href="/admin/members" className="num">
                {t('people', { n: count ?? 0 })}
              </Link>
            </Field>
          </FieldList>
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-medium text-muted">{t('places')}</h2>
            {mine.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-muted">{t('placesAll')}</p>}
            <RowList>
              {mine.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/places/${l.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3">
                    <MapPin aria-hidden size={22} className={`shrink-0 ${l.active ? 'text-primary' : 'text-faint'}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{l.label ?? t('unnamedPlace')}</span>
                      {l.address && <span className="truncate text-sm text-muted">{l.address}</span>}
                    </span>
                    {!l.active && <Chip>{t('placeOff')}</Chip>}
                    <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </RowList>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-medium text-muted">{t('memo')}</h2>
            <p className="min-h-14 rounded-card bg-bg p-5 whitespace-pre-wrap">{g.memo ?? <span className="text-sm text-faint">{t('memoNone')}</span>}</p>
          </section>
        </div>
        <AddSheet id="branch-edit" title={t('edit')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('edit')}</h2>
            <BranchEditForm key={`${g.name}|${g.memo}|${g.active}|${picked.join()}`} sheet="branch-edit" id={g.id} name={g.name} memo={g.memo ?? ''} active={g.active} places={choices} picked={picked} />
          </Card>
        </AddSheet>
      </div>
    </PageShell>
  );
}
