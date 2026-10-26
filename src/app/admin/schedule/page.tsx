// 근무일정 — 전체 목록 (의뢰인 2026-10-10: 시프티의 「근무일정」 탭처럼, 출퇴근기록 목록과 같은 모양).
// 위: 검색 · 거르기 · 기간 · [내 일정]. 아래: 날짜 머리줄(그날 계획 시간 합) + 한 줄 = 시작/끝 시각 · 직무 색 막대 · 이름 · 지점/직무 · 유형 배지.
// 하루 전부 휴가인 사람은 그날 맨 위에 비행기 아이콘으로 같은 목록에 나온다. 기본 기간은 이번 주(월~일), 한 번에 31일까지.
// 그날 일정 = 날짜별로 넣은 일정(특근·잔업·하루만 다른 시각) → 없으면 평소 틀 → 없으면 회사 규칙 (lib/shifts planDay).
// + 버튼: 날짜별 일정 넣기 (여러 명 한 번에). 날짜별로 넣은 일정만 ✕로 취소할 수 있다 — 평소 틀은 「근무일정 틀」에서 바꾼다.
// 예전 주소(?d=하루)는 그 하루만 보는 것으로 받는다.
// 2026-10-15 의뢰인: 근무일정은 관리자가 전 직원의 일정(몇 시 · 어느 지점 · 정상/간주 · 휴가 · 시급/월급)을 한눈에 보고 조정하는 메뉴(결정 사항 개발-37).
//   PC: 카드에 지점 · 휴가 종류와 시간 · 급여 형태(급여 담당만). 월 보기는 늘 그달 전체(예전엔 기간 없이 열면 이번 주 2줄만 나왔다)
//   폰(개발-38): PC 표를 밀어 보지 않고 월 달력(날짜마다 근무 · 휴가 인원) + 날짜를 누르면 아래에 그날 직원 목록 (?pm=달 &pd=날짜)
import { getShiftKindNames } from '@/lib/settings';
import { withKindNames } from '@/lib/shift-kind-names';
import { Select } from '@/components/Select';
import { getMe } from '@/lib/auth';
import { Plane } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { MineBar } from '@/components/MineBar';
import { SettingsLink } from '@/components/listframe';
import { Card, Chip, PageShell } from '@/components/ui';
import { addDays, isoWeekday, weekStartOf } from '@/lib/calendar';
import { loadJobs } from '@/lib/job-data';
import { isFullDayLeave, leaveTypeName, type LeaveOnDay } from '@/lib/leave';
import { listRange } from '@/lib/list-range';
import { groupPath, groupScope, orgOptions } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { leaveDaysFor, loadPeriod, workDaysFor } from '@/lib/period-data';
import { SHIFT_COLOR_CLASS, spanMinutes } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDateTime, toKstDate } from '@/lib/time';
import { SheetOpener } from '@/components/SheetOpener';
import { resolveDayType } from '@/config/labor-rules';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CancelShift, ScheduleForm } from './ScheduleForms';
import { ScheduleDay, type DayLine } from './ScheduleDay';
import { ScheduleGrid, type GridDay, type GridRow } from './ScheduleGrid';
import { ScheduleMonth, type MonthCell } from './ScheduleMonth';
import { CATS, ScheduleBoard, type BoardPerson, type Cat } from './ScheduleBoard';

