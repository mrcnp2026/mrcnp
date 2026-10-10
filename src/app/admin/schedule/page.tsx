// 근무일정 — 전체 (의뢰인 2026-10-10 2단계: 시프티의 「근무일정」 탭처럼) — 하루를 골라 누가 몇 시부터 몇 시까지인지 본다.
// 한 줄 = 시작/끝 시각 · 틀 색 막대 · 이름 · 지점 · 유형 배지. 하루 전부 휴가인 사람은 맨 위에 따로.
// 그날 일정 = 날짜별로 넣은 일정(특근·잔업·하루만 다른 시각) → 없으면 평소 틀 → 없으면 회사 규칙 (lib/shifts planDay).
// + 버튼: 날짜별 일정 넣기 (여러 명 한 번에). 날짜별로 넣은 일정만 ✕로 취소할 수 있다 — 평소 틀은 「근무일정 틀」에서 바꾼다.
import { ChevronLeft, ChevronRight, Plane } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { ScopeSwitch } from '@/components/ScopeSwitch';
import { Card, Chip, PageShell } from '@/components/ui';
import { addDays } from '@/lib/calendar';
import { isFullDayLeave } from '@/lib/leave';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { kstDateTime, toKstDate } from '@/lib/time';
import { CancelShift, DayJump, ScheduleForm } from './ScheduleForms';

export default async function AdminSchedulePage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const [t, tk, f, sp] = await Promise.all([getTranslations('admin.schedule'), getTranslations('admin.shifts.kinds'), getFormatter(), searchParams]);
  const today = toKstDate(new Date());
  const d = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && !Number.isNaN(Date.parse(`${sp.d}T00:00:00Z`)) ? sp.d : today;
  const [data, groups] = await Promise.all([loadPeriod(d, d), loadOrgGroups()]);
  // 검사 전용 계정(e2e-…)은 그날 넣은 일정이 있을 때만 보인다
  const people = data.people.filter((p) => p.active && (!p.employeeNo?.startsWith('e2e-') || data.shifts.some((s) => s.employeeId === p.id && s.workDate === d)));
  const onLeave = people.filter((p) => isFullDayLeave(leaveDaysFor(data, p.id).get(d)));
  const leaveIds = new Set(onLeave.map((p) => p.id));
  const rows = people
    .filter((p) => !leaveIds.has(p.id))
    .flatMap((p) => data.planFor(p.id, d).items.map((it) => ({ p, it })))
    .sort((a, b) => a.it.startTime.localeCompare(b.it.startTime) || a.p.name.localeCompare(b.p.name));
  const working = new Set(rows.map((r) => r.p.id)).size;
  const long = f.dateTime(kstDateTime(d, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const step = 'flex size-11 shrink-0 items-center justify-center rounded-button text-primary';

  return (
    <PageShell wide>
      <ScopeSwitch kind="schedule" current="all" />
      <div className="flex flex-wrap items-center gap-x-1 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <Help>{t('intro')}</Help>
        <Link href="/admin/shifts" className="ml-auto inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {t('toTemplates')} ›
        </Link>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-5 lg:gap-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <div className="flex items-center gap-1 rounded-card bg-bg px-2 py-1">
            <Link href={`/admin/schedule?d=${addDays(d, -1)}`} aria-label={t('prevDay')} className={step}>
              <ChevronLeft aria-hidden size={22} />
            </Link>
            <div className="min-w-0 flex-1">
              <DayJump date={d} label={t('date')} />
            </div>
            <Link href={`/admin/schedule?d=${addDays(d, 1)}`} aria-label={t('nextDay')} className={step}>
              <ChevronRight aria-hidden size={22} />
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="num font-bold">
              {long}
              {d === today && <span className="ml-2 text-sm font-medium text-primary">{t('today')}</span>}
            </h2>
            <p className="num text-sm text-muted">{t('summary', { work: working, leave: onLeave.length })}</p>
          </div>
          {onLeave.length > 0 && (
            <RowList>
              {onLeave.map((p) => (
                <li key={p.id} className="flex min-h-14 items-center gap-3 px-5">
                  <Plane aria-hidden size={20} className="shrink-0 text-primary" />
                  <span className="font-bold">{p.name}</span>
                  <span className="text-sm text-muted">{t('onLeave')}</span>
                </li>
              ))}
            </RowList>
          )}
          {rows.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(data.rule ? 'empty' : 'noRule')}</p>}
          <RowList>
            {rows.map(({ p, it }) => (
              <li key={`${p.id}${it.shiftId ?? it.source}${it.startTime}`} className="flex min-h-16 items-center gap-3 py-2 pr-2 pl-5">
                <span className="num flex w-14 shrink-0 flex-col text-sm leading-snug">
                  <span className="font-semibold">{it.startTime}</span>
                  <span className="text-muted">{it.endTime}</span>
                </span>
                <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-chip ${it.color ? SHIFT_COLOR_CLASS[it.color] : 'bg-border'}`} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/admin/records/${p.id}`} className="font-bold">
                    {p.name}
                  </Link>
                  <span className="truncate text-sm text-muted">{[groupPath(groups, p.groupId), it.name ?? (it.source === 'rule' ? t('byRule') : null), it.note].filter(Boolean).join(' / ')}</span>
                </span>
                {it.kind !== 'none' && <Chip tone={it.kind === 'holiday' ? 'warn' : it.kind === 'deemed' ? 'neutral' : 'info'}>{tk(it.kind)}</Chip>}
                {it.shiftId ? <CancelShift id={it.shiftId} label={t('cancelOf', { name: p.name })} /> : <span aria-hidden className="w-2 shrink-0" />}
              </li>
            ))}
          </RowList>
        </div>
        <AddSheet id="schedule" title={t('add')} className="lg:col-span-2">
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('add')}</h2>
            <ScheduleForm
              key={d}
              sheet="schedule"
              date={d}
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
