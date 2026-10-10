// 근무일정 틀 관리 (의뢰인 2026-10-10: 시프티의 「근무일정 템플릿 관리」처럼) — 색 · 이름 · [유형] 시각 · 적용 인원.
// 07:30·07:40·07:50 시작처럼 필요한 만큼 만들어 직원별로 적용한다. 틀이 없는 직원은 회사 근무규칙(회사 설정)의 시각을 쓴다.
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { DetailBar } from '@/components/detail';
import { Fab } from '@/components/Fab';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { Card, PageShell } from '@/components/ui';
import { loadActiveRule } from '@/lib/attendance-data';
import { loadShiftTemplates } from '@/lib/shift-data';
import { hhmm, SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { ShiftForm } from './ShiftForms';

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getTranslations('admin.shifts');
  const tc = await getTranslations('common');
  const sp = await searchParams;
  const off = sp.tab === 'off';
  const [all, { data: people }, rule] = await Promise.all([
    loadShiftTemplates(true),
    createAdminClient().from('profiles').select('shift_template_id').eq('active', true),
    loadActiveRule(),
  ]);
  const countOf = new Map<string, number>();
  let none = 0;
  for (const p of people ?? []) {
    if (p.shift_template_id) countOf.set(p.shift_template_id, (countOf.get(p.shift_template_id) ?? 0) + 1);
    else none++;
  }
  const shown = all.filter((x) => x.active !== off && (x.active || !x.name.startsWith('e2e-')));
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center border-b-2 text-sm font-bold ${on ? 'border-text text-text' : 'border-transparent text-muted'}`;

  return (
    <PageShell wide>
      <DetailBar back="/punch" backLabel={tc('back')} title={t('title')} extra={<Help>{t('intro')}</Help>} />
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <nav aria-label={t('title')} className="-mx-4 -mt-3 flex border-b border-border bg-bg px-2 lg:mx-0 lg:mt-0 lg:rounded-card lg:border-0">
            <Link href="/admin/shifts" aria-current={!off ? 'page' : undefined} className={tab(!off)}>
              {t('tabOn')}
            </Link>
            <Link href="/admin/shifts?tab=off" aria-current={off ? 'page' : undefined} className={tab(off)}>
              {t('tabOff')}
            </Link>
          </nav>
          {!off && (
            <p className="rounded-card bg-bg p-5 text-sm text-muted">
              {rule ? t('baseRule', { start: hhmm(rule.startTime), end: hhmm(rule.endTime), n: none }) : t('noRule')}{' '}
              <Link href="/admin/settings" className="font-bold text-primary">
                {t('toSettings')} ›
              </Link>
            </p>
          )}
          {shown.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(off ? 'emptyOff' : 'empty')}</p>}
          <RowList>
            {shown.map((x) => (
              <li key={x.id}>
                <Link href={`/admin/shifts/${x.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <span aria-hidden className={`size-8 shrink-0 rounded-button ${SHIFT_COLOR_CLASS[x.color]}`} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">{x.name}</span>
                    <span className="num text-sm text-muted">
                      {x.kind !== 'none' && `[${t(`kinds.${x.kind}`)}] `}
                      {x.startTime} - {x.endTime}
                    </span>
                  </span>
                  <span className="num shrink-0 text-sm text-muted">{t('people', { n: countOf.get(x.id) ?? 0 })}</span>
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </RowList>
        </div>
        <AddSheet id="shift" title={t('add')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('add')}</h2>
            <ShiftForm sheet="shift" />
          </Card>
        </AddSheet>
      </div>
      <Fab label={t('add')} items={[{ id: 'shift', label: t('add') }]} />
    </PageShell>
  );
}