export default async function AdminSchedulePage({ searchParams }: { searchParams: Promise<{ d?: string; q?: string; g?: string; from?: string; to?: string; p?: string; v?: string; pm?: string; pd?: string; c?: string }> }) {
  const tGear = await getTranslations('frame');
  const [t, tkRaw, tc, tl, tp, f, sp, me] = await Promise.all([getTranslations('admin.schedule'), getTranslations('admin.shifts.kinds'), getTranslations('common'), getTranslations('leave'), getTranslations('admin.staffPay'), getFormatter(), searchParams, getMe()]);
  const admin = me?.role === 'admin'; // 지점관리자는 보기만 (manager-rules.ts)
  const today = toKstDate(new Date());
  const kindNames = await getShiftKindNames(today); // 유형의 보이는 이름 (2026-10-25)
  const tk = withKindNames(tkRaw, kindNames);
  const week = weekStartOf(today);
  const isDay = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  const monthOf = (ym: string) => ({ from: `${ym}-01`, to: addDays(`${addDays(`${ym}-01`, 31).slice(0, 7)}-01`, -1) });
  // 월 보기는 늘 그달 1일 ~ 말일
  const { from, to } = sp.v === 'month' ? monthOf((isDay(sp.from) ? sp.from : isDay(sp.d) ? sp.d : today).slice(0, 7)) : listRange(sp.from ?? sp.d, sp.to ?? sp.d, { from: week, to: addDays(week, 6) }, addDays);
  // 폰 월 달력: 고른 달(pm)과 날짜(pd)
  const pm = /^\d{4}-\d{2}$/.test(sp.pm ?? '') ? sp.pm! : isDay(sp.pd) ? sp.pd.slice(0, 7) : isDay(sp.d) ? sp.d.slice(0, 7) : today.slice(0, 7);
  const pmRange = monthOf(pm);
  const pdRaw = sp.pd ?? sp.d; // 예전 주소 ?d=하루 도 그 날을 고른다
  const pd = isDay(pdRaw) && pdRaw.startsWith(pm) ? pdRaw : today.startsWith(pm) ? today : pmRange.from;
  const pGridFrom = addDays(pmRange.from, -(isoWeekday(pmRange.from) % 7));
  const pGridTo = addDays(pmRange.to, 6 - (isoWeekday(pmRange.to) % 7));
  const loadFrom = from < pGridFrom ? from : pGridFrom;
  const loadTo = to > pGridTo ? to : pGridTo;
  const [data, groups, jobs, { data: named }, { data: cons }] = await Promise.all([
    loadPeriod(loadFrom, loadTo),
    loadOrgGroups(),
    loadJobs(),
    createAdminClient().from('holidays').select('the_date, label').gte('the_date', loadFrom).lte('the_date', loadTo),
    // 시급 · 월급 · 연봉 표시는 급여 담당 관리자에게만 (급여 정보)
    me?.canViewPayroll ? createAdminClient().from('payroll_contract_versions').select('employee_id, pay_type, valid_from, valid_to').eq('status', 'active').lte('valid_from', today) : Promise.resolve({ data: [] as { employee_id: string; pay_type: string; valid_from: string; valid_to: string | null }[] }),
  ]);
  const payOf = new Map((cons ?? []).filter((c) => c.valid_to === null || today < (c.valid_to as string)).map((c) => [c.employee_id as string, tp(`payType.${c.pay_type as 'MONTHLY'}`)]));
  // 그날 휴가 글: 「연차 8H」 · 「반차 4H (13:00 - 17:00)」
  const leaveText = (lv: LeaveOnDay[] | undefined) =>
    lv?.length ? lv.map((x) => `${leaveTypeName(data.leaveTypes, x.typeCode, tl)} ${t('leaveHours', { n: Math.round(x.unit * 8 * 10) / 10 })}${x.startTime ? ` (${x.startTime.slice(0, 5)} - ${(x.endTime ?? '').slice(0, 5)})` : ''}`).join(', ') : null;
  const holidayName = new Map((named ?? []).map((h) => [h.the_date as string, h.label as string]));
  const jobOf = new Map(jobs.map((j) => [j.id, j]));
  const groupOptions = orgOptions(groups);
  const g = groupOptions.some((o) => o.id === sp.g) ? sp.g! : '';
  const scope = g ? groupScope(groups, g) : null;
  const q = (sp.q ?? '').trim().slice(0, 40);

  const people = data.people.filter((p) => p.active && (!scope || (p.groupId && scope.has(p.groupId))) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const leaveOf = new Map(people.map((p) => [p.id, leaveDaysFor(data, p.id)]));
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const formDate = from === to || today < from || today > to ? from : today;

  // ── PC 달력형 (줄 = 직원, 칸 = 날짜). 주 보기 · 월 보기는 기간만 다르다 — 같은 자료를 그린다
  const month = sp.v === 'month';
  const dayView = sp.v === 'day';
  // PC 첫 화면 = 일정 현황(ScheduleBoard, 2026-10-22). 주 · 월 · 일 달력은 단추로. 엑셀 같던 목록형(?v=list)은 없앴다 — 옛 주소는 현황으로
  const weekView = sp.v === 'week';
  const board = !month && !dayView && !weekView;
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
      const lv = leaveOf.get(p.id)?.get(d);
      const leave = isFullDayLeave(lv);
      const items = leave ? [] : data.planFor(p.id, d).items;
      if (items.length) count.set(d, (count.get(d) ?? 0) + 1);
      total += items.reduce((a, it) => a + spanMinutes(it), 0);
      return {
        leave: leaveText(lv),
        items: items.map((it, i) => ({ it, href: `/admin/schedule/${p.id}/${d}?i=${i}`, color: job?.color ?? it.color, tag: it.kind !== 'none' ? tk(it.kind) : null, place: groupPath(groups, p.groupId) ?? null })),
      };
    });
    return { id: p.id, name: p.name, sub: [groupPath(groups, p.groupId), job?.name, payOf.get(p.id)].filter(Boolean).join(' / '), total: hm(total), cells };
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
      const onLeave = seen.filter((p) => (leaveOf.get(p.id)?.get(d)?.length ?? 0) > 0);
      const off = new Set(seen.filter((p) => isFullDayLeave(leaveOf.get(p.id)?.get(d))).map((p) => p.id));
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
          ...onLeave.map((p) => ({ key: `l${p.id}`, name: p.name, time: null, href: null, color: null, tag: null, sub: leaveText(leaveOf.get(p.id)?.get(d)) })),
          ...rows.map(({ p, it, i }) => ({ key: `${p.id}${i}`, name: p.name, time: `${it.startTime} - ${it.endTime}`, href: `/admin/schedule/${p.id}/${d}?i=${i}`, color: (p.jobId ? jobOf.get(p.jobId)?.color : undefined) ?? it.color, tag: it.kind !== 'none' ? tk(it.kind) : null, sub: groupPath(groups, p.groupId) ?? null })),
        ],
      });
    }
  }
  // 일 보기: 줄 = 직원, 일정은 시간 막대 (그 기간의 첫날만 그린다)
  const dayLines: DayLine[] = dayView
    ? gridRows.map((r) => ({ id: r.id, name: r.name, sub: r.sub, total: r.total, leave: r.cells[0].leave, bars: r.cells[0].items.map(({ it, href, color, tag }, i) => ({ key: `${i}${it.startTime}`, start: it.startTime, end: it.endTime, href, color, tag })) }))
    : [];
  const pickDay = today >= from && today <= to ? today : from;
  const sunday = addDays(weekStartOf(today), -1);
  const weekdayNames = [...Array(7)].map((_, i) => f.dateTime(kstDateTime(addDays(sunday, i), '12:00'), { weekday: 'short' }));
  const gridDays: GridDay[] = days.map((d) => {
    // 토요일 · 일요일 · 공휴일(주휴일 포함)은 빨간 글자와 옅은 붉은 바탕으로 구분한다 (2026-10-11 의뢰인)
    const red = isRed(d);
    return { date: d, label: f.dateTime(kstDateTime(d, '12:00'), { day: 'numeric', weekday: 'short' }), holiday: holidayName.get(d) ?? null, red, today: d === today, count: count.get(d) ?? 0 };
  });
  // ── 폰 월 달력: 날짜마다 근무 · 휴가 인원, 고른 날의 목록 ──
  const shiftYm = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
  const phoneHref = (ym: string, d: string | null) => {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries({ q, g, pm: ym, pd: d ?? '' })) if (val) qs.set(k, val);
    return `/admin/schedule?${qs}`;
  };
  const phoneCells: { d: string; inMonth: boolean; red: boolean; holiday: string | null; work: number; leave: number; onLeave: typeof gridPeople; rows: { p: (typeof gridPeople)[number]; it: ReturnType<typeof data.planFor>['items'][number]; i: number }[] }[] = [];
  for (let d = pGridFrom; d <= pGridTo; d = addDays(d, 1)) {
    const inMonth = d >= pmRange.from && d <= pmRange.to;
    const onLeave = gridPeople.filter((p) => (leaveOf.get(p.id)?.get(d)?.length ?? 0) > 0);
    const full = new Set(gridPeople.filter((p) => isFullDayLeave(leaveOf.get(p.id)?.get(d))).map((p) => p.id));
    const rows = gridPeople
      .filter((p) => !full.has(p.id))
      .flatMap((p) => data.planFor(p.id, d).items.map((it, i) => ({ p, it, i })))
      .sort((x, y) => x.it.startTime.localeCompare(y.it.startTime) || x.p.name.localeCompare(y.p.name));
    phoneCells.push({ d, inMonth, red: isRed(d), holiday: holidayName.get(d) ?? null, work: new Set(rows.map((r) => r.p.id)).size, leave: onLeave.length, onLeave, rows });
  }
  // ── 일정 현황: 하루(bd) 기준 사람마다 분류 ──
  const bd = isDay(sp.d) ? sp.d : today >= from && today <= to ? today : from;
  const restDay = isRed(bd);
  const boardPeople: BoardPerson[] = board
    ? gridPeople.map((p) => {
        const job = p.jobId ? jobOf.get(p.jobId)?.name ?? null : null;
        const base = { id: p.id, name: p.name, group: groupPath(groups, p.groupId) ?? t('board.noGroup'), job };
        const lv = leaveOf.get(p.id)?.get(bd);
        const items = data.planFor(p.id, bd).items;
        const time = items.length ? items.map((it) => `${it.startTime} - ${it.endTime}`).join(', ') : null;
        const href = items.length ? `/admin/schedule/${p.id}/${bd}?i=0` : `/admin/schedule?v=week&q=${encodeURIComponent(p.name)}&from=${weekStartOf(bd)}&to=${addDays(weekStartOf(bd), 6)}`;
        if (isFullDayLeave(lv)) return { ...base, cat: 'leave' as Cat, time: null, tag: leaveText(lv), note: null, href };
        const wk = workDaysFor(data, p.id).get(bd);
        if (wk) return { ...base, cat: 'away' as Cat, time, tag: t(`board.work.${wk}`), note: null, href };
        if (!items.length) return { ...base, cat: 'none' as Cat, time: null, tag: restDay ? t('board.rest') : null, note: null, href };
        const away = items.find((it) => it.kind === 'outside' || it.kind === 'remote');
        if (away) return { ...base, cat: 'away' as Cat, time, tag: tk(away.kind), note: away.note, href };
        const odd = items.find((it) => it.source === 'shift' || it.kind === 'holiday' || it.kind === 'extra');
        if (odd || (lv && lv.length > 0)) return { ...base, cat: 'special' as Cat, time, tag: lv && lv.length > 0 ? leaveText(lv) : odd!.kind !== 'none' && odd!.kind !== 'normal' ? tk(odd!.kind) : t('board.changed'), note: odd?.note ?? null, href };
        const deemed = items.find((it) => it.kind === 'deemed');
        return { ...base, cat: 'normal' as Cat, time, tag: deemed ? tk('deemed') : null, note: null, href };
      })
    : [];
  const pickRaw = sp.c ?? (board ? 'attention' : null);
  const pick = pickRaw === 'attention' || (CATS as readonly string[]).includes(pickRaw ?? '') ? (pickRaw as Cat | 'attention') : null;
  const boardHref = (day: string, c: Cat | 'attention' | null) => {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries({ q, g, d: day, c: c ?? 'off' })) if (val) qs.set(k, val);
    return `/admin/schedule?${qs}`;
  };
  const rangeTitle = board
    ? f.dateTime(kstDateTime(bd, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    : dayView
    ? f.dateTime(kstDateTime(from, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    : month
    ? f.dateTime(kstDateTime(from, '12:00'), { year: 'numeric', month: 'long' })
    : `${f.dateTime(kstDateTime(from, '12:00'), { year: 'numeric', month: 'long', day: 'numeric' })} - ${f.dateTime(kstDateTime(to, '12:00'), { month: 'long', day: 'numeric' })}`;
  const viewBtn = (on: boolean) => `inline-flex min-h-8 items-center border px-3 text-sm first:rounded-l-button last:rounded-r-button ${on ? 'z-1 border-primary bg-primary-tint font-bold text-primary' : 'border-border bg-bg text-muted'}`;

  // 폰도 첫 화면은 일정 현황 — 달력 단추 · 이름 검색으로 가면 달력(pm이 붙는다) (2026-10-22 의뢰인: 모바일에 PC 구조가 안 들어갔다)
  const phoneBoard = board && !sp.pm && !sp.pd && !q && !g;
  const boardEl = board ? (
    <>
      {/* 이 현황은 잡힌 일정(계획) 기준이다 — 실제 출근은 홈의 오늘 현황판 (2026-10-22 의뢰인: 모두 정상 근무라고 나와 출근한 줄 알았다) */}
      <p className="flex flex-wrap items-center gap-x-2 rounded-card bg-primary-tint px-4 py-2.5 text-sm text-primary">
        {t('board.planNote')}
        <Link href="/admin" className="font-bold underline">{t('board.planNoteLink')}</Link>
        {t('board.planNoteEnd')}
      </p>
      <ScheduleBoard
        people={boardPeople}
        pick={pick}
        pickHref={(c) => boardHref(bd, c)}
        restDay={restDay}
        labels={{
          cat: (c) => t(`board.cat.${c}`),
          total: t('board.total', { n: boardPeople.length }),
          attention: t('board.attention'),
          group: t('board.colGroup'),
          people: t('board.colPeople'),
          noGroup: t('board.noGroup'),
          empty: t('board.empty'),
          pickTitle: (what, n) => t('board.pickTitle', { what, n }),
          clear: t('board.clear'),
          restNone: t('board.restNone'),
          expandHint: t('board.hint'),
          allNormal: restDay ? t('board.allRest') : t('board.allNormal'),
        }}
      />
    </>
  ) : null;

  return (
    <PageShell wide flush>
      <h1 className="sr-only lg:hidden">{t('title')}</h1>
      {/* PC: 달력형 — 제목 · [추가하기] / ‹ › 오늘 · 기간 · 검색 · 부서 / [주 · 월] */}
      <div className="hidden flex-col gap-4 lg:flex">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}{admin && <SettingsLink href="/admin/settings?tab=work" label={tGear('item.setWork')} />}</h1>
          </div>
          <div className="flex items-center gap-2">
            {admin && (
              <>
                <Link href="/admin/shifts" className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
                  {t('toTemplates')}
                </Link>
                <SheetOpener id="schedule" label={t('add')} />
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex">
            <Link href={board ? boardHref(addDays(bd, -1), pick) : prev} aria-label={t('prevDay')} className="inline-flex size-8 items-center justify-center rounded-l-button border border-border bg-bg text-muted">
              <ChevronLeft aria-hidden size={16} />
            </Link>
            <Link href={board ? boardHref(addDays(bd, 1), pick) : next} aria-label={t('nextDay')} className="-ml-px inline-flex size-8 items-center justify-center rounded-r-button border border-border bg-bg text-muted">
              <ChevronRight aria-hidden size={16} />
            </Link>
          </div>
          <Link href={board ? boardHref(today, pick) : month ? link(`${today.slice(0, 7)}-01`, addDays(`${addDays(`${today.slice(0, 7)}-01`, 31).slice(0, 7)}-01`, -1)) : dayView ? link(today, today) : link(week, addDays(week, 6))} className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-4 text-sm text-muted">
            {t('today')}
          </Link>
          <p className="num ml-2 text-lg font-bold">{rangeTitle}</p>
          <form action="/admin/schedule" className="ml-auto flex items-center gap-2">
            {board ? (
              <input type="hidden" name="d" value={bd} />
            ) : (
              <>
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
              </>
            )}
            {sp.v && sp.v !== 'list' && <input type="hidden" name="v" value={sp.v} />}
            <input type="search" name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} maxLength={40} className="min-h-8 w-44 rounded-button border border-border bg-bg px-3" />
            <Select name="g" defaultValue={g} aria-label={t('filter')} className="min-h-8 rounded-button border border-border bg-surface px-2 text-muted">
              <option value="">{t('groupAll')}</option>
              {groupOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
            <button type="submit" className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-3 text-sm text-muted">
              {t('apply')}
            </button>
          </form>
          <div className="flex">
            <Link href={boardHref(board ? bd : pickDay, null).replace('c=off', 'c=attention')} aria-current={board ? 'page' : undefined} className={viewBtn(board)}>
              {t('viewBoard')}
            </Link>
            <Link href={link(board ? bd : pickDay, board ? bd : pickDay, 'day')} aria-current={dayView ? 'page' : undefined} className={`-ml-px ${viewBtn(dayView)}`}>
              {t('viewDay')}
            </Link>
            <Link href={link(weekStartOf(board ? bd : from), addDays(weekStartOf(board ? bd : from), 6), 'week')} aria-current={weekView ? 'page' : undefined} className={`-ml-px ${viewBtn(weekView)}`}>
              {t('viewWeek')}
            </Link>
            <Link href={link(board ? `${bd.slice(0, 7)}-01` : monthStart, board ? addDays(`${addDays(`${bd.slice(0, 7)}-01`, 31).slice(0, 7)}-01`, -1) : addDays(nextMonth, -1), 'month')} aria-current={month ? 'page' : undefined} className={`-ml-px ${viewBtn(month)}`}>
              {t('viewMonth')}
            </Link>
          </div>
        </div>
        {!data.rule && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
        {board ? (
          boardEl
        ) : month ? (
          <ScheduleMonth weekdays={weekdayNames} cells={monthCells} labels={{ more: (n) => t('more', { n }) }} />
        ) : dayView ? (
          <ScheduleDay lines={dayLines} labels={{ employee: t('colEmployee'), empty: t('emptyRange') }} />
        ) : (
          <ScheduleGrid days={gridDays} rows={gridRows} dense={false} labels={{ employee: t('colEmployee'), people: t('colPeople'), empty: t('emptyRange') }} />
        )}
        {!board && <p className="text-xs text-faint">{t('hint')}</p>}
      </div>
      <div className="flex flex-col lg:hidden" data-phone-schedule>
        <MineBar menu={tc('menu')} title={t('title')} side={{ href: '/punch/records?v=week', label: t('mine') }}>
          <form action="/admin/schedule" className="flex items-center gap-2 px-4 pb-2">
            <input type="hidden" name="pm" value={pm} />
            <input type="search" name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} maxLength={40} className="h-10 min-w-0 flex-1 rounded-button border border-border bg-bg px-3 text-sm" />
            <Select name="g" defaultValue={g} aria-label={t('filter')} className="h-10 max-w-32 rounded-button border border-border bg-surface px-2 text-sm text-muted">
              <option value="">{t('groupAll')}</option>
              {groupOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
            <button type="submit" className="h-10 shrink-0 rounded-button border border-border bg-bg px-3 text-sm text-muted">
              {t('find')}
            </button>
          </form>
        </MineBar>
        {!data.rule && <p className="mt-3 rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
        <div className="flex py-2">
          <Link href={boardHref(bd, null).replace('c=off', 'c=attention')} aria-current={phoneBoard ? 'page' : undefined} className={`flex-1 justify-center ${viewBtn(phoneBoard)}`}>{t('viewBoard')}</Link>
          <Link href={phoneHref(pm, null)} aria-current={!phoneBoard ? 'page' : undefined} className={`-ml-px flex-1 justify-center ${viewBtn(!phoneBoard)}`}>{t('viewCalendar')}</Link>
        </div>
        {phoneBoard && (
          <div className="flex flex-col gap-3 pb-4">
            <div className="flex items-center justify-center gap-1">
              <Link href={boardHref(addDays(bd, -1), pick)} aria-label={t('prevDay')} className="flex size-11 items-center justify-center text-text"><ChevronLeft aria-hidden size={20} /></Link>
              <span className="num min-w-36 text-center text-lg font-bold">{rangeTitle}</span>
              <Link href={boardHref(addDays(bd, 1), pick)} aria-label={t('nextDay')} className="flex size-11 items-center justify-center text-text"><ChevronRight aria-hidden size={20} /></Link>
              {bd !== today && <Link href={boardHref(today, pick)} className="ml-1 inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-3 text-sm text-muted">{t('today')}</Link>}
            </div>
            {boardEl}
          </div>
        )}
        <div className={phoneBoard ? 'hidden' : 'contents'}>
        <nav aria-label={t('period')} className="flex items-center justify-center gap-1 py-2">
          <Link href={phoneHref(shiftYm(pm, -1), null)} aria-label={t('prevMonth')} className="flex size-11 items-center justify-center text-text">
            <ChevronLeft aria-hidden size={20} />
          </Link>
          <span className="num min-w-28 text-center text-lg font-bold">{f.dateTime(kstDateTime(pmRange.from, '12:00'), { year: 'numeric', month: 'long' })}</span>
          <Link href={phoneHref(shiftYm(pm, 1), null)} aria-label={t('nextMonth')} className="flex size-11 items-center justify-center text-text">
            <ChevronRight aria-hidden size={20} />
          </Link>
          <Link href={phoneHref(today.slice(0, 7), today)} className="ml-1 inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-3 text-sm text-muted">
            {t('today')}
          </Link>
        </nav>
        <div className="-mx-4 border-y border-border bg-bg">
          <div className="grid grid-cols-7 border-b border-border text-center text-xs">
            {weekdayNames.map((w, i) => (
              <span key={w} className={`py-1.5 ${i === 0 ? 'text-danger' : 'text-muted'}`}>
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {phoneCells.map((c) => (
              <Link
                key={c.d}
                href={phoneHref(pm, c.d)}
                scroll={false}
                aria-current={c.d === pd ? 'date' : undefined}
                className={`flex min-h-16 flex-col items-center gap-0.5 border-b border-border py-1 ${c.d === pd ? 'bg-primary-tint' : ''} ${c.inMonth ? '' : 'opacity-40'}`}
              >
                <span className={`num flex size-6 items-center justify-center rounded-chip text-sm ${c.d === today ? 'bg-text font-bold text-on-primary' : c.red ? 'text-danger' : ''}`}>{Number(c.d.slice(8))}</span>
                {c.work > 0 && <span className="num text-xs font-semibold text-primary">{t('cellWork', { n: c.work })}</span>}
                {c.leave > 0 && <span className="num text-xs text-muted">{t('cellLeave', { n: c.leave })}</span>}
              </Link>
            ))}
          </div>
        </div>
        {(() => {
          const day = phoneCells.find((c) => c.d === pd)!;
          return (
            <section className="pt-3" data-phone-day>
              <h2 className="num flex flex-wrap items-baseline justify-between gap-x-2 px-1 pb-2 font-bold">
                <span>
                  {f.dateTime(kstDateTime(pd, '12:00'), { month: 'long', day: 'numeric', weekday: 'short' })}
                  {day.holiday && <span className="ml-1.5 text-sm font-medium text-danger">{day.holiday}</span>}
                </span>
                <span className="text-sm font-medium text-muted">{t('summary', { work: day.work, leave: day.leave })}</span>
              </h2>
              {day.rows.length === 0 && day.onLeave.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('emptyDay')}</p>}
              <ul className="-mx-4 divide-y divide-border border-y border-border bg-bg empty:hidden">
                {day.onLeave.map((p) => (
                  <li key={`leave${p.id}`} className="flex min-h-14 items-center gap-3 px-5">
                    <span className="flex w-14 shrink-0 justify-center">
                      <Plane aria-hidden size={20} className="text-muted" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-bold">{p.name}</span>
                      <span className="truncate text-sm text-muted">{leaveText(leaveOf.get(p.id)?.get(pd))}</span>
                    </span>
                  </li>
                ))}
                {day.rows.map(({ p, it, i: at }) => {
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
                        <Link href={`/admin/schedule/${p.id}/${pd}?i=${at}`} className="font-bold">
                          {p.name}
                          {payOf.get(p.id) && <span className="ml-1.5 text-xs font-normal text-faint">{payOf.get(p.id)}</span>}
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
          );
        })()}
        {admin && (
          <div className="flex justify-end px-1 pt-2 text-sm">
            <Link href="/admin/shifts" className="inline-flex min-h-11 items-center font-medium text-primary">
              {t('toTemplates')} ›
            </Link>
          </div>
        )}
        </div>
      </div>
      {admin && (
        <>
      <AddSheet id="schedule" title={t('add')} modal wide>
          <Card className="flex flex-col gap-3">
            <h2 className="hidden text-sm font-medium text-muted lg:block">{t('add')}</h2>
            <ScheduleForm
              kindNames={kindNames}
              key={formDate}
              sheet="schedule"
              breaks={data.rule ? [...(data.rule.breakStart && data.rule.breakEnd ? [{ start: data.rule.breakStart.slice(0, 5), end: data.rule.breakEnd.slice(0, 5) }] : []), ...(data.rule.extraBreaks ?? []).map((b) => ({ start: b.start.slice(0, 5), end: b.end.slice(0, 5) }))] : []}
              date={formDate}
              templates={data.templates.map((x) => ({ id: x.id, name: x.name, startTime: x.startTime, endTime: x.endTime, kind: x.kind }))}
              people={data.people.filter((p) => p.active && !p.employeeNo?.startsWith('e2e-')).map((p) => ({ id: p.id, name: p.name, group: groupPath(groups, p.groupId) }))}
            />
          </Card>
        </AddSheet>
      <Fab label={t('add')} items={[{ id: 'schedule', label: t('add') }]} />
        </>
      )}
    </PageShell>
  );
}
