// 직원 홈 (PWA 진입점). 2026-10-10 의뢰인: 시프티 홈처럼 — (관리자) 바로가기 카드 → 「오늘 근무」 → 미기록 안내 → 「이번주 근무」(요일 7칸 + 계획 막대) → 근무노트.
// 상단 바·하단 탭은 layout.tsx(components/AppFrame).
import { ChartNoAxesColumn, ChevronRight, ClipboardX, Settings } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/ui';
import { LABOR, resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { loadEmployeeToday } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { addDays, weekStartOf } from '@/lib/calendar';
import { fullLeaveSet } from '@/lib/leave';
import { HOME_COOKIE, WEEKS_AHEAD, WEEKS_BACK, homeCardsOn, pickWeek } from '@/lib/home';
import { daysFor, leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { weeklyHours } from '@/lib/weekly-hours';
import { hhmm, planMinutes } from '@/lib/shifts';
import { isPhoneUserAgent } from '@/lib/passkey';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadEmployeeRecent } from '@/lib/employee-data';
import { kstDateTime } from '@/lib/time';
import { loadWorkRequests } from '@/lib/work-data';
import { workStatusOn } from '@/lib/work-requests';
import { MissingBanner } from './MissingBanner';
import { NoteBox } from './NoteBox';
import { SituationCard } from './SituationCard';
import { TodayCard } from './TodayCard';
import { WeekBar, type WeekCell } from './WeekBar';

export default async function PunchPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('home');
  const tw = await getTranslations('work');
  const f = await getFormatter();
  const now = new Date();
  const [today, recent, { data: key }] = await Promise.all([
    loadEmployeeToday(me.id, now),
    loadEmployeeRecent(me.id, now),
    // 출퇴근 기기 (등록한 1대). 없으면 홈의 버튼 자리에 등록 안내가 나온다
    createAdminClient().from('user_passkeys').select('credential_id, device_label').eq('employee_id', me.id).is('revoked_at', null).maybeSingle(),
  ]);
  // 승인을 기다리는 반경 밖 출근/퇴근 요청 (오늘 것)
  const { data: pr } = await createAdminClient().from('punch_requests').select('kind, requested_at').eq('employee_id', me.id).eq('work_date', today.workDate).eq('status', 'pending').eq('is_test', today.practice).order('requested_at', { ascending: false }).limit(1);
  const pendingPunch = pr?.length ? { kind: pr[0].kind as 'in' | 'out', at: pr[0].requested_at as string } : null;
  // 이번 주 요일 칸: 그날 일정(날짜별 일정 → 평소 틀 → 회사 규칙, 반차 반영). 하루 전부 휴가면 「휴가」
  // 주 고르기(?w=날짜): 지난 주 · 다음 주의 일정과 근무 시간을 본다. 기본은 이번 주
  const thisWeek = weekStartOf(today.workDate);
  const weekStart = pickWeek((await searchParams).w, thisWeek, weekStartOf, addDays);
  const isThisWeek = weekStart === thisWeek;
  const period = await loadPeriod(weekStart, addDays(weekStart, 6));
  // 이번 주가 아니면 그 주의 실제 시간을 같은 방식으로 다시 센다 (출근~퇴근 합, 연장은 급여 집계와 같은 계산)
  const week = isThisWeek || !period.rule
    ? today.week
    : weeklyHours({
        weekStart,
        dailyWork: daysFor(period, me.id).map((d) => ({
          workDate: d.workDate,
          netMinutes: d.pairs.reduce((a, x) => a + (x.in && x.out && x.out > x.in ? Math.floor((x.out.getTime() - x.in.getTime()) / 60000) : 0), 0),
          overtimeMinutes: d.overtimeMinutes + d.holidayMinutes,
        })),
        is5OrMore: today.week?.colored ?? true,
      });
  const cards = homeCardsOn((await cookies()).get(HOME_COOKIE)?.value);
  const weekHref = (n: number) => {
    const w = addDays(weekStart, 7 * n);
    return w < addDays(thisWeek, -7 * WEEKS_BACK) || w > addDays(thisWeek, 7 * WEEKS_AHEAD) ? null : w === thisWeek ? '/punch' : `/punch?w=${w}`;
  };
  const fullLeave = fullLeaveSet(leaveDaysFor(period, me.id));
  const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;
  let planTotal = 0;
  const cells: WeekCell[] = [...Array(7)].map((_, i) => {
    const d = addDays(weekStart, i);
    const plan = period.planFor(me.id, d);
    const on = plan.items.length > 0 && !!plan.rule;
    const leave = fullLeave.has(d);
    if (on && !leave) planTotal += planMinutes(plan.rule!);
    const holiday = period.rule ? resolveDayType(d, period.ruleAt(d) ?? period.rule, period.holidays) !== 'workday' : false;
    return { date: d, label: f.dateTime(kstDateTime(d, '12:00'), { weekday: 'short' }), red: holiday, today: isThisWeek && d === today.workDate, start: on ? hhmm(plan.rule!.startTime) : null, end: on ? hhmm(plan.rule!.endTime) : null, leave };
  });
  const todayCell = cells.find((c) => c.today && !c.leave);

  return (
      <PageShell wide>
        {/* 관리자: 시프티 홈 맨 위의 바로가기 카드 (리포트 · 출근/퇴근 누락 기록) */}
        {me.role === 'admin' && (cards.has('report') || cards.has('missing')) && (
          <nav aria-label={t('shortcuts')} className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-4">
            {([['/admin', 'report', ChartNoAxesColumn], ['/admin/missing', 'missingLink', ClipboardX]] as const).filter(([, k]) => cards.has(k === 'report' ? 'report' : 'missing')).map(([href, k, Icon]) => (
              <Link key={k} href={href} className="flex min-h-14 items-center gap-4 rounded-card border border-border bg-bg px-5 font-bold">
                <Icon aria-hidden size={22} strokeWidth={2} className="shrink-0 text-muted" />
                <span className="flex-1">{t(k)}</span>
                <ChevronRight aria-hidden size={22} className="shrink-0 text-muted" />
              </Link>
            ))}
          </nav>
        )}

        {/* PC: 왼쪽 = 오늘 근무, 오른쪽 = 이번 주·근무노트 (2026-10-06 의뢰인) · 폰: 한 칸 */}
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <div className="flex flex-col gap-3 lg:gap-4">
        <TodayCard
          dateLabel={f.dateTime(kstDateTime(today.workDate, '12:00'), { month: 'numeric', day: 'numeric', weekday: 'short' })}
          planLine={todayCell?.start ? `${todayCell.start} - ${todayCell.end}` : null}
          hasRule={!!today.rule}
          pendingPunch={pendingPunch}
          firstIn={today.firstIn}
          firstInVerified={today.firstInVerified}
          lastOut={today.lastOut}
          isOpen={today.isOpen}
          lateMinutes={today.lateMinutes}
          practice={today.practice}
          device={key ? { credentialId: key.credential_id, label: key.device_label } : null}
          phone={isPhoneUserAgent((await headers()).get('user-agent'))}
        />

        {/* 사무실 밖에서 찍혔는데 승인된 외근이 없으면 신청 안내 (②-3 7-11) */}
        {today.firstInVerified === false && !workStatusOn(today.workDate, me.id, await loadWorkRequests({ employeeId: me.id, from: today.workDate, to: today.workDate })) && (
          <Link href={`/punch/leave?workDate=${today.workDate}#work`} className="flex min-h-11 items-center justify-between gap-2 rounded-card border border-warn bg-warn-tint px-4 py-3 text-sm text-warn">
            <span>{tw('outsideHint')}</span>
            <span className="shrink-0 font-semibold">{tw('outsideLink')} ›</span>
          </Link>
        )}

        <MissingBanner items={recent.missing} />
        </div>
        <div className="flex flex-col gap-3 lg:gap-4">
        {cards.has('week') && (
          <WeekBar week={week} regularHours={LABOR.weeklyRegularLimitMin / 60} limitHours={OFFICE.weeklyLimitHours} cells={cells} planMinutes={planTotal} range={`${md(weekStart)} - ${md(addDays(weekStart, 6))}`} nav={{ prev: weekHref(-1), next: weekHref(1), thisWeek: isThisWeek }} />
        )}
        {me.role === 'admin' && cards.has('situation') && <SituationCard today={today.workDate} now={now} />}
        {cards.has('note') && <NoteBox initial={today.note?.body ?? null} />}
        </div>
        </div>
        <Link href="/punch/home-settings" className="inline-flex min-h-11 items-center justify-center gap-2 self-center text-sm font-medium text-muted">
          <Settings aria-hidden size={18} strokeWidth={1.75} />
          {t('settingsLink')}
        </Link>

      </PageShell>
  );
}
