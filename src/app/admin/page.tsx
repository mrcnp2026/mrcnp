// ① 홈 — 오늘 현황판(7-9) + 처리할 일 요약 (마스터 5장). 관리자가 폰을 열었을 때 첫 화면에서 끝나야 한다.
// 홈에서 승인하지 않는다 — 요약을 누르면 처리함으로 간다 (5장 규칙 2).
// 연습 기록은 기본으로 빼고(4-6), 연습 기간에는 "연습 기록으로 보기"로 따로 볼 수 있다 (연습 배너가 항상 붙는다).
import { Inbox, TriangleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, PageShell } from '@/components/ui';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays, weekStartOf } from '@/lib/calendar';
import { findMissingPunches } from '@/lib/missing-punch';
import { weekTotalMinutes } from '@/lib/period';
import { daysFor, loadPeriod, pendingCounts, syncOvertimeRequests } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import { buildTodayBoard, type BoardPerson } from '@/lib/today';
import { AutoRefresh } from './AutoRefresh';
import { BoardView } from './BoardView';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ practice?: string }> }) {
  const t = await getTranslations('admin.home');
  const sp = await searchParams;
  const practiceView = OFFICE.practiceMode && sp.practice === '1';
  const now = new Date();
  const today = toKstDate(now);
  const data = await loadPeriod(addDays(today, -13), today, practiceView);
  await syncOvertimeRequests(data, today);
  const counts = await pendingCounts(practiceView);

  const active = data.people.filter((p) => p.active);
  const dayType = data.rule ? resolveDayType(today, data.rule, data.holidays) : 'workday';
  const weekStart = weekStartOf(today);
  const dayTypes = Object.fromEntries(
    [...Array(14)].map((_, i) => addDays(today, -13 + i)).map((d) => [d, data.rule ? resolveDayType(d, data.rule, data.holidays) : 'workday']),
  );

  let missingPeople = 0;
  const people: BoardPerson[] = active.map((p) => {
    const evs = data.events.filter((e) => e.employeeId === p.id);
    const todays = evs.filter((e) => e.workDate === today);
    const days = daysFor(data, p.id, weekStart, today);
    const todayRow = days.find((d) => d.workDate === today);
    if (data.rule) {
      const miss = findMissingPunches({
        employeeId: p.id, events: evs, approvedCorrections: data.corrections.filter((c) => c.status === 'approved'),
        pendingCorrections: data.corrections.filter((c) => c.status === 'pending'), rule: data.rule, dayTypes, now,
        outGraceHours: OFFICE.missingOutGraceHours, inGraceMin: OFFICE.missingInGraceMin, joinedOn: p.startsOn,
      });
      if (miss.length) missingPeople++;
    }
    return {
      id: p.id,
      name: p.name,
      employeeNo: p.employeeNo,
      pairs: todayRow?.pairs ?? todays.map((e) => (e.kind === 'in' ? { in: e.punchedAt, out: null } : { in: null, out: e.punchedAt })),
      firstInVerified: todays.find((e) => e.kind === 'in')?.ipVerified ?? null,
      adminEntered: todays.some((e) => e.source === 'admin'),
      weekMinutes: data.rule ? weekTotalMinutes(days) : null,
    };
  });
  const board = buildTodayBoard({ people, rule: data.rule, dayType, workDate: today, now });
  const todo = [
    { key: 'pendingOvertime', n: counts.overtime, href: '/admin/inbox#overtime' },
    { key: 'pendingCorrections', n: counts.corrections, href: '/admin/inbox#corrections' },
    { key: 'missing', n: missingPeople, href: '/admin/records' },
  ] as const;

  return (
    <PageShell>
      <AutoRefresh seconds={30} />
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        {OFFICE.practiceMode && (
          <Link href={practiceView ? '/admin' : '/admin?practice=1'} className="min-h-11 content-center text-sm text-primary">
            {practiceView ? t('showLive') : t('showPractice')}
          </Link>
        )}
      </header>
      {practiceView && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}
      {!data.rule && (
        <p className="flex gap-2 rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
          <TriangleAlert aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
          {t('noRule')}
        </p>
      )}

      <BoardView board={board} total={active.length} limitMinutes={OFFICE.weeklyLimitHours * 60} cautionMinutes={OFFICE.weeklyCautionHours * 60} colored={OFFICE.workplaceSize === '5_or_more'} />

      <Card className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-semibold">
          <Inbox aria-hidden size={20} strokeWidth={1.75} />
          {t('todo')}
        </h2>
        <ul className="divide-y divide-border">
          {todo.map((x) => (
            <li key={x.key}>
              <Link href={practiceView && x.href.startsWith('/admin/inbox') ? x.href.replace('/admin/inbox', '/admin/inbox?practice=1') : x.href} className="flex min-h-11 items-center justify-between gap-2 py-2">
                <span>{t(x.key)}</span>
                <span className={`num text-xl font-semibold ${x.n > 0 ? 'text-warn' : 'text-faint'}`}>{x.n}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </PageShell>
  );
}
