// ① 홈 — 오늘 현황판(7-9) + 처리할 일 요약 (마스터 5장). 관리자가 폰을 열었을 때 첫 화면에서 끝나야 한다.
// 홈에서 승인하지 않는다 — 요약을 누르면 처리함으로 간다 (5장 규칙 2).
// 연습 기록은 기본으로 빼고(4-6), 연습 기간에는 "연습 기록으로 보기"로 따로 볼 수 있다 (연습 배너가 항상 붙는다).
import { ChevronRight, Inbox, NotebookPen, TriangleAlert } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Pager, pageOf } from '@/components/Pager';
import { Card, CardTitle, PageShell } from '@/components/ui';
import { LABOR, resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays, weekStartOf } from '@/lib/calendar';
import { getMe } from '@/lib/auth';
import { findMissingPunches } from '@/lib/missing-punch';
import { weekTotalMinutes } from '@/lib/period';
import { isProxyCorrection } from '@/lib/day-detail';
import { fullLeaveSet } from '@/lib/leave';
import { daysFor, leaveDaysFor, loadPeriod, pendingCounts, syncOvertimeRequests, workDaysFor } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDateTime, toKstDate } from '@/lib/time';
import { buildTodayBoard, type BoardPerson } from '@/lib/today';
import { weekLimitList } from '@/lib/week-limit';
import { AutoRefresh } from './AutoRefresh';
import { BoardView } from './BoardView';
import { BarCard } from './Analytics';
import { KpiRow } from './KpiRow';
import { WeekLimitCard } from './WeekLimitCard';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ live?: string; np?: string }> }) {
  const t = await getTranslations('admin.home');
  const th = await getTranslations('home');
  const fmt = await getFormatter();
  const sp = await searchParams;
// ★ 연습 모드에서는 모든 기록이 연습 기록이다 — 관리자 화면도 기본으로 연습 기록을 본다 (2026-10-02: 시험직원 정정 요청이 관리자에게 0건으로 보이던 문제). ?live=1이면 실제 기록
  const practiceView = OFFICE.practiceMode && sp.live !== '1';
  const now = new Date();
  const today = toKstDate(now);
  const data = await loadPeriod(addDays(today, -13), today, practiceView);
  await syncOvertimeRequests(data, today);
  const counts = await pendingCounts(practiceView);
  // 오늘 근무노트 — 같은 직원·같은 날은 가장 최근 것만 (고친 노트는 새 행, 이전은 기록으로 남음 — R-10-2)
  const { data: noteRows } = await createAdminClient()
    .from('work_notes').select('employee_id, body, created_at')
    .eq('work_date', today).eq('is_test', practiceView).order('created_at', { ascending: false });
  const seenNote = new Set<string>();
  const notes = (noteRows ?? []).filter((n) => (seenNote.has(n.employee_id) ? false : (seenNote.add(n.employee_id), true)));
  const notePage = pageOf(notes, sp.np);
  const tc = await getTranslations('common');

  const active = data.people.filter((p) => p.active);
  const dayType = data.rule ? resolveDayType(today, data.rule, data.holidays) : 'workday';
  const weekStart = weekStartOf(today);
  const dayTypes = Object.fromEntries(
    [...Array(14)].map((_, i) => addDays(today, -13 + i)).map((d) => [d, data.ruleAt(d) ? resolveDayType(d, data.ruleAt(d)!, data.holidays) : 'workday']),
  );

  let missingPeople = 0;
  // PC 그래프: 이번 주 요일별 연장근로(연장 + 휴일 근로) 분 — 직원별 하루 집계를 날짜로 더한다
  const overtimeByDay = new Map<string, number>();
  const people: BoardPerson[] = active.map((p) => {
    const evs = data.events.filter((e) => e.employeeId === p.id);
    const fullLeave = fullLeaveSet(leaveDaysFor(data, p.id));
    const work = workDaysFor(data, p.id);
    const todays = evs.filter((e) => e.workDate === today);
    const days = daysFor(data, p.id, weekStart, today);
    for (const d of days) overtimeByDay.set(d.workDate, (overtimeByDay.get(d.workDate) ?? 0) + d.overtimeMinutes + d.holidayMinutes);
    const todayRow = days.find((d) => d.workDate === today);
    // 간주 근무인 사람은 찍지 않아도 되므로 미기록을 세지 않는다
    if (data.rule && data.templateOf(p.id)?.kind !== 'deemed') {
      const miss = findMissingPunches({
        employeeId: p.id, events: evs, approvedCorrections: data.corrections.filter((c) => c.status === 'approved'),
        pendingCorrections: data.corrections.filter((c) => c.status === 'pending'), rule: data.ruleFor(p.id, today) ?? data.rule, dayTypes, now,
        outGraceHours: OFFICE.missingOutGraceHours, inGraceMin: OFFICE.missingInGraceMin, joinedOn: p.startsOn,
        fullLeaveDates: new Set([...fullLeave, ...work.keys()]),
      });
      if (miss.length) missingPeople++;
    }
    return {
      id: p.id,
      name: p.name,
      employeeNo: p.employeeNo,
      pairs: todayRow?.pairs ?? todays.map((e) => (e.kind === 'in' ? { in: e.punchedAt, out: null } : { in: null, out: e.punchedAt })),
      firstInVerified: todays.find((e) => e.kind === 'in')?.ipVerified ?? null,
      adminEntered: todays.some((e) => e.source === 'admin') || data.corrections.some((c) => c.employeeId === p.id && c.workDate === today && isProxyCorrection(c)),
      weekMinutes: data.rule ? weekTotalMinutes(days) : null,
      onLeave: fullLeave.has(today),
      rule: data.ruleFor(p.id, today),
      work: work.get(today) ?? null,
    };
  });
  const board = buildTodayBoard({ people, rule: data.rule, dayType, workDate: today, now });
  const inCount = active.length - board.absent.length - board.off.length;
  // 출근율 = 출근한 사람 ÷ 오늘 출근 대상(휴무·휴가·승인된 외근 제외). 대상이 없으면(휴일) 보이지 않는다
  const target = active.length - board.off.length;
  const rate = target > 0 ? Math.round((Math.min(inCount, target) / target) * 100) : null;
  const hhmm = (d: Date) => fmt.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const legend = data.rule
    ? {
        deadline: hhmm(new Date(kstDateTime(today, data.rule.startTime).getTime() + data.rule.lateGraceMin * 60_000)),
        end: hhmm(kstDateTime(today, data.rule.endTime)),
      }
    : null;
  // PC 분석 영역: 최근 14일 (지각 막대 · 전 근무일 대비 출근율)
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const longDay = (d: string) => fmt.dateTime(kstDateTime(d, '12:00'), { month: 'long', day: 'numeric', weekday: 'short' });
  const daily = [...Array(14)].map((_, i) => addDays(today, -13 + i)).map((d) => {
    const rule = data.ruleAt(d);
    const workday = (rule ? resolveDayType(d, rule, data.holidays) : 'workday') === 'workday';
    // 지각 기준은 사람마다 다를 수 있다 (근무일정 틀) — 각자의 시작 시각 + 유예
    const firstIns = active
      .map((p) => ({ p, t: data.events.filter((e) => e.employeeId === p.id && e.workDate === d && e.kind === 'in').map((e) => e.punchedAt.getTime()).sort((a, b) => a - b)[0] }))
      .filter((x): x is { p: (typeof active)[number]; t: number } => x.t !== undefined);
    const lateOf = (x: { p: (typeof active)[number]; t: number }) => {
      const r = data.ruleFor(x.p.id, d);
      return !!r && x.t > kstDateTime(d, r.startTime).getTime() + r.lateGraceMin * 60_000;
    };
    return { d, workday, n: firstIns.length, late: workday && rule ? firstIns.filter(lateOf).length : 0 };
  });
  const pct = (n: number) => (active.length > 0 ? Math.round((Math.min(n, active.length) / active.length) * 100) : 0);
  const workdays = daily.filter((x) => x.workday);
  const prev = workdays.filter((x) => today > x.d).at(-1);
  const delta = rate !== null && prev ? rate - pct(prev.n) : null;
  // 내가 확인해 줘야 하는 권한 변경 (다른 관리자가 요청한 것, R-2의 8)
  const meId = (await getMe())!.id;
  const { data: roleReqs } = await createAdminClient().from('role_change_requests').select('target_id').eq('status', 'pending').neq('requested_by', meId).order('created_at');
  const todo = [
    { key: 'pendingOvertime', n: counts.overtime, href: '/admin/inbox#overtime' },
    { key: 'pendingCorrections', n: counts.corrections, href: '/admin/inbox#corrections' },
    { key: 'pendingLeave', n: counts.leave, href: '/admin/inbox#leave' },
    { key: 'pendingWork', n: counts.work, href: '/admin/inbox#work' },
    { key: 'missing', n: missingPeople, href: '/admin/missing' },
    ...(roleReqs?.length ? [{ key: 'pendingRole' as const, n: roleReqs.length, href: `/admin/members/${roleReqs[0].target_id}` }] : []),
  ];

  return (
    <PageShell wide>
      <AutoRefresh seconds={30} />
      {/* 토스풍 머리: 날짜·기준 시각은 작게, 한 줄 요약을 크게 (2026-10-02 의뢰인 선택 시안) */}
      <header className="flex flex-col gap-1 px-1 pt-2">
        <div className="flex items-center justify-between gap-2">
          <p className="num text-sm text-muted">{t('asOf', { date: fmt.dateTime(now, { month: 'long', day: 'numeric', weekday: 'short' }), time: fmt.dateTime(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) })}</p>
          <Link href="/punch" className="-my-2 inline-flex min-h-11 items-center text-sm font-medium text-muted">
            {t('myPunch')} ›
          </Link>
        </div>
        <h1 className="num text-2xl font-extrabold tracking-tight">{t('headline', { total: active.length, n: inCount })}</h1>
        {rate !== null && <p className="num text-sm text-muted">{t('rate', { target, p: rate })}</p>}
        {OFFICE.practiceMode && (
          <Link href={practiceView ? '/admin?live=1' : '/admin'} className="inline-flex min-h-11 items-center self-start text-sm text-primary">
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

      <KpiRow
        kpis={[
          { label: t('chartRate'), filter: 'in', value: rate === null ? '–' : `${rate}%`, sub: rate === null ? t('chartNoTarget') : delta === null ? t('chartRateSub', { n: Math.min(inCount, target), target }) : `${t('chartRateSub', { n: Math.min(inCount, target), target })} · ${t('kpiDelta', { d: `${delta > 0 ? '+' : ''}${delta}` })}` },
          { label: th('status.late'), filter: 'late', value: String(board.late.length), warn: board.late.length > 0, sub: t('kpiNames') },
          { label: th('status.absent'), filter: 'absent', value: String(board.absent.length), sub: t('kpiNames') },
          { label: t('todo'), value: String(todo.reduce((a, x) => a + x.n, 0)), sub: t('kpiTodo'), href: '/admin/inbox' },
        ]}
      />

      {/* PC: ① 오늘 직원 현황(넓게) + 처리할 일 ② 30일 추이 + 14일 지각 ③ 주 52시간 + 근무노트 — 줄마다 높이를 맞춘다 (2026-10-06 의뢰인: 흩어져 난잡했다) · 폰: 한 칸 */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
      <Card className="flex flex-col p-0 py-2 lg:col-start-3 lg:row-start-1">
        <div className="px-5 pt-2">
          <CardTitle icon={Inbox}>{t('todo')}</CardTitle>
        </div>
        {todo.every((x) => x.n === 0) && <p className="px-5 py-3 text-sm text-faint">{t('todoNone')}</p>}
        <ul>
          {todo.filter((x) => x.n > 0).map((x) => (
            <li key={x.key}>
              <Link href={!practiceView && OFFICE.practiceMode && x.href.startsWith('/admin/inbox') ? x.href.replace('/admin/inbox', '/admin/inbox?live=1') : x.href} className="flex min-h-14 items-center gap-3 px-5">
                <span className="flex-1">{t(x.key)}</span>
                <span className={`num inline-flex min-w-6 items-center justify-center rounded-chip px-2 text-sm font-bold ${x.n > 0 ? 'bg-primary text-on-primary' : 'text-faint'}`}>{x.n}</span>
                <ChevronRight aria-hidden size={20} strokeWidth={2} className="text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-3 lg:col-span-2 lg:col-start-1 lg:row-start-1">
      <BoardView board={board} total={active.length} limitMinutes={OFFICE.weeklyLimitHours * 60} cautionMinutes={OFFICE.weeklyCautionHours * 60} colored={OFFICE.workplaceSize === '5_or_more'} legend={legend} />
      </div>

      {/* 이번 주 요일별 연장근로 시간 (2026-10-06 의뢰인: 30일 출근 비율 선 그래프는 볼 것이 없었다 → 샤플처럼 이번 주 초과근무). 폰에서도 보인다 — 칸이 화면 폭에 맞춰 줄어들어 가로 스크롤이 생기지 않는다 */}
      <BarCard
        className="flex lg:col-span-2"
        title={t('otWeekTitle')}
        unit={t('otWeekUnit')}
        empty={t('otWeekNone')}
        bars={[...Array(7)].map((_, i) => addDays(weekStart, i)).map((d) => {
          const m = overtimeByDay.get(d) ?? 0;
          const text = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
          return { key: d, label: md(d), sub: fmt.dateTime(kstDateTime(d, '12:00'), { weekday: 'short' }), n: m, text, tip: t('otWeekTip', { date: longDay(d), time: text }) };
        })}
      />
      <BarCard
        className="flex"
        dense
        title={t('lateTitle')}
        unit={t('chartUnit')}
        bars={daily.map((x) => ({ key: x.d, label: md(x.d), n: x.late, tip: t('lateTip', { date: longDay(x.d), n: x.late }) }))}
      />
      <div className="flex flex-col gap-3 lg:col-span-3 lg:grid lg:grid-cols-2 lg:gap-4">
      {data.rule && (
        <WeekLimitCard
          rows={weekLimitList(people, { regularMin: LABOR.weeklyRegularLimitMin, cautionMin: OFFICE.weeklyCautionHours * 60, limitMin: OFFICE.weeklyLimitHours * 60 })}
          limitMin={OFFICE.weeklyLimitHours * 60}
          colored={OFFICE.workplaceSize === '5_or_more'}
        />
      )}

      <Card className="flex scroll-mt-16 flex-col gap-2">
        <span id="notes" />
        <CardTitle icon={NotebookPen} help={t('notesHint')} aside={<span className="num text-sm text-faint">{notes.length}</span>}>
          {t('notesTitle')}
        </CardTitle>
        {notes.length === 0 ? (
          <p className="text-sm text-faint">{t('notesEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {notePage.items.map((n) => (
              <li key={n.employee_id} className="flex flex-col gap-1 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{data.people.find((p) => p.id === n.employee_id)?.name}</span>
                  <span className="num text-xs text-faint">{fmt.dateTime(new Date(n.created_at), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
        <Pager page={notePage.page} pages={notePage.pages} param="np" params={sp} anchor="notes" label={tc('pages')} />
      </Card>
      </div>
      </div>

    </PageShell>
  );
}
