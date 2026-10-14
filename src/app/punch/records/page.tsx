// 직원 "내 기록" — 월 단위 + 월 이동(최근 6개월) (2026-10-02 의뢰인: 14일만 보이고 시간 표시가 지저분하다).
// 하루 한 줄: "출근 09:00 → 퇴근 20:00" / 근무 중이면 "출근 10:56 · 근무 중". 정정된 날은 "정정됨" 칩 (R-10-8: 상태를 숨기지 않는다).
// 연장 확인 요청이 대기 중이면 사유를 적을 수 있다 (6장: 서버 API로만).
import { Check, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fab } from '@/components/Fab';
import { MineBar } from '@/components/MineBar';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { judgeLateness } from '@/lib/lateness';
import { isYearMonth, monthRange } from '@/lib/month-data';
import { daysFor, loadPeriod } from '@/lib/period-data';
import { addDays, weekStartOf } from '@/lib/calendar';
import { kstDateTime, toKstDate } from '@/lib/time';
import { ReasonForm } from './ReasonForm';

const MONTHS_BACK = 6; // 직원이 볼 수 있는 과거 (보존은 3년 — 그 이상은 관리자에게 요청)

function shift(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default async function MyRecordsPage({ searchParams }: { searchParams: Promise<{ m?: string; x?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('records');
  const th = await getTranslations('home');
  const tm = await getTranslations('common');
  const tc = await getTranslations('corrections');
  const f = await getFormatter();
  const now = new Date();
  const today = toKstDate(now);
  const thisMonth = today.slice(0, 7);
  const oldest = shift(thisMonth, -(MONTHS_BACK - 1));
  const sp = await searchParams;
  const ym = isYearMonth(sp.m) && sp.m <= thisMonth && sp.m >= oldest ? sp.m : thisMonth;
  const { from, to } = monthRange(ym);
  const upTo = to < today ? to : today;

  const data = await loadPeriod(from, to, OFFICE.practiceMode);
  const days = data.rule ? daysFor(data, me.id, from, upTo) : [];
  const events = data.events.filter((e) => e.employeeId === me.id);
  const corrections = data.corrections.filter((c) => c.employeeId === me.id);
  const overtime = data.overtime.filter((o) => o.employeeId === me.id);

  const hm = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dur = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const shown = [...days].reverse().filter((d) => d.pairs.length > 0 || events.some((e) => e.workDate === d.workDate));
  const worked = days.filter((d) => d.pairs.some((p) => p.in));
  const total = days.reduce((a, d) => a + d.netMinutes, 0);
  const overtimeTotal = days.reduce((a, d) => a + d.overtimeMinutes + d.holidayMinutes, 0);
  // 지각 — 관리자 월간 집계(monthly.ts)와 같은 판정: 근무일의 첫 출근만, 기준 시각 + 유예 (2026-10-02 의뢰인: 직원도 자기 지각을 보게)
  const lateOf = new Map<string, number>();
  for (const d of days) {
    const firstIn = d.pairs.map((x) => x.in).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime())[0];
    const rule = data.ruleFor(me.id, d.workDate);
    if (!firstIn || d.dayType !== 'workday' || !rule) continue;
    const l = judgeLateness({ punchedAt: firstIn, workDate: d.workDate, rule, isHoliday: false });
    if (l.verdict === 'late') lateOf.set(d.workDate, l.lateMinutes);
  }
  const lateMin = [...lateOf.values()].reduce((a, b) => a + b, 0);
  // 표(PC)와 카드(폰)가 같은 값을 쓰도록 날짜별 값을 한 번만 계산한다
  const rows = shown.map((d) => {
    const ins = d.pairs.map((p) => p.in).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
    const outs = d.pairs.map((p) => p.out).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
    return {
      d,
      firstIn: ins[0],
      lastOut: outs[outs.length - 1],
      open: d.pairs.some((p) => p.in && !p.out),
      req: overtime.find((o) => o.workDate === d.workDate),
      corrected: corrections.some((c) => c.workDate === d.workDate && c.status === 'approved'),
      pendingCorr: corrections.some((c) => c.workDate === d.workDate && c.status === 'pending'),
    };
  });

  // PC: 시프티 직원 모드의 「내 출퇴근기록」 — 왼쪽 좁은 칸(달 · 요약 · 기록 종류 체크) + 오른쪽 표 (2026-10-11 의뢰인 스샷 `스샷/직원모드 출퇴근기록.png`)
  // 기록 종류 체크는 주소의 ?x=(숨길 종류, 쉼표)로 — 누르면 그 종류를 숨기거나 다시 보인다
  const CATS = ['normal', 'late', 'noOut', 'deemed'] as const;
  type Cat = (typeof CATS)[number];
  const CAT_KEY = { normal: 'pc.catNormal', late: 'pc.catLate', noOut: 'pc.catNoOut', deemed: 'pc.catDeemed' } as const;
  const CAT_COLOR: Record<Cat, string> = { normal: 'border-ok bg-ok', late: 'border-warn bg-warn', noOut: 'border-danger bg-danger', deemed: 'border-primary bg-primary' };
  const hidden = new Set((sp.x ?? '').split(',').filter((c): c is Cat => (CATS as readonly string[]).includes(c)));
  const catOf = (r: (typeof rows)[number]): Cat => (r.d.deemed ? 'deemed' : r.open && r.d.workDate !== today ? 'noOut' : lateOf.has(r.d.workDate) ? 'late' : 'normal');
  const catCount = (c: Cat) => rows.filter((r) => catOf(r) === c).length;
  const toggle = (c: Cat) => {
    const next = new Set(hidden);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    const u = new URLSearchParams();
    if (ym !== thisMonth) u.set('m', ym);
    if (next.size) u.set('x', [...next].join(','));
    return `/punch/records${u.size ? `?${u}` : ''}`;
  };
  const pcRows = rows.filter((r) => !hidden.has(catOf(r)));
  // 주간 누적 (2026-10-14 직원 화면 보강): 표를 주(월~일)로 묶고 주마다 근무 · 급여용 시간 합계 줄. 합계는 숨긴 종류도 포함한 그 주의 전부(지금 근무 중인 오늘은 뺀다)
  const weeks = [...new Set(pcRows.map((r) => weekStartOf(r.d.workDate)))];
  const weekSum = (w: string) =>
    rows.filter((r) => weekStartOf(r.d.workDate) === w && !(r.open && r.d.workDate === today)).reduce((a, r) => ({ net: a.net + r.d.netMinutes, pay: a.pay + r.d.payableMinutes }), { net: 0, pay: 0 });
  const md = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'numeric', day: 'numeric' });
  const diff = (at: Date | undefined, date: string, hhmm: string | undefined) => (at && hhmm ? Math.round((at.getTime() - kstDateTime(date, hhmm).getTime()) / 60000) : null);
  const diffText = (v: number | null) => (v === null || v === 0 ? '' : `${v > 0 ? '+' : '-'} ${dur(Math.abs(v))}`);

  return (
    <PageShell wide>
      <MineBar menu={tm('menu')} title={t('title')} side={me.role === 'admin' ? { href: '/admin/records/list', label: t('title') } : undefined} />
      <header className="flex items-center justify-between gap-2 lg:hidden">
        <h1 className="sr-only lg:not-sr-only lg:text-2xl lg:font-extrabold lg:tracking-tight">{t('title')}</h1>
        <nav className="flex shrink-0 items-center" aria-label={t('month')}>
          {ym > oldest ? (
            <Link href={`?m=${shift(ym, -1)}`} aria-label={t('prev')} className="flex size-11 shrink-0 items-center justify-center text-primary">
              <ChevronLeft aria-hidden size={22} strokeWidth={1.75} />
            </Link>
          ) : (
            <span className="size-11 shrink-0" />
          )}
          <span className="num min-w-24 text-center text-xl font-semibold">{f.dateTime(new Date(`${ym}-15T12:00:00+09:00`), { year: 'numeric', month: 'long' })}</span>
          {ym < thisMonth ? (
            <Link href={`?m=${shift(ym, 1)}`} aria-label={t('next')} className="flex size-11 shrink-0 items-center justify-center text-primary">
              <ChevronRight aria-hidden size={22} strokeWidth={1.75} />
            </Link>
          ) : (
            <span className="size-11 shrink-0" />
          )}
        </nav>
      </header>

      {!data.rule && <p className="text-sm text-faint">{th('noRule')}</p>}

      {/* ── PC ── */}
      <div className="hidden lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
        <aside className="flex flex-col gap-4">
          <h1 className="text-lg font-bold">{t('pc.title')}</h1>
          <nav className="flex items-center gap-1" aria-label={t('month')}>
            {ym > oldest ? (
              <Link href={`?m=${shift(ym, -1)}`} aria-label={t('prev')} className="flex size-8 items-center justify-center rounded-button border border-border bg-bg text-muted">
                <ChevronLeft aria-hidden size={16} />
              </Link>
            ) : (
              <span className="size-8" />
            )}
            <span className="num flex-1 text-center font-bold">{f.dateTime(new Date(`${ym}-15T12:00:00+09:00`), { year: 'numeric', month: 'long' })}</span>
            {ym < thisMonth ? (
              <Link href={`?m=${shift(ym, 1)}`} aria-label={t('next')} className="flex size-8 items-center justify-center rounded-button border border-border bg-bg text-muted">
                <ChevronRight aria-hidden size={16} />
              </Link>
            ) : (
              <span className="size-8" />
            )}
          </nav>
          <dl className="num flex flex-col divide-y divide-border border-y border-border text-sm">
            {[
              { k: 'totalWorked', v: dur(total) },
              { k: 'daysWorked', v: t('days', { n: worked.length }) },
              { k: 'lateTotal', v: t('lateValue', { n: lateOf.size, m: lateMin }) },
              { k: 'overtimeTotal', v: dur(overtimeTotal) },
            ].map((x) => (
              <div key={x.k} className="flex items-baseline justify-between gap-2 py-1.5">
                <dt className="text-muted">{t(x.k)}</dt>
                <dd className="font-bold">{x.v}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col gap-1 text-sm">
            {CATS.map((c) => (
              <li key={c}>
                <Link href={toggle(c)} role="checkbox" aria-checked={!hidden.has(c)} scroll={false} className="flex min-h-8 items-center gap-2">
                  <span aria-hidden className={`flex size-4 items-center justify-center rounded-sm border ${hidden.has(c) ? 'border-border bg-bg' : CAT_COLOR[c]}`}>
                    {!hidden.has(c) && <Check size={12} strokeWidth={3} className="text-on-primary" />}
                  </span>
                  <span className="flex-1">{t(CAT_KEY[c])}</span>
                  <span className="num text-xs text-faint">{catCount(c)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex justify-end">
            <Link href="/punch/corrections?new=1" className="inline-flex h-8 items-center gap-1.5 rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
              <Clock aria-hidden size={16} />
              {t('pc.newCorrection')}
            </Link>
          </div>
          <div className="overflow-x-auto border-t border-border bg-bg">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {[t('colDate'), t('pc.colTime'), t('pc.colPlan'), t('pc.colBreak'), t('pc.colTotal'), t('pc.colPayable'), t('pc.colDiffIn'), t('pc.colDiffOut'), t('pc.colState')].map((x, i) => (
                    <th key={x} scope="col" className={`px-3 py-2 whitespace-nowrap ${i >= 3 && i <= 7 ? 'text-right' : 'text-left'}`}>
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pcRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-faint">
                      {t('pc.empty')}
                    </td>
                  </tr>
                )}
                {weeks.flatMap((w) => [
                ...pcRows.filter((r) => weekStartOf(r.d.workDate) === w).map((r) => {
                  const { d, firstIn, lastOut, open, req, corrected, pendingCorr } = r;
                  const plan = data.planFor(me.id, d.workDate);
                  const live = open && d.workDate === today;
                  return (
                    <tr key={d.workDate}>
                      <td className="num px-3 py-2 font-bold whitespace-nowrap">{f.dateTime(new Date(`${d.workDate}T12:00:00+09:00`), { month: '2-digit', day: '2-digit', weekday: 'short' })}</td>
                      <td className="num px-3 py-2 whitespace-nowrap">
                        {d.deemed ? t('pc.deemed') : `${firstIn ? hm(firstIn) : '–'} - ${open ? '' : lastOut ? hm(lastOut) : '–'}`}
                        {open && !live && <span className="ml-1 text-warn">{t('noOut')}</span>}
                        {live && <span className="ml-1 text-muted">{th('status.working')}</span>}
                      </td>
                      <td className="num px-3 py-2 whitespace-nowrap text-muted">{plan.items.length ? plan.items.map((it) => `${it.startTime} - ${it.endTime}`).join(', ') : t('pc.noPlan')}</td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap text-muted">{dur(d.breakMinutes)}</td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap">{live ? '–' : dur(d.netMinutes)}</td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap font-bold">{live ? '–' : dur(d.payableMinutes)}</td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap text-muted">{d.deemed ? '' : diffText(diff(firstIn, d.workDate, plan.items[0]?.startTime))}</td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap text-muted">{d.deemed || open ? '' : diffText(diff(lastOut, d.workDate, plan.items.at(-1)?.endTime))}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-col gap-2">
                          <span className="flex flex-wrap items-center gap-1">
                            {lateOf.has(d.workDate) && <Chip tone="warn">{th('lateBy', { n: lateOf.get(d.workDate)! })}</Chip>}
                            {corrected && <Chip tone="info">{t('corrected')}</Chip>}
                            {pendingCorr && <Chip>{t('correctionPending')}</Chip>}
                            {req && <Chip tone={req.status === 'approved' ? 'ok' : req.status === 'rejected' ? 'neutral' : 'warn'}>{t(`overtime.${req.status}`)}</Chip>}
                          </span>
                          {req?.status === 'pending' && <ReasonForm id={req.id} initial={req.reason} />}
                        </span>
                      </td>
                    </tr>
                  );
                }),
                <tr key={`w${w}`} className="bg-surface">
                  <td colSpan={4} className="px-3 py-2 text-xs font-bold text-muted">{t('pc.weekTotal', { from: md(w), to: md(addDays(w, 6)) })}</td>
                  <td className="num px-3 py-2 text-right text-sm font-bold whitespace-nowrap">{dur(weekSum(w).net)}</td>
                  <td className="num px-3 py-2 text-right text-sm font-bold whitespace-nowrap">{dur(weekSum(w).pay)}</td>
                  <td colSpan={3} className="px-3 py-2 text-xs text-faint">{weekSum(w).net > OFFICE.weeklyLimitHours * 60 ? <span className="font-bold text-danger">{t('pc.weekOver', { h: OFFICE.weeklyLimitHours })}</span> : t('pc.weekLeft', { left: dur(Math.max(0, OFFICE.weeklyLimitHours * 60 - weekSum(w).net)), h: OFFICE.weeklyLimitHours })}</td>
                </tr>,
                ])}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* 폰: 이 달 요약 — 근무 시간을 크게, 나머지는 2×2 (토스풍) */}
      <Card className="flex flex-col gap-4 p-6 lg:hidden">
        <div>
          <p className="text-sm font-medium text-muted">{t('totalWorked')}</p>
          <p className="num text-3xl font-extrabold tracking-tight">{dur(total)}</p>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-button bg-surface px-3 py-3">
            <dt className="text-xs text-muted">{t('daysWorked')}</dt>
            <dd className="num text-base font-extrabold">{t('days', { n: worked.length })}</dd>
          </div>
          <div className="rounded-button bg-surface px-3 py-3">
            <dt className="text-xs text-muted">{t('lateTotal')}</dt>
            <dd className={`num text-base font-extrabold ${lateOf.size > 0 ? 'text-warn' : ''}`}>{t('lateValue', { n: lateOf.size, m: lateMin })}</dd>
          </div>
          <div className="rounded-button bg-surface px-3 py-3">
            <dt className="text-xs text-muted">{t('overtimeTotal')}</dt>
            <dd className="num text-base font-extrabold">{dur(overtimeTotal)}</dd>
          </div>
        </dl>
      </Card>

      {rows.length === 0 && <p className="text-muted">{t('emptyMonth')}</p>}
      {/* 폰: 전체 목록과 같은 모양 (2026-10-11 의뢰인: 시프티의 「내 기록」) — 날짜 머리줄(그날 근무 시간) + 기록 한 건이 한 줄(출근/퇴근 시각 · 막대 · 배지) */}
      <div className="-mx-4 flex flex-col lg:hidden">
        {rows.map(({ d, open, req, corrected, pendingCorr }) => (
          <section key={d.workDate}>
            <h2 className="num flex items-center justify-between gap-2 border-b border-border bg-surface px-5 py-3 font-bold">
              <span>{f.dateTime(new Date(`${d.workDate}T12:00:00+09:00`), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</span>
              <span className="shrink-0">{open && d.workDate === today ? th('status.working') : dur(d.netMinutes)}</span>
            </h2>
            <ul className="divide-y divide-border border-b border-border bg-bg">
              {d.pairs.map((pair, i) => (
                <li key={i} className="flex min-h-16 items-center gap-3 py-2 pr-4 pl-5">
                  <span className="num flex w-14 shrink-0 flex-col text-sm leading-snug">
                    <span className="font-semibold">{pair.in ? hm(pair.in) : <span className="text-warn">–</span>}</span>
                    <span className="text-muted">{pair.out ? hm(pair.out) : '–'}</span>
                  </span>
                  <span aria-hidden className="w-1 shrink-0 self-stretch rounded-chip bg-border" />
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {!pair.in && <Chip tone="warn">{t('noIn')}</Chip>}
                    {pair.in && !pair.out && (d.workDate === today ? <Chip tone="info">{th('status.working')}</Chip> : <Chip tone="warn">{t('noOut')}</Chip>)}
                    {i === 0 && lateOf.has(d.workDate) && <Chip tone="warn">{th('lateBy', { n: lateOf.get(d.workDate)! })}</Chip>}
                    {i === 0 && corrected && <Chip tone="info">{t('corrected')}</Chip>}
                    {i === 0 && pendingCorr && <Chip>{t('correctionPending')}</Chip>}
                    {i === 0 && req && <Chip tone={req.status === 'approved' ? 'ok' : req.status === 'rejected' ? 'neutral' : 'warn'}>{t(`overtime.${req.status}`)}</Chip>}
                    {i === 0 && d.overtimeMinutes + d.holidayMinutes > 0 && (
                      <span className="num basis-full text-xs text-muted">{t('overtimeLine', { o: dur(d.overtimeMinutes), n: dur(d.nightMinutes), h: dur(d.holidayMinutes) })}</span>
                    )}
                  </span>
                </li>
              ))}
              {req?.status === 'pending' && (
                <li className="px-5 py-3">
                  <ReasonForm id={req.id} initial={req.reason} />
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-center text-xs text-faint">{t('olderHint', { n: MONTHS_BACK })}</p>
      <Fab label={tc('title')} href="/punch/corrections?new=1" />
    </PageShell>
  );
}
