// PC 직원 모드의 첫 화면 「스케줄」 — 시프티 PC 직원 모드 홈의 구성 (2026-10-11 의뢰인 스샷 `스샷/직원모드 홈.png`):
//   왼쪽 좁은 칸 = 내 근로 통계 · 이번 주 근로(2026-10-22 휴가 통계 카드는 뺌) / 오른쪽 = [‹][›][오늘] 달 이름 · 요청 버튼들 · 월 달력(일~토).
// PC에서는 출퇴근을 찍지 않는다(확정-13) — 그래서 폰 홈의 출근/퇴근 카드 대신 이 화면을 보인다. 폰에서는 보이지 않는다.
// 디자인(2026-10-16 의뢰인: 「달력이 예쁘지 않다, 톤 · 결이 다르다」): 견본 「나 · 파랑」(개발-22)에 맞춰 — 카드 하나 · 가는 선 · 주말은 칸을 칠하지 않고 날짜 색만 · 버튼은 파랑 하나 + 테두리.
// 2026-10-19 셋째: 견본처럼 「제목 + 한 줄 설명」 아래에 「‹ 2026년 10월 ›」 한 덩어리 조절 칸 · 일정 글자를 읽히게(연회색 → 회색) · 칸 높이 줄임.
// 2026-10-17 다시: 칸마다 같은 파랑 딱지가 반복되던 것을 — 실제 출퇴근(굵게) + 상태 딱지(지각 · 퇴근 누락 · 기록 없음)를 위에, 일정은 회색 글자로. 세로선 · 오늘 칸 색칠 없음(견본의 표처럼 가로선만).
import { getShiftKindNames } from '@/lib/settings';
import { withKindNames } from '@/lib/shift-kind-names';
import { CalendarPlus, ChevronLeft, ChevronRight, MapPinned, Plane } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CountUp } from '@/components/CountUp';
import { resolveDayType } from '@/config/labor-rules';
import { addDays, isoWeekday } from '@/lib/calendar';
import { isFullDayLeave, leaveTypeName } from '@/lib/leave';
import { SheetButton } from '@/components/Fab';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { WeekHoursCard } from './WeekHoursCard';
import { daysFor, leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { SHIFT_COLOR_CLASS, planMinutes } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { judgeLateness } from '@/lib/lateness';
import { kstDateTime } from '@/lib/time';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function StaffDesk({ meId, today, month }: { meId: string; today: string; month?: string }) {
  const [t, tkRaw, tl, f] = await Promise.all([getTranslations('desk'), getTranslations('admin.shifts.kinds'), getTranslations('leave'), getFormatter()]);
  const tk = withKindNames(tkRaw, await getShiftKindNames(today));
  const ym = month && MONTH.test(month) ? month : today.slice(0, 7);
  const first = `${ym}-01`;
  const [y, m] = ym.split('-').map(Number);
  const last = `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  // 달력은 일요일부터 — 앞뒤 달의 날도 칸을 채운다
  const gridStart = addDays(first, -(isoWeekday(first) % 7));
  const gridEnd = addDays(last, 6 - (isoWeekday(last) % 7));
  const [period, types, { data: named }] = await Promise.all([
    loadPeriod(gridStart, gridEnd),
    loadAllLeaveTypes(),
    createAdminClient().from('holidays').select('the_date, label').gte('the_date', gridStart).lte('the_date', gridEnd),
  ]);
  const holidayName = new Map((named ?? []).map((h) => [h.the_date as string, h.label as string]));
  const leave = leaveDaysFor(period, meId);
  const rows = daysFor(period, meId, first, last);

  const byDate = new Map(daysFor(period, meId, gridStart, gridEnd).map((x) => [x.workDate, x]));
  const startsOn = period.people.find((p) => p.id === meId)?.startsOn ?? null;
  const clock = (dt: Date) => f.dateTime(dt, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const days = [...Array(Math.round((Date.parse(gridEnd) - Date.parse(gridStart)) / 86400000) + 1)].map((_, i) => addDays(gridStart, i));
  let planned = 0;
  let leaveUnits = 0;
  const cells = days.map((d) => {
    const plan = period.planFor(meId, d);
    const onLeave = leave.get(d) ?? [];
    const off = isFullDayLeave(onLeave);
    const inMonth = d >= first && d <= last;
    if (inMonth && plan.items.length > 0 && plan.rule && !off) planned += planMinutes(plan.rule);
    if (inMonth) leaveUnits += onLeave.reduce((a, x) => a + x.unit, 0);
    const wd = isoWeekday(d);
    const holiday = period.rule ? resolveDayType(d, period.ruleAt(d) ?? period.rule, period.holidays) === 'holiday' : false;
    // 실제 출퇴근 (간주 근무일은 일정 시각이라 「간주」로만 적는다)
    const r = byDate.get(d);
    const pairs = r && !r.deemed ? r.pairs : [];
    const firstIn = pairs.find((x) => x.in)?.in ?? null;
    const open = pairs.some((x) => x.in && !x.out);
    const lastOut = open ? null : ([...pairs].reverse().find((x) => x.out)?.out ?? null);
    const rule = period.ruleFor(meId, d) ?? period.rule;
    const late = !!firstIn && r?.dayType === 'workday' && !!rule && judgeLateness({ punchedAt: firstIn, workDate: d, rule, isHoliday: false }).verdict === 'late';
    const missing = inMonth && d < today && !off && plan.items.length > 0 && !r?.deemed && pairs.length === 0 && (!startsOn || d >= startsOn);
    return { d, inMonth, items: off ? [] : plan.items, onLeave, firstIn, lastOut, open: open && d < today, late, missing, deemed: !!r?.deemed, red: wd === 7 || holiday || holidayName.has(d), sat: wd === 6 && !holiday && !holidayName.has(d), name: holidayName.get(d) ?? null };
  });
  const sum = (k: 'netMinutes' | 'payableMinutes') => rows.reduce((a, r) => a + r[k], 0);
  const over = rows.reduce((a, r) => a + r.overtimeMinutes + r.holidayMinutes, 0);
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const n = (v: number) => f.number(v, { maximumFractionDigits: 4 });
  const shift = (k: number) => {
    const dt = new Date(Date.UTC(y, m - 1 + k, 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const href = (v: string) => (v === today.slice(0, 7) ? '/punch' : `/punch?m=${v}`);
  const weekdays = [...Array(7)].map((_, i) => f.dateTime(kstDateTime(addDays(gridStart, i), '12:00'), { weekday: 'short' }));
  const stat = 'flex items-baseline justify-between gap-3 py-2 text-sm';
  const tool = 'inline-flex h-9 items-center gap-1.5 rounded-button px-3.5 text-sm font-semibold whitespace-nowrap';
  const card = 'rounded-card border border-border bg-bg p-5 shadow-card';
  const tag = (tone: 'warn' | 'danger' | 'neutral') => `rounded-button px-1.5 py-0.5 text-xs font-semibold ${tone === 'warn' ? 'bg-warn-tint text-warn' : tone === 'danger' ? 'bg-danger-tint text-danger' : 'bg-surface text-muted'}`;

  return (
    <div className="hidden lg:flex lg:flex-col lg:gap-5">
      {/* 제목 · 달 · 요청 버튼은 위 한 줄 — 아래 왼쪽 카드와 달력은 위 · 아래가 같은 줄에 맞는다 (2026-10-22 의뢰인) */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="pt-1 pb-2 text-sm text-muted">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 견본의 달 고르기: 테두리 하나 안에 ‹ 달 › */}
          <div className="inline-flex h-9 items-center rounded-button border border-border bg-bg">
            <Link href={href(shift(-1))} aria-label={t('prev')} className="flex h-full w-9 items-center justify-center text-muted hover:text-text"><ChevronLeft aria-hidden size={16} /></Link>
            <span className="num px-1 text-sm font-semibold">{f.dateTime(kstDateTime(first, '12:00'), { year: 'numeric', month: 'long' })}</span>
            <Link href={href(shift(1))} aria-label={t('next')} className="flex h-full w-9 items-center justify-center text-muted hover:text-text"><ChevronRight aria-hidden size={16} /></Link>
          </div>
          {ym !== today.slice(0, 7) && <Link href="/punch" className={`${tool} border border-border bg-bg font-medium! text-muted hover:bg-surface`}>{t('today')}</Link>}
          <div className="ml-auto flex flex-wrap gap-2">
            <Link href="/punch/leave?new=work" className={`${tool} border border-border bg-bg text-text hover:bg-surface`}><MapPinned aria-hidden size={16} />{t('reqWork')}</Link>
            <Link href="/punch/leave?new=leave" className={`${tool} border border-border bg-bg text-text hover:bg-surface`}><Plane aria-hidden size={16} />{t('reqLeave')}</Link>
            <SheetButton sheet="shift" className={`${tool} bg-primary text-on-primary`}><CalendarPlus aria-hidden size={16} />{t('reqShift')}</SheetButton>
          </div>
        </div>
        {!period.rule && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{t('noRule')}</p>}
      </div>
      <div className="grid flex-1 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
      <aside className="flex flex-col gap-4">
        {/* 이번 달 근무 · 연차 (2026-10-22 의뢰인: 「시프티 잔재 · 숫자와 그래프가 움직이게」 — 글자 목록 · 작은 표였다) */}
        <section className={`${card} flex flex-col gap-3`}>
          <div>
            <h2 className="font-bold">{t('workStats')}</h2>
            <p className="num pt-0.5 text-xs text-faint">{first.replaceAll('-', '.')} - {last.replaceAll('-', '.')}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-muted">{t('actual')}</span>
              <CountUp value={hm(sum('netMinutes'))} className="num text-2xl font-bold" />
            </p>
            {/* 일정 대비 실제 근무 — 막대가 차오른다 */}
            <div aria-hidden className="h-2 overflow-hidden rounded-chip bg-surface">
              <span className="fx-grow-x block h-full rounded-chip bg-primary" style={{ width: `${planned > 0 ? Math.min(100, (sum('netMinutes') / planned) * 100) : 0}%` }} />
            </div>
            <p className="num text-right text-xs text-faint">{t('planned')} {hm(planned)}</p>
          </div>
          <dl className="num flex flex-col gap-1 border-t border-border pt-3">
            <div className={stat}><dt className="text-muted">{t('payable')}</dt><dd className="font-semibold"><CountUp value={hm(sum('payableMinutes'))} /></dd></div>
            <div className={stat}><dt className="text-muted">{t('overtime')}</dt><dd className={`font-semibold ${over > 0 ? 'text-danger' : 'text-faint'}`}>{over > 0 ? <CountUp value={hm(over)} /> : '–'}</dd></div>
            <div className={stat}><dt className="text-muted">{t('leaveUsed')}</dt><dd className={`font-semibold ${leaveUnits > 0 ? '' : 'text-faint'}`}>{leaveUnits > 0 ? <CountUp value={t('days', { n: n(leaveUnits) })} /> : '–'}</dd></div>
          </dl>
        </section>
        {/* 이번 주 근로 — 왼쪽 칸이 달력 높이까지 차도록 이 카드가 남는 높이를 가져간다 (2026-10-22 의뢰인: 왼쪽 두 카드 높이가 어색하다) */}
        <WeekHoursCard meId={meId} today={today} />
      </aside>

      <section className="flex min-w-0 flex-col">
        {/* 달력은 왼쪽 카드 줄과 같은 높이까지 늘어난다 — 칸이 넉넉해지고 두 칸의 아래가 맞는다 (2026-10-22) */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-card border border-border bg-bg shadow-card">
          <div className="grid grid-cols-7 border-b border-border">
            {weekdays.map((w, i) => (
              <div key={w} className={`px-3 py-2.5 text-left text-xs font-semibold ${i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-muted'}`}>{w}</div>
            ))}
          </div>
          <div className="grid flex-1 auto-rows-fr grid-cols-7">
            {cells.map((c, i) => (
              <div key={c.d} className={`flex min-h-24 flex-col gap-1 px-3 py-2 ${i >= 7 ? 'border-t border-border' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`num flex h-6 min-w-6 items-center justify-center rounded-chip px-1 text-sm ${c.d === today ? 'bg-primary font-bold text-on-primary' : !c.inMonth ? 'text-faint opacity-60' : c.red ? 'font-semibold text-danger' : c.sat ? 'font-semibold text-primary' : 'font-semibold text-text'}`}>{c.d.endsWith('-01') ? `${Number(c.d.slice(5, 7))}/1` : Number(c.d.slice(8))}</span>
                  {c.name && <span className="truncate text-xs text-danger">{c.name}</span>}
                </div>
                <div className={`flex flex-col gap-1 ${c.inMonth ? '' : 'opacity-50'}`}>
                  {/* ① 실제 출퇴근 — 가장 먼저, 굵게 */}
                  {c.firstIn && (
                    <p className="num text-sm font-semibold text-text">
                      {clock(c.firstIn)} – {c.lastOut ? clock(c.lastOut) : ''}
                    </p>
                  )}
                  {/* ② 상태 딱지 — 견본의 작은 색 딱지 */}
                  {(c.late || c.open || c.missing || c.deemed) && (
                    <p className="flex flex-wrap gap-1">
                      {c.late && <span className={tag('warn')}>{t('tagLate')}</span>}
                      {c.open && <span className={tag('danger')}>{t('tagNoOut')}</span>}
                      {c.missing && <span className={tag('danger')}>{t('tagNone')}</span>}
                      {c.deemed && <span className={tag('neutral')}>{t('tagDeemed')}</span>}
                    </p>
                  )}
                  {c.onLeave.map((l) => (
                    <p key={l.requestId} className="flex items-center gap-1 text-xs font-medium text-primary">
                      <Plane aria-hidden size={12} className="shrink-0" />
                      <span className="truncate">{leaveTypeName(types, l.typeCode, tl)}</span>
                    </p>
                  ))}
                  {/* ③ 일정 — 회색 글자 (칸마다 같은 파랑 딱지가 반복되던 것) */}
                  {c.items.map((it) => (
                    <p key={`${it.shiftId ?? it.source}${it.startTime}`} className="num flex items-center gap-1.5 text-xs text-muted">
                      {it.color && <span aria-hidden className={`size-1.5 shrink-0 rounded-chip ${SHIFT_COLOR_CLASS[it.color]}`} />}
                      <span className="truncate">{it.startTime} – {it.endTime}</span>
                      {it.kind !== 'none' && <span className="shrink-0">{tk(it.kind)}</span>}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </section>
      </div>
    </div>
  );
}
