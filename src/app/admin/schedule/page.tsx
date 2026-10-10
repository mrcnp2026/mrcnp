// 근무일정 — 전체 목록 (의뢰인 2026-10-10: 시프티의 「근무일정」 탭처럼, 출퇴근기록 목록과 같은 모양).
// 위: 검색 · 거르기 · 기간 · [내 일정]. 아래: 날짜 머리줄(그날 계획 시간 합) + 한 줄 = 시작/끝 시각 · 직무 색 막대 · 이름 · 지점/직무 · 유형 배지.
// 하루 전부 휴가인 사람은 그날 맨 위에 비행기 아이콘으로 같은 목록에 나온다. 기본 기간은 이번 주(월~일), 한 번에 31일까지.
// 그날 일정 = 날짜별로 넣은 일정(특근·잔업·하루만 다른 시각) → 없으면 평소 틀 → 없으면 회사 규칙 (lib/shifts planDay).
// + 버튼: 날짜별 일정 넣기 (여러 명 한 번에). 날짜별로 넣은 일정만 ✕로 취소할 수 있다 — 평소 틀은 「근무일정 틀」에서 바꾼다.
// 예전 주소(?d=하루)는 그 하루만 보는 것으로 받는다.
import { Plane } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { ListBar } from '@/components/ListBar';
import { Pager, pageOf } from '@/components/Pager';
import { Card, Chip, PageShell } from '@/components/ui';
import { addDays, weekStartOf } from '@/lib/calendar';
import { loadJobs } from '@/lib/job-data';
import { isFullDayLeave } from '@/lib/leave';
import { listRange } from '@/lib/list-range';
import { buildOrgTree, groupPath, groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { SHIFT_COLOR_CLASS, spanMinutes } from '@/lib/shifts';
import { kstDateTime, toKstDate } from '@/lib/time';
import { CancelShift, ScheduleForm } from './ScheduleForms';

const DATES_PER_PAGE = 7;

export default async function AdminSchedulePage({ searchParams }: { searchParams: Promise<{ d?: string; q?: string; g?: string; from?: string; to?: string; p?: string }> }) {
  const [t, tk, tc, f, sp] = await Promise.all([getTranslations('admin.schedule'), getTranslations('admin.shifts.kinds'), getTranslations('common'), getFormatter(), searchParams]);
  const today = toKstDate(new Date());
  const week = weekStartOf(today);
  const { from, to } = listRange(sp.from ?? sp.d, sp.to ?? sp.d, { from: week, to: addDays(week, 6) }, addDays);
  const [data, groups, jobs] = await Promise.all([loadPeriod(from, to), loadOrgGroups(), loadJobs()]);
  const jobOf = new Map(jobs.map((j) => [j.id, j]));
  const groupOptions = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const g = groupOptions.some((o) => o.id === sp.g) ? sp.g! : '';
  const scope = g ? groupScope(groups, g) : null;
  const q = (sp.q ?? '').trim().slice(0, 40);

  const people = data.people.filter((p) => p.active && (!scope || (p.groupId && scope.has(p.groupId))) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const leaveOf = new Map(people.map((p) => [p.id, leaveDaysFor(data, p.id)]));
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const blocks = days
    .map((d) => {
      // 검사 전용 계정(e2e-…)은 그날 넣은 일정이 있을 때만 보인다
      const seen = people.filter((p) => !p.employeeNo?.startsWith('e2e-') || data.shifts.some((s) => s.employeeId === p.id && s.workDate === d));
      const onLeave = seen.filter((p) => isFullDayLeave(leaveOf.get(p.id)?.get(d)));
      const off = new Set(onLeave.map((p) => p.id));
      const rows = seen
        .filter((p) => !off.has(p.id))
        .flatMap((p) => data.planFor(p.id, d).items.map((it) => ({ p, it })))
        .sort((a, b) => a.it.startTime.localeCompare(b.it.startTime) || a.p.name.localeCompare(b.p.name));
      return { d, onLeave, rows, total: rows.reduce((a, r) => a + spanMinutes(r.it), 0) };
    })
    .filter((b) => b.rows.length > 0 || b.onLeave.length > 0);
  const page = pageOf(blocks, sp.p, DATES_PER_PAGE);
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const formDate = from === to || today < from || today > to ? from : today;

  return (
    <PageShell wide>
      <h1 className="sr-only">{t('title')}</h1>
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <ListBar
            key={`${q}|${g}|${from}|${to}`}
            q={q}
            from={from}
            to={to}
            group={g}
            groups={groupOptions}
            side={{ href: '/punch/schedule', label: t('mine') }}
            labels={{ search: t('search'), filter: t('filter'), period: t('period'), from: t('from'), to: t('to'), apply: t('apply'), groupAll: t('groupAll') }}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-3 px-1 text-sm">
            <Link href="/admin/schedule" className="inline-flex min-h-11 items-center font-medium text-muted">
              {t('thisWeek')}
            </Link>
            <Link href="/admin/shifts" className="inline-flex min-h-11 items-center font-medium text-primary">
              {t('toTemplates')} ›
            </Link>
          </div>
          {!data.rule && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
          {data.rule && blocks.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('emptyRange')}</p>}
          <div className="flex flex-col">
            {page.items.map(({ d, onLeave, rows, total }) => (
              <section key={d}>
                <h2 className="num -mx-4 flex items-center justify-between gap-2 border-b border-border bg-surface px-5 py-3 font-bold lg:mx-0">
                  <span>
                    {f.dateTime(kstDateTime(d, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                    {d === today && <span className="ml-2 text-sm font-medium text-primary">{t('today')}</span>}
                  </span>
                  <span className="shrink-0">{hm(total)}</span>
                </h2>
                <ul className="-mx-4 divide-y divide-border border-b border-border bg-bg lg:mx-0">
                  {onLeave.map((p) => (
                    <li key={`leave${p.id}`} className="flex min-h-14 items-center gap-3 px-5">
                      <span className="flex w-14 shrink-0 justify-center">
                        <Plane aria-hidden size={20} className="text-primary" />
                      </span>
                      <span aria-hidden className="w-1 shrink-0 self-stretch" />
                      <span className="font-bold">{p.name}</span>
                      <span className="text-sm text-muted">{t('onLeave')}</span>
                    </li>
                  ))}
                  {rows.map(({ p, it }) => {
                    const job = p.jobId ? jobOf.get(p.jobId) : undefined;
                    const color = job?.color ?? it.color;
                    return (
                      <li key={`${p.id}${it.shiftId ?? it.source}${it.startTime}`} className="flex min-h-16 items-center gap-3 py-2 pr-2 pl-5">
                        <span className="num flex w-14 shrink-0 flex-col text-sm leading-snug">
                          <span className="font-semibold">{it.startTime}</span>
                          <span className="text-muted">{it.endTime}</span>
                        </span>
                        <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-chip ${color ? SHIFT_COLOR_CLASS[color] : 'bg-border'}`} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <Link href={`/admin/records/${p.id}`} className="font-bold">
                            {p.name}
                          </Link>
                          <span className="truncate text-sm text-muted">{[groupPath(groups, p.groupId), job?.name, it.name ?? (it.source === 'rule' ? t('byRule') : null), it.note].filter(Boolean).join(' / ')}</span>
                        </span>
                        {it.kind !== 'none' && <Chip tone={it.kind === 'holiday' ? 'warn' : it.kind === 'deemed' ? 'neutral' : 'info'}>{tk(it.kind)}</Chip>}
                        {it.shiftId ? <CancelShift id={it.shiftId} label={t('cancelOf', { name: p.name })} /> : <span aria-hidden className="w-2 shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <Pager page={page.page} pages={page.pages} param="p" params={{ ...sp }} label={tc('pages')} />
          <p className="px-1 text-sm text-faint">{t('hint')}</p>
        </div>
        <AddSheet id="schedule" title={t('add')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('add')}</h2>
            <ScheduleForm
              key={formDate}
              sheet="schedule"
              date={formDate}
              templates={data.templates.map((x) => ({ id: x.id, name: x.name, startTime: x.startTime, endTime: x.endTime, kind: x.kind }))}
              people={data.people.filter((p) => p.active && !p.employeeNo?.startsWith('e2e-')).map((p) => ({ id: p.id, name: p.name, group: groupPath(groups, p.groupId) }))}
            />
          </Card>
        </AddSheet>
      </div>
      <Fab label={t('add')} items={[{ id: 'schedule', label: t('add') }]} />
    </PageShell>
  );
}
