// 휴가 종류 관리 (의뢰인 2026-10-10: 시프티의 휴가 유형처럼 시간 단위로. "10시 반차 · 11시 반차 · 4시간 반차 등 상세히 구분").
// 한 줄 = 이름 · 시간 · 정해진 시각 · 유급/차감. 묶음 이름이 같은 것끼리 모아 보인다. 지우지 않고 꺼 둔다.
import { ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { Card, Chip, PageShell } from '@/components/ui';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { LeaveTypeForm } from './TypeForms';

export default async function LeaveTypesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [t, tl, f, sp] = await Promise.all([getTranslations('admin.leaveTypes'), getTranslations('leave'), getFormatter(), searchParams]);
  const off = sp.tab === 'off';
  const all = await loadAllLeaveTypes();
  const shown = all.filter((x) => x.active !== off && (x.active || !x.name.startsWith('e2e-')));
  const groupNames = [...new Set(all.map((x) => x.groupName).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b));
  const sections = [...groupNames.map((g) => ({ g, rows: shown.filter((x) => x.groupName === g) })), { g: null, rows: shown.filter((x) => !x.groupName) }].filter((s) => s.rows.length);
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center border-b-2 text-sm font-bold ${on ? 'border-text text-text' : 'border-transparent text-muted'}`;
  const num = (v: number) => f.number(v, { maximumFractionDigits: 4 });

  return (
    <PageShell wide>
      <Link href="/admin/leave" className="inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('back')}
      </Link>
      <div className="flex flex-wrap items-center gap-x-1 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <Help>{t('intro')}</Help>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <nav aria-label={t('title')} className="flex rounded-card bg-bg px-2">
            <Link href="/admin/leave/types" aria-current={!off ? 'page' : undefined} className={tab(!off)}>
              {t('tabOn')}
            </Link>
            <Link href="/admin/leave/types?tab=off" aria-current={off ? 'page' : undefined} className={tab(off)}>
              {t('tabOff')}
            </Link>
          </nav>
          {shown.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(off ? 'emptyOff' : 'empty')}</p>}
          {sections.map((s) => (
            <section key={s.g ?? ''} className="flex flex-col gap-2">
              <h2 className="px-1 text-sm font-medium text-muted">{s.g ?? t('noGroup')}</h2>
              <RowList>
                {s.rows.map((x) => (
                  <li key={x.code}>
                    <Link href={`/admin/leave/types/${x.code}`} className="flex min-h-16 items-center gap-3 px-5 py-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-bold">{leaveTypeName(all, x.code, tl)}</span>
                        <span className="num text-sm text-muted">
                          {t('hoursShort', { h: num(x.hours ?? 0) })}
                          {x.startTime && ` · ${x.startTime} - ${x.endTime}`}
                          {' · '}
                          {x.deductsBalance ? t('deductShort', { d: num(x.dayUnit) }) : t('noDeduct')}
                        </span>
                      </span>
                      <Chip tone={x.isPaid ? 'ok' : 'neutral'}>{t(x.isPaid ? 'paidChip' : 'unpaidChip')}</Chip>
                      <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </RowList>
            </section>
          ))}
        </div>
        <AddSheet id="leave-type" title={t('add')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('add')}</h2>
            <LeaveTypeForm sheet="leave-type" groups={groupNames} />
          </Card>
        </AddSheet>
      </div>
      <Fab label={t('add')} items={[{ id: 'leave-type', label: t('add') }]} />
    </PageShell>
  );
}
