// 교육 · 안전교육 — 이행 현황 + 최근 교육 (묶음 33, 2026-10-20 의뢰인 승인). 관리자만.
// 위: 교육 종류마다 이번 기간(반기 · 1년 · 입사 시)의 이수율과 안 들은 사람. 아래: 최근 교육(서명 몇 명 / 대상 몇 명). [교육 만들기]는 가운데 창.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { HelpTip } from '@/components/Help';
import { SheetOpener } from '@/components/SheetOpener';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { toKstDate } from '@/lib/time';
import { groupMatcher, loadAttendees, loadCourses, loadSessions, trainingPeople } from '@/lib/training-data';
import { periodOf, progressOf } from '@/lib/training-rules';
import { SessionForm } from './TrainingForms';

export default async function TrainingPage() {
  const me = await getMe();
  if (!me || me.role !== 'admin') redirect('/punch');
  const [t, f] = await Promise.all([getTranslations('admin.training'), getFormatter()]);
  const today = toKstDate(new Date());
  const [courses, people, inGroup, sessions] = await Promise.all([loadCourses(), trainingPeople(), groupMatcher(), loadSessions({ from: `${Number(today.slice(0, 4)) - 1}-01-01`, to: addDays(today, 60) })]);
  const attendees = await loadAttendees(sessions.map((s) => s.id));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const courseOf = new Map(courses.map((c) => [c.id, c]));
  const progress = courses.filter((c) => c.active).map((c) => ({ c, p: progressOf({ course: c, date: today, people, sessions, attendees, inGroup }), period: periodOf(c.cycle, today) }));
  const recent = sessions.filter((s) => s.heldOn >= addDays(today, -183)).slice(0, 30);

  return (
    <PageShell wide>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}<HelpTip>{t('intro')}</HelpTip></h1>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/admin/training/export?m=${today.slice(0, 7)}`} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">{t('exportMonth', { m: today.slice(0, 7) })}</a>
          <Link href="/admin/training/courses" className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">{t('coursesLink')}</Link>
          <SheetOpener id="training-new" label={t('newSession')} />
        </div>
      </header>
      <AddSheet id="training-new" title={t('newSession')} modal wide className="hidden">
        <SessionForm courses={courses} people={people.filter((p) => p.active).map((p) => ({ id: p.id, label: p.name }))} today={today} />
      </AddSheet>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('progressTitle')}</CardTitle>
        <ul className="flex flex-col divide-y divide-border">
          {progress.map(({ c, p, period }) => {
            const done = p?.filter((x) => x.done).length ?? 0, all = p?.length ?? 0;
            const pct = all ? Math.round((done / all) * 100) : 0;
            return (
              <li key={c.id} className="flex flex-col gap-1.5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 font-bold">{c.name}</span>
                  <Chip tone="neutral">{t(`cycle.${c.cycle}`)}{c.hours ? ` · ${t('hoursValue', { n: c.hours })}` : ''}</Chip>
                  {c.needsCheck && <Chip tone="warn">{t('needsCheck')}</Chip>}
                </div>
                {p ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={c.name}>
                        <div className={`h-full rounded-full bg-primary`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="num w-28 shrink-0 text-right font-semibold">{t('doneValue', { done, all, pct })}</span>
                    </div>
                    <span className="num text-xs text-faint">{period ? t('periodValue', { from: period.from, to: period.to }) : t('hirePeriod')}</span>
                    {done < all && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-warn">{t('missingCount', { n: all - done })}</summary>
                        <p className="pt-1 text-muted">{p.filter((x) => !x.done).map((x) => `${nameOf.get(x.employeeId) ?? ''}${x.hours ? ` (${x.hours}h)` : ''}`).join(', ')}</p>
                      </details>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-faint">{t('noRate')}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('recentTitle')}</CardTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-faint">{t('recentEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {recent.map((s) => {
              const mine = attendees.filter((a) => a.sessionId === s.id && !a.removed);
              const signed = mine.filter((a) => a.signedAt).length;
              return (
                <li key={s.id}>
                  <Link href={`/admin/training/${s.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm hover:bg-surface">
                    <span className="num w-24 shrink-0 font-semibold">{f.dateTime(new Date(`${s.heldOn}T00:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                    <span className="min-w-0 flex-1 truncate">{courseOf.get(s.courseId)?.name ?? ''}</span>
                    {s.cancelled ? <Chip tone="neutral">{t('cancelled')}</Chip> : <Chip tone={signed === mine.length && mine.length ? 'ok' : 'warn'}>{t('signedValue', { signed, all: mine.length })}</Chip>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
