// 근무일정 한 건의 상세 (2026-10-11 의뢰인: 시프티의 근무일정 상세처럼) — 큰 시각 + 유형 배지 · 날짜 · 근무/휴게 → 「항목 — 값」 줄.
// [수정](2026-10-11): 날짜별로 넣은 일정은 그 일정의 시각·유형·일정노트를 고치고, 평소 일정(템플릿·회사 규칙)은 「이 날만 다르게」 날짜별 일정을 새로 넣는다. 취소는 목록의 ✕.
// 휴게는 그날 규칙의 휴게시간대와 일정이 겹친 만큼이다 (잔업 일정은 휴게 없음).
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DetailBar, Field, FieldList } from '@/components/detail';
import { Card, Chip, PageShell } from '@/components/ui';
import { loadJobs } from '@/lib/job-data';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, loadPeriod } from '@/lib/period-data';
import { spanMinutes } from '@/lib/shifts';
import { kstDateTime } from '@/lib/time';
import { ShiftEdit } from './ShiftEdit';

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export default async function ScheduleDetailPage({ params, searchParams }: { params: Promise<{ id: string; date: string }>; searchParams: Promise<{ i?: string; edit?: string }> }) {
  const [t, tk, tr, f, { id, date }, sp] = await Promise.all([getTranslations('admin.scheduleDetail'), getTranslations('admin.shifts.kinds'), getTranslations('records'), getFormatter(), params, searchParams]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) notFound();
  const [data, groups, jobs] = await Promise.all([loadPeriod(date, date), loadOrgGroups(), loadJobs()]);
  const person = data.people.find((p) => p.id === id);
  if (!person) notFound();
  const plan = data.planFor(id, date);
  const idx = Math.max(0, Number.parseInt(sp.i ?? '0', 10) || 0);
  const it = plan.items[idx];
  if (!it) notFound();

  const dur = (min: number) => tr('hm', { h: Math.floor(min / 60), m: min % 60 });
  const span = spanMinutes(it);
  const rule = plan.rule;
  const rest = it.kind !== 'extra' && rule?.breakStart && rule.breakEnd ? Math.max(0, Math.min(mins(it.endTime), mins(rule.breakEnd)) - Math.max(mins(it.startTime), mins(rule.breakStart))) : 0;
  const job = person.jobId ? jobs.find((j) => j.id === person.jobId) : undefined;
  const branch = groupPath(groups, person.groupId);
  const clock = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const pairs = data.rule ? (daysFor(data, id, date, date)[0]?.pairs ?? []).map((p, i) => ({ p, i })).filter((x) => x.p.in || x.p.out) : [];
  const editing = sp.edit === '1';
  const action = editing ? undefined : { href: `/admin/schedule/${id}/${date}?i=${idx}&edit=1`, label: t('edit') };

  return (
    <PageShell>
      <DetailBar back={`/admin/schedule?d=${date}`} backLabel={t('back')} title={t('title')} action={action} />
      <section className="-mx-4 -mt-3 flex flex-col gap-1 border-b border-border bg-bg px-5 py-5 lg:mx-0 lg:mt-0 lg:rounded-card lg:border">
        <p className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-extrabold tracking-tight">
          <span>
            {it.startTime} - {it.endTime}
          </span>
          {it.kind !== 'none' && <Chip tone={it.kind === 'holiday' ? 'warn' : it.kind === 'deemed' ? 'neutral' : 'info'}>{tk(it.kind)}</Chip>}
        </p>
        <p className="num text-muted">{f.dateTime(kstDateTime(date, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</p>
        <p className="num font-medium">
          {t('work', { t: dur(span - rest) })} / {t('break', { t: dur(rest) })}
        </p>
      </section>
      {editing && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">{t('editTitle')}</h2>
          <ShiftEdit shiftId={it.shiftId} employeeId={id} date={date} init={{ startTime: it.startTime, endTime: it.endTime, kind: it.kind, note: it.note ?? '' }} />
        </Card>
      )}
      <FieldList>
        <Field label={t('kind')} value={tk(it.kind)} />
        <Field label={t('employee')} value={person.name} href={`/admin/members/${id}`} />
        <Field label={t('branch')} value={branch ?? t('none')} href={branch ? '/admin/branches' : undefined} />
        <Field label={t('job')} value={job?.name ?? t('none')} href={job ? `/admin/jobs/${job.id}` : undefined} />
        <Field label={t('template')} value={it.source === 'rule' ? t('byRule') : (it.name ?? t(it.source === 'shift' ? 'byDate' : 'none'))} href={it.source === 'template' ? '/admin/shifts' : undefined} />
        <Field label={t('breakTime')} value={rest > 0 ? t('breakAuto', { t: dur(rest) }) : dur(0)} />
      </FieldList>
      <FieldList>
        <Field label={t('note')} value={it.note ?? t('addNote')} href={it.note || editing ? undefined : `/admin/schedule/${id}/${date}?i=${idx}&edit=1`} />
        {pairs.length === 0 && <Field label={t('records')} value={t('none')} />}
        {pairs.map(({ p, i }) => (
          <Field key={i} label={t('records')} value={`${p.in ? clock(p.in) : '–'} - ${p.out ? clock(p.out) : ''}`} href={`/admin/records/${id}/${date}?i=${i}`} />
        ))}
      </FieldList>
      <p className="px-1 text-sm text-faint">{t(it.source === 'shift' ? 'hintShift' : 'hint')}</p>
    </PageShell>
  );
}
