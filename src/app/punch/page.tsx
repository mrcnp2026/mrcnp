// 직원 홈 (PWA 진입점). 2026-10-10 의뢰인: 시프티 홈처럼 — (관리자) 바로가기 카드 → 「오늘 근무」 → 미기록 안내 → 「이번주 근무」(요일 7칸 + 계획 막대) → 근무노트.
// 상단 바·하단 탭은 layout.tsx(components/AppFrame).
import { ChartNoAxesColumn, ChevronRight, ClipboardX } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
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
import { NewsCard, type NewsItem } from './NewsCard';
import { visibleNoticesNow } from '@/lib/notices';
import { loadInbox } from '@/lib/work-messages';
import { LocationPrompt } from '@/components/LocationPrompt';
import { PushToggle } from '@/components/PushToggle';
import { Fab } from '@/components/Fab';
import { SituationCard } from './SituationCard';
import { StaffDesk } from './StaffDesk';
import { TodayCard } from './TodayCard';
import { WeekBar, type WeekCell } from './WeekBar';
import { switchOn } from '@/lib/switches';

export default async function PunchPage({ searchParams }: { searchParams: Promise<{ w?: string; m?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('home');
  const tw = await getTranslations('work');
  const tr = await getTranslations('requests'); // 홈의 + 단추 (요청 종류)
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
  // 주 근무 시간 = 실제 근로시간(휴게를 빼고, 일정 전 일찍 온 시간은 빼고) — 「내 근태현황」 · 관리자 「주 52시간 관리」와 같은 숫자.
  // 2026-10-17: 예전에는 출근~퇴근을 그대로 더해(점심 포함) 52시간이 안 된 사람에게 「한도 초과」가 떴다(내 근태현황은 48시간 40분)
  const week = !period.rule
    ? today.week
    : weeklyHours({
        weekStart,
        dailyWork: daysFor(period, me.id).map((d) => ({
          workDate: d.workDate,
          netMinutes: d.netMinutes,
          overtimeMinutes: d.overtimeMinutes + d.holidayMinutes,
        })),
        is5OrMore: today.week?.colored ?? true,
      });
  // 통합설정 › 고급 옵션 「홈 카드」를 끄면 각자 끈 카드를 무시하고 기본 카드를 모두 보인다 (2026-10-19)
  const cards = homeCardsOn((await switchOn('advanced.homeCards')) ? (await cookies()).get(HOME_COOKIE)?.value : undefined);
  const weekHref = (n: number) => {
    const w = addDays(weekStart, 7 * n);
    return w < addDays(thisWeek, -7 * WEEKS_BACK) || w > addDays(thisWeek, 7 * WEEKS_AHEAD) ? null : w === thisWeek ? '/punch' : `/punch?w=${w}`;
  };
  const fullLeave = fullLeaveSet(leaveDaysFor(period, me.id));
  const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;
  let planTotal = 0;
  // 요일 칸에 실제 출근 · 퇴근 시각 (2026-10-18 의뢰인: 일정보다 실제로 일한 것을) — 아직 안 찍은 날은 일정을 흐리게
  const worked = new Map(daysFor(period, me.id).map((d) => [d.workDate, d]));
  const hm = (x: Date | null | undefined) => (x ? f.dateTime(x, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul' }) : null);
  const cells: WeekCell[] = [...Array(7)].map((_, i) => {
    const d = addDays(weekStart, i);
    const plan = period.planFor(me.id, d);
    const on = plan.items.length > 0 && !!plan.rule;
    const leave = fullLeave.has(d);
    if (on && !leave) planTotal += planMinutes(plan.rule!);
    const holiday = period.rule ? resolveDayType(d, period.ruleAt(d) ?? period.rule, period.holidays) !== 'workday' : false;
    const w = worked.get(d);
    const pairs = (w?.deemed ? w.punchedPairs : w?.pairs) ?? [];
    const firstIn = pairs.find((p) => p.in)?.in ?? null;
    const lastOut = [...pairs].reverse().find((p) => p.out)?.out ?? null;
    return {
      date: d, label: f.dateTime(kstDateTime(d, '12:00'), { weekday: 'short' }), red: holiday, today: isThisWeek && d === today.workDate,
      start: on ? hhmm(plan.rule!.startTime) : null, end: on ? hhmm(plan.rule!.endTime) : null, leave,
      inAt: hm(firstIn), outAt: hm(lastOut), working: !!firstIn && pairs.some((p) => p.in && !p.out),
    };
  });
  const todayCell = cells.find((c) => c.today && !c.leave);

  // 새 소식: 공지 + 사내게시판 글 (안 읽은 것 먼저 3줄 — NewsCard)
  const [notices, inbox] = cards.has('news') ? await Promise.all([visibleNoticesNow(me.id, await getLocale()), loadInbox(me, 10)]) : [[], []];
  const news: NewsItem[] = [
    ...notices.map((n) => ({ id: n.id, kind: 'notice' as const, title: n.display.title, at: n.startsAt.toISOString(), unread: !n.confirmed, href: `/punch/notices?open=${n.id}` })),
    ...inbox.map((m) => ({ id: m.id, kind: 'board' as const, title: m.title, at: m.createdAt, unread: !m.readAt, href: `/punch/messages/${m.id}` })),
  ];

  const approvedAwayToday = workStatusOn(today.workDate, me.id, await loadWorkRequests({ employeeId: me.id, from: today.workDate, to: today.workDate })) !== null;
  // PC에서는 시프티 직원 모드처럼 「스케줄」(통계 + 월 달력)을 보인다 — 폰 브라우저에는 만들지 않는다(자료를 두 번 읽지 않게)
  const phone = isPhoneUserAgent((await headers()).get('user-agent'));

  return (
      <PageShell wide>
        {!phone && <StaffDesk meId={me.id} today={today.workDate} month={(await searchParams).m} />}
        <div className="flex flex-col gap-3 lg:hidden">
        {/* 2026-10-15 의뢰인: 직원 홈은 본인 업무만 — 리포트 · 누락 기록 바로가기와 회사 「현재 근무 상황」은 관리자 모드 「오늘 현황」에 있다(중복 제거) */}
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
          reason={!isThisWeek ? undefined : (() => {
            const plan = period.planFor(me.id, today.workDate);
            const r = plan.items.length > 0 ? plan.rule : null;
            const base = period.ruleAt(today.workDate) ?? period.rule;
            return {
              today: today.workDate,
              planStart: r ? hhmm(r.startTime) : null,
              planEnd: r ? hhmm(r.endTime) : null,
              graceMin: r?.lateGraceMin ?? 0,
              offDay: base ? resolveDayType(today.workDate, base, period.holidays) !== 'workday' : false,
              overtimeGraceMin: OFFICE.overtimeReviewThresholdMin,
              note: today.note?.body ?? null,
              canAskWork: !approvedAwayToday,
            };
          })()}
        />

        {/* 사무실 밖에서 찍혔는데 승인된 외근이 없으면 신청 안내 (②-3 7-11) */}
        {today.firstInVerified === false && !workStatusOn(today.workDate, me.id, await loadWorkRequests({ employeeId: me.id, from: today.workDate, to: today.workDate })) && (
          <Link href={`/punch/leave?workDate=${today.workDate}#work`} className="flex min-h-11 items-center justify-between gap-2 rounded-card border border-warn bg-warn-tint px-4 py-3 text-sm text-warn">
            <span>{tw('outsideHint')}</span>
            <span className="shrink-0 font-semibold">{tw('outsideLink')} ›</span>
          </Link>
        )}

        <MissingBanner items={recent.missing} />
        {/* 위치가 허용돼 있지 않으면 허용 안내 한 줄 (2026-10-18 의뢰인) */}
        <LocationPrompt />
        {/* 폰 알림이 꺼져 있으면 켜기 안내 한 줄 (2026-10-16: 출근 · 퇴근을 잊으면 본인에게 알림) */}
        <PushToggle mode="prompt" audience="employee" />
        {/* 요청은 오른쪽 아래 + 단추에서 (2026-10-18 의뢰인: 출근 단추 옆 「요청」을 빼고 다른 화면처럼) — 요청 화면의 + 와 같은 목록 */}
        <Fab
          label={tr('new')}
          items={[
            { id: 'shift', label: tr('newShift'), href: '/punch/schedule/request' },
            { id: 'correction', label: tr('newCorrection'), href: '/punch/corrections?new=1' },
            { id: 'leave', label: tr('newLeave'), href: '/punch/leave?new=leave' },
            { id: 'work', label: tr('newWork'), href: '/punch/leave?new=work' },
          ]}
        />
        </div>
        <div className="flex flex-col gap-3 lg:gap-4">
        {cards.has('week') && (
          <WeekBar week={week} regularHours={LABOR.weeklyRegularLimitMin / 60} limitHours={OFFICE.weeklyLimitHours} cells={cells} planMinutes={planTotal} range={`${md(weekStart)} - ${md(addDays(weekStart, 6))}`} nav={{ prev: weekHref(-1), next: weekHref(1), thisWeek: isThisWeek }} limitNotice={await switchOn('report.week52')} />
        )}
        {cards.has('news') && <NewsCard items={news} />}
        </div>
        </div>
        {/* 「홈 설정」은 내 계정 화면으로 옮겼다 (2026-10-18 의뢰인: 홈 맨 아래에 따로 떠 있어 어색했다) */}
        </div>

      </PageShell>
  );
}
