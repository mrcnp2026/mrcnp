// 직무 상세 — 이름 · 색 고치기 + 이 직무인 직원 고르기 + 끄기/켜기.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { OpenSheetButton } from '@/components/Fab';
import { Card, Chip, PageShell } from '@/components/ui';
import { loadJobs } from '@/lib/job-data';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { JobAssignForm, JobForm, JobToggle } from '../JobForms';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('admin.jobs');
  const { id } = await params;
  const [all, groups, { data: ppl }] = await Promise.all([loadJobs(), loadOrgGroups(), createAdminClient().from('profiles').select('id, name, employee_no, group_id, job_id').eq('active', true).order('name')]);
  const x = all.find((j) => j.id === id);
  if (!x) notFound();
  const nameOf = new Map(all.map((j) => [j.id, j.name]));
  // 검사 전용 계정(e2e-…)은 고르는 목록에 보이지 않게 — 이미 이 직무이면 보인다
  const people = (ppl ?? [])
    .filter((p) => !p.employee_no?.startsWith('e2e-') || p.job_id === id)
    .map((p) => ({ id: p.id as string, name: p.name as string, group: groupPath(groups, p.group_id), other: p.job_id && p.job_id !== id ? (nameOf.get(p.job_id) ?? null) : null, on: p.job_id === id }));

  return (
    <PageShell wide>
      <div className="flex items-center justify-between gap-2">
        <Link href={x.active ? '/admin/jobs' : '/admin/jobs?tab=off'} className="inline-flex min-h-11 items-center text-sm font-medium text-muted">
          ‹ {t('title')}
        </Link>
        <OpenSheetButton sheet="job-edit">{t('edit')}</OpenSheetButton>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span aria-hidden className={`size-7 shrink-0 rounded-button ${SHIFT_COLOR_CLASS[x.color]}`} />
        <h1 className="text-2xl font-extrabold tracking-tight">{x.name}</h1>
        {!x.active && <Chip>{t('offChip')}</Chip>}
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-medium text-muted">{t('assignTitle')}</h2>
            <Card className="flex flex-col gap-3">
              {x.active ? <JobAssignForm key={people.map((p) => `${p.id}${p.on}`).join()} id={x.id} people={people} /> : <p className="text-sm text-muted">{t('assignOff')}</p>}
            </Card>
          </section>
          <JobToggle id={x.id} active={x.active} />
        </div>
        <AddSheet id="job-edit" title={t('edit')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('edit')}</h2>
            <JobForm key={`${x.name}|${x.color}`} sheet="job-edit" initial={{ id: x.id, name: x.name, color: x.color }} />
          </Card>
        </AddSheet>
      </div>
    </PageShell>
  );
}
