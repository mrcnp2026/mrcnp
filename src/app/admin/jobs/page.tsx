// 직무 관리 (의뢰인 2026-10-10: 시프티의 「직무 관리」처럼) — 색 · 이름 · 인원. 활성/비활성 탭.
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { Card, PageShell } from '@/components/ui';
import { loadJobs } from '@/lib/job-data';
import { SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { JobForm } from './JobForms';

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getTranslations('admin.jobs');
  const sp = await searchParams;
  const off = sp.tab === 'off';
  const [all, { data: people }] = await Promise.all([loadJobs(), createAdminClient().from('profiles').select('job_id, employee_no').eq('active', true)]);
  const countOf = new Map<string, number>();
  let none = 0;
  for (const p of people ?? []) {
    if (p.job_id) countOf.set(p.job_id, (countOf.get(p.job_id) ?? 0) + 1);
    else if (!p.employee_no?.startsWith('e2e-')) none++;
  }
  const shown = all.filter((x) => x.active !== off && (x.active || !x.name.startsWith('e2e-')));
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center border-b-2 text-sm font-bold ${on ? 'border-text text-text' : 'border-transparent text-muted'}`;

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-center gap-x-1 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <Help>{t('intro')}</Help>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <nav aria-label={t('title')} className="flex rounded-card bg-bg px-2">
            <Link href="/admin/jobs" aria-current={!off ? 'page' : undefined} className={tab(!off)}>
              {t('tabOn')}
            </Link>
            <Link href="/admin/jobs?tab=off" aria-current={off ? 'page' : undefined} className={tab(off)}>
              {t('tabOff')}
            </Link>
          </nav>
          {!off && none > 0 && <p className="num rounded-card bg-bg p-5 text-sm text-muted">{t('noneCount', { n: none })}</p>}
          {shown.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(off ? 'emptyOff' : 'empty')}</p>}
          <RowList>
            {shown.map((x) => (
              <li key={x.id}>
                <Link href={`/admin/jobs/${x.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3">
                  <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-chip ${SHIFT_COLOR_CLASS[x.color]}`} />
                  <span className="min-w-0 flex-1 font-bold">{x.name}</span>
                  <span className="num shrink-0 text-sm text-muted">{t('people', { n: countOf.get(x.id) ?? 0 })}</span>
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </RowList>
        </div>
        <AddSheet id="job" title={t('add')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('add')}</h2>
            <JobForm sheet="job" />
          </Card>
        </AddSheet>
      </div>
      <Fab label={t('add')} items={[{ id: 'job', label: t('add') }]} />
    </PageShell>
  );
}
