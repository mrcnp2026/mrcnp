// ① 홈 — 오늘 현황판(7-9) + 처리할 일 요약 (마스터 5장). 관리자가 폰을 열었을 때 첫 화면에서 끝나야 한다.
// 홈에서 승인하지 않는다 — 요약을 누르면 처리함으로 간다 (5장 규칙 2).
// 연습 기록은 기본으로 빼고(4-6), 연습 기간에는 "연습 기록으로 보기"로 따로 볼 수 있다 (연습 배너가 항상 붙는다).
import { ChevronRight, Inbox, NotebookPen, TriangleAlert } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Pager, pageOf } from '@/components/Pager';
import { Card, CardTitle, PageShell } from '@/components/ui';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays, weekStartOf } from '@/lib/calendar';
import { findMissingPunches } from '@/lib/missing-punch';
import { weekTotalMinutes } from '@/lib/period';
import { daysFor, loadPeriod, pendingCounts, syncOvertimeRequests } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDateTime, toKstDate } from '@/lib/time';
import { buildTodayBoard, type BoardPerson } from '@/lib/today';
import { AutoRefresh } from './AutoRefresh';
import { BoardView } from './BoardView';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ live?: string; np?: string }> }) {
  const t = await getTranslations('admin.home');
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
  const inCount = active.length - board.absent.length - board.off.length;
  const hhmm = (d: Date) => fmt.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const legend = data.rule
    ? {
        deadline: hhmm(new Date(kstDateTime(today, data.rule.startTime).getTime() + data.rule.lateGraceMin * 60_000)),
        end: hhmm(kstDateTime(today, data.rule.endTime)),
      }
    : null;
  const todo = [
    { key: 'pendingOvertime', n: counts.overtime, href: '/admin/inbox#overtime' },
    { key: 'pendingCorrections', n: counts.corrections, href: '/admin/inbox#corrections' },
    { key: 'missing', n: missingPeople, href: '/admin/records' },
  ] as const;

  return (
    <PageShell>
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

      <Card className="flex flex-col p-0 py-2">
        <div className="px-5 pt-2">
          <CardTitle icon={Inbox}>{t('todo')}</CardTitle>
        </div>
        <ul>
          {todo.map((x) => (
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

      <BoardView board={board} total={active.length} limitMinutes={OFFICE.weeklyLimitHours * 60} cautionMinutes={OFFICE.weeklyCautionHours * 60} colored={OFFICE.workplaceSize === '5_or_more'} legend={legend} />

      <Card className="flex scroll-mt-16 flex-col gap-2">
        <span id="notes" />
        <CardTitle icon={NotebookPen} aside={<span className="num text-sm text-faint">{notes.length}</span>}>
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
        <p className="text-xs text-faint">{t('notesHint')}</p>
      </Card>

    </PageShell>
  );
}
