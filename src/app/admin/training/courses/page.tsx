// 교육 종류 — 주기 · 시간 · 대상 · 서명 그림 받기 (묶음 33, 2026-10-20 의뢰인: 서명 그림은 종류마다 켜고 끄기). 관리자만.
// 법 기준은 박아 두지 않는다 — 처음 9가지는 「확인 필요」로 넣었고, 노무사 확인 뒤 고쳐서 「확인 필요」를 끈다.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadJobs } from '@/lib/job-data';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadCourses, trainingPeople } from '@/lib/training-data';
import { CourseForm } from '../TrainingForms';

export default async function TrainingCoursesPage() {
  const me = await getMe();
  if (!me || me.role !== 'admin') redirect('/punch');
  const t = await getTranslations('admin.training');
  const [courses, jobsRaw, groupsRaw, people] = await Promise.all([loadCourses(), loadJobs(), loadOrgGroups(), trainingPeople()]);
  const jobs = jobsRaw.filter((j) => j.active).map((j) => ({ id: j.id, label: j.name }));
  const groups = buildOrgTree(groupsRaw.filter((g) => g.active)).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const ppl = people.filter((p) => p.active).map((p) => ({ id: p.id, label: p.name }));
  const targetText = (c: (typeof courses)[number]) => {
    const n = (c.targets.jobIds?.length ?? 0) + (c.targets.groupIds?.length ?? 0) + (c.targets.employeeIds?.length ?? 0);
    return n ? t('targetsSome', { n }) : t('targetsAll');
  };
  return (
    <PageShell wide>
      <Link href="/admin/training" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">‹ {t('title')}</Link>
      <h1 className="text-2xl font-bold">{t('coursesTitle')}</h1>
      <p className="text-sm text-faint">{t('coursesIntro')}</p>
      <Card className="flex flex-col gap-1">
        <ul className="flex flex-col divide-y divide-border">
          {courses.map((c) => (
            <li key={c.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className={`min-w-0 flex-1 font-bold ${c.active ? '' : 'text-faint'}`}>{c.name}</span>
                  <Chip tone="neutral">{t(`cycle.${c.cycle}`)}{c.hours ? ` · ${t('hoursValue', { n: c.hours })}` : ''}</Chip>
                  <span className="text-xs text-muted">{targetText(c)}</span>
                  {c.signatureRequired && <Chip tone="info">{t('signatureOn')}</Chip>}
                  {c.needsCheck && <Chip tone="warn">{t('needsCheck')}</Chip>}
                  {!c.active && <Chip tone="neutral">{t('off')}</Chip>}
                </summary>
                <div className="pt-3">
                  <CourseForm initial={c} jobs={jobs} groups={groups} people={ppl} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-3">
        <CardTitle>{t('addCourseTitle')}</CardTitle>
        <CourseForm jobs={jobs} groups={groups} people={ppl} />
      </Card>
    </PageShell>
  );
}
