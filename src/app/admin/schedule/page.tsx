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
import { addDays, isoWeekday, weekStartOf } from '@/lib/calendar';
import { loadJobs } from '@/lib/job-data';
import { isFullDayLeave } from '@/lib/leave';
import { listRange } from '@/lib/list-range';
import { buildOrgTree, groupPath, groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { SHIFT_COLOR_CLASS, spanMinutes } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDateTime, toKstDate } from '@/lib/time';
import { SheetOpener } from '@/components/SheetOpener';
import { resolveDayType } from '@/config/labor-rules';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CancelShift, ScheduleForm } from './ScheduleForms';
import { ScheduleGrid, type GridDay, type GridRow } from './ScheduleGrid';
import { ScheduleMonth, type MonthCell } from './ScheduleMonth';

const DATES_PER_PAGE = 7;

export default async function AdminSchedulePage({ searchParams }: { searchParams: Promise<{ d?: string; q?: string; g?: string; from?: string; to?: string; p?: string; v?: string }> }) {
  const [t, tk, tc, f, sp] = await Promise.all([getTranslations('admin.schedule'), getTranslations('admin.shifts.kinds'), getTranslations('common'), getFormatter(), searchParams]);
  const today = toKstDate(new Date());
  const week = weekStartOf(today);
  const { from, to } = listRange(sp.from ?? sp.d, sp.to ?? sp.d, { from: week, to: addDays(week, 6) }, addDays);
  const [data, groups, jobs, { data: named }] = await Promise.all([loadPeriod(from, to), loadOrgGroups(), loadJobs(), createAdminClient().from('holidays').select('the_date, label').gte('the_date', from).lte('the_date', to)]);
  const holidayName = new Map((named ?? []).map((h) => [h.the_date as string, h.label as string]));
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

  // ── PC 달력형 (줄 = 직원, 칸 = 날짜). 주 보기 · 월 보기는 기간만 다르다 — 같은 자료를 그린다
  const month = sp.v === 'month';
  const monthStart = `${from.slice(0, 7)}-01`;
  const nextMonth = addDays(`${addDays(monthStart, 31).slice(0, 7)}-01`, 0);
  const span = days.length;
  const link = (a: string, b: string, v = sp.v) => {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries({ q, g, from: a, to: b, v })) if (val) qs.set(k, val);
    return `/admin/schedule?${qs}`;
  };
  const prev = month ? link(`${addDays(monthStart, -1).slice(0, 7)}-01`, addDays(monthStart, -1)) : link(addDays(from, -span), addDays(from, -1));
  const next = month ? link(nextMonth, addDays(`${addDays(nextMonth, 31).slice(0, 7)}-01`, -1)) : link(addDays(to, 1), addDays(to, span));
  const gridPeople = people.filter((p) => !p.employeeNo?.startsWith('e2e-') || data.shifts.some((s) => s.employeeId === p.id));
  const count = new Map<string, number>();
  const gridRows: GridRow[] = gridPeople.map((p) => {
    const job = p.jobId ? jobOf.get(p.jobId) : undefined;
    let total = 0;
    const cells = days.map((d) => {
      const leave = isFullDayLeave(leaveOf.get(p.id)?.get(d));
      const items = leave ? [] : data.planFor(p.id, d).items;
      if (items.length) count.set(d, (count.get(d) ?? 0) + 1);
      total += items.reduce((a, it) => a + spanMinutes(it), 0);
      return {
        leave: leave ? t('onLeave') : null,
        items: items.map((it, i) => ({ it, href: `/admin/schedule/${p.id}/${d}?i=${i}`, color: job?.color ?? it.color, tag: it.kind !== 'none' ? tk(it.kind) : null })),
      };
    });
    return { id: p.id, name: p.name, sub: [groupPath(groups, p.groupId), job?.name].filter(Boolean).join(' / '), total: hm(total), cells };
  });
  const isRed = (d: string) => isoWeekday(d) >= 6 || holidayName.has(d) || (data.rule ? resolveDayType(d, data.rule, data.holidays) === 'holiday' : false);
  // 월 보기 = 진짜 달력(일~토). 칸마다 그날의 휴가 → 일정(시작 시각 순). 달 밖의 날은 빈 칸으로 흐리게
  const monthCells: MonthCell[] = [];
  if (month) {
    const gridStart = addDays(from, -(isoWeekday(from) % 7));
    const gridEnd = addDays(to, 6 - (isoWeekday(to) % 7));
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
      const inMonth = d >= from && d <= to;
      const seen = inMonth ? gridPeople : [];
      const onLeave = seen.filter((p) => isFullDayLeave(leaveOf.get(p.id)?.get(d)));
      const off = new Set(onLeave.map((p) => p.id));
      const rows = seen
        .filter((p) => !off.has(p.id))
        .flatMap((p) => data.planFor(p.id, d).items.map((it, i) => ({ p, it, i })))
        .sort((x, y) => x.it.startTime.localeCompare(y.it.startTime) || x.p.name.localeCompare(y.p.name));
      monthCells.push({
        date: d,
        day: d.endsWith('-01') ? `${Number(d.slice(5, 7))}/1` : String(Number(d.slice(8))),
        inMonth,
        red: isRed(d),
        today: d === today,
        holiday: holidayName.get(d) ?? null,
        entries: [
          ...onLeave.map((p) => ({ key: `l${p.id}`, name: p.name, time: null, href: null, color: null, tag: t('onLeave') })),
          ...rows.map(({ p, it, i }) => ({ key: `${p.id}${i}`, name: p.name, time: `${it.startTime} - ${it.endTime}`, href: `/admin/schedule/${p.id}/${d}?i=${i}`, color: (p.jobId ? jobOf.get(p.jobId)?.color : undefined) ?? it.color, tag: it.kind !== 'none' ? tk(it.kind) : null })),
        ],
      });
    }
  }
  const sunday = addDays(weekStartOf(today), -1);
  const weekdayNames = [...Array(7)].map((_, i) => f.dateTime(kstDateTime(addDays(sunday, i), '12:00'), { weekday: 'short' }));
  const gridDays: GridDay[] = days.map((d) => {
    // 토요일 · 일요일 · 공휴일(주휴일 포함)은 빨간 글자와 옅은 붉은 바탕으로 구분한다 (2026-10-11 의뢰인)
    const red = isRed(d);
    return { date: d, label: f.dateTime(kstDateTime(d, '12:00'), { day: 'numeric', weekday: 'short' }), holiday: holidayName.get(d) ?? null, red, today: d === today, count: count.get(d) ?? 0 };
  });
  const rangeTitle = month
    ? f.dateTime(kstDateTime(from, '12:00'), { year: 'numeric', month: 'long' })
    : `${f.dateTime(kstDateTime(from, '12:00'), { year: 'numeric', month: 'long', day: 'numeric' })} - ${f.dateTime(kstDateTime(to, '12:00'), { month: 'long', day: 'numeric' })}`;
  const viewBtn = (on: boolean) => `inline-flex min-h-8 items-center border px-3 text-sm first:rounded-l-button last:rounded-r-button ${on ? 'z-10 border-primary bg-primary-tint font-bold text-primary' : 'border-border bg-bg text-muted'}`;

  return (
    <PageShell wide flush>
      <h1 className="sr-only lg:hidden">{t('title')}</h1>
      {/* PC: 달력형 — 제목 · [추가하기] / ‹ › 오늘 · 기간 · 검색 · 부서 / [주 · 월] */}
      <div className="hidden flex-col gap-4 lg:flex">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{t('title')}</h1>
            <p className="pt-1 text-sm text-faint">{t('pcIntro')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/shifts" className="inline-flex min-h-8 items-center rounded-button border border-nav bg-bg px-4 text-sm font-bold text-nav">
              {t('toTemplates')}
            </Link>
            <SheetOpener id="schedule" label={t('add')} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex">
            <Link href={prev} aria-label={t('prevDay')} className="inline-flex size-8 items-center justify-center rounded-l-button border border-border bg-bg text-muted">
              <ChevronLeft aria-hidden size={16} />
            </Link>
            <Link href={next} aria-label={t('nextDay')} className="-ml-px inline-flex size-8 items-center justify-center rounded-r-button border border-border bg-bg text-muted">
              <ChevronRight aria-hidden size={16} />
            </Link>
          </div>
          <Link href={month ? link(`${today.slice(0, 7)}-01`, addDays(`${addDays(`${today.slice(0, 7)}-01`, 31).slice(0, 7)}-01`, -1)) : link(week, addDays(week, 6))} className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-4 text-sm text-muted">
            {t('today')}
          </Link>
          <p className="num ml-2 text-lg font-bold">{rangeTitle}</p>
          <form action="/admin/schedule" className="ml-auto flex items-center gap-2">
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            {sp.v && <input type="hidden" name="v" value={sp.v} />}
            <input type="search" name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} maxLength={40} className="min-h-8 w-44 rounded-button border border-border bg-bg px-3" />
            <select name="g" defaultValue={g} aria-label={t('filter')} className="min-h-8 rounded-button border border-border bg-surface px-2 text-muted">
              <option value="">{t('groupAll')}</option>
              {groupOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="submit" className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-3 text-sm text-muted">
              {t('apply')}
            </button>
          </form>
          <div className="flex">
            <Link href={link(weekStartOf(from), addDays(weekStartOf(from), 6), '')} aria-current={!month ? 'page' : undefined} className={viewBtn(!month)}>
              {t('viewWeek')}
            </Link>
            <Link href={link(monthStart, addDays(nextMonth, -1), 'month')} aria-current={month ? 'page' : undefined} className={`-ml-px ${viewBtn(month)}`}>
              {t('viewMonth')}
            </Link>
          </div>
        </div>
        {!data.rule && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
        {month ? (
          <ScheduleMonth weekdays={weekdayNames} cells={monthCells} labels={{ more: (n) => t('more', { n }) }} />
        ) : (
          <ScheduleGrid days={gridDays} rows={gridRows} dense={false} labels={{ employee: t('colEmployee'), people: t('colPeople'), empty: t('emptyRange') }} />
        )}
        <p className="text-xs text-faint">{t('hint')}</p>
      </div>
      <div className="grid items-start lg:hidden">
        <div className="flex flex-col">
          <ListBar
            key={`${q}|${g}|${from}|${to}`}
            q={q}
            from={from}
            to={to}
            group={g}
            groups={groupOptions}
            side={{ href: '/punch/schedule', label: t('mine') }}
            labels={{ menu: tc('menu'), search: t('search'), filter: t('filter'), period: t('period'), from: t('from'), to: t('to'), apply: t('apply'), groupAll: t('groupAll') }}
          />
          {!data.rule && <p className="mt-3 rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
          {data.rule && blocks.length === 0 && <p className="mt-3 rounded-card bg-bg p-5 text-sm text-faint">{t('emptyRange')}</p>}
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
                    const at = data.planFor(p.id, d).items.indexOf(it);
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
                          <Link href={`/admin/schedule/${p.id}/${d}?i=${Math.max(0, at)}`} className="font-bold">
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
          <div className="flex flex-wrap items-center justify-between gap-x-3 px-1 pt-2 text-sm">
            <Link href="/admin/schedule" className="inline-flex min-h-11 items-center font-medium text-muted">
              {t('thisWeek')}
            </Link>
            <Link href="/admin/shifts" className="inline-flex min-h-11 items-center font-medium text-primary">
              {t('toTemplates')} ›
            </Link>
          </div>
          <p className="px-1 text-sm text-faint">{t('hint')}</p>
        </div>
        </div>
      <AddSheet id="schedule" title={t('add')} modal>
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
      <Fab label={t('add')} items={[{ id: 'schedule', label: t('add') }]} />
    </PageShell>
  );
}
