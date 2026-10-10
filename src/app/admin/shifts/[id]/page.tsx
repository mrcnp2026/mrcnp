// 근무일정 틀 상세 (의뢰인 2026-10-10: 시프티의 「근무일정 템플릿」 화면처럼) — 틀 이름 · 시간 · 유형 · 색 · 메모 + 이 틀을 적용할 직원.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { OpenSheetButton } from '@/components/Fab';
import { Field, FieldList } from '@/components/list';
import { Card, Chip, PageShell } from '@/components/ui';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadShiftTemplates } from '@/lib/shift-data';
import { SHIFT_COLOR_CLASS, spanMinutes } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { ShiftAssignForm, ShiftForm, ShiftToggle } from '../ShiftForms';

export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('admin.shifts');
  const { id } = await params;
  const [all, groups, { data: ppl }] = await Promise.all([
    loadShiftTemplates(true),
    loadOrgGroups(),
    createAdminClient().from('profiles').select('id, name, employee_no, group_id, shift_template_id').eq('active', true).order('name'),
  ]);
  const x = all.find((s) => s.id === id);
  if (!x) notFound();
  const nameOf = new Map(all.map((s) => [s.id, s.name]));
  // 검사 전용 계정(e2e-…)은 고르는 목록에 보이지 않게 — 이미 이 틀을 쓰고 있으면 보인다
  const people = (ppl ?? [])
    .filter((p) => !p.employee_no?.startsWith('e2e-') || p.shift_template_id === id)
    .map((p) => ({ id: p.id as string, name: p.name as string, group: groupPath(groups, p.group_id), other: p.shift_template_id && p.shift_template_id !== id ? (nameOf.get(p.shift_template_id) ?? null) : null, on: p.shift_template_id === id }));
  const span = spanMinutes(x);

  return (
    <PageShell wide>
      <div className="flex items-center justify-between gap-2">
        <Link href={x.active ? '/admin/shifts' : '/admin/shifts?tab=off'} className="inline-flex min-h-11 items-center text-sm font-medium text-muted">
          ‹ {t('title')}
        </Link>
        <OpenSheetButton sheet="shift-edit">{t('edit')}</OpenSheetButton>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span aria-hidden className={`size-7 shrink-0 rounded-button ${SHIFT_COLOR_CLASS[x.color]}`} />
        <h1 className="text-2xl font-extrabold tracking-tight">{x.name}</h1>
        {!x.active && <Chip>{t('offChip')}</Chip>}
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <FieldList>
            <Field label={t('name')}>{x.name}</Field>
            <Field label={t('time')}>
              <span className="num">
                {x.startTime} - {x.endTime}
              </span>
            </Field>
            <Field label={t('span')}>
              <span className="num">{t('spanHm', { h: Math.floor(span / 60), m: span % 60 })}</span>
            </Field>
            <Field label={t('kind')}>{t(`kinds.${x.kind}`)}</Field>
            <Field label={t('memo')}>{x.memo ?? t('memoNone')}</Field>
          </FieldList>
          {x.kind === 'deemed' && <p className="rounded-card bg-primary-tint p-5 text-sm text-primary">{t('deemedNote')}</p>}
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-medium text-muted">{t('assignTitle')}</h2>
            <Card className="flex flex-col gap-3">
              {x.active ? <ShiftAssignForm key={people.map((p) => `${p.id}${p.on}`).join()} id={x.id} people={people} /> : <p className="text-sm text-muted">{t('assignOff')}</p>}
            </Card>
          </section>
          <ShiftToggle id={x.id} active={x.active} />
        </div>
        <AddSheet id="shift-edit" title={t('edit')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('edit')}</h2>
            <ShiftForm key={`${x.name}|${x.startTime}|${x.endTime}|${x.kind}|${x.color}|${x.memo}`} sheet="shift-edit" initial={{ id: x.id, name: x.name, startTime: x.startTime, endTime: x.endTime, kind: x.kind, color: x.color, memo: x.memo ?? '' }} />
          </Card>
        </AddSheet>
      </div>
    </PageShell>
  );
}
