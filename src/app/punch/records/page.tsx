// 직원 "내 기록" — 월 단위 + 월 이동(최근 6개월) (2026-10-02 의뢰인: 14일만 보이고 시간 표시가 지저분하다).
// 하루 한 줄: "출근 09:00 → 퇴근 20:00" / 근무 중이면 "출근 10:56 · 근무 중". 정정된 날은 "정정됨" 칩 (R-10-8: 상태를 숨기지 않는다).
// 연장 확인 요청이 대기 중이면 사유를 적을 수 있다 (6장: 서버 API로만).
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ScopeSwitch } from '@/components/ScopeSwitch';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { judgeLateness } from '@/lib/lateness';
import { isYearMonth, monthRange } from '@/lib/month-data';
import { daysFor, loadPeriod } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import { ReasonForm } from './ReasonForm';

const MONTHS_BACK = 6; // 직원이 볼 수 있는 과거 (보존은 3년 — 그 이상은 관리자에게 요청)

function shift(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default async function MyRecordsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('records');
  const th = await getTranslations('home');
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
    const rule = data.ruleAt(d.workDate);
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

  return (
    <PageShell wide>
      {me.role === 'admin' && <ScopeSwitch kind="attendance" current="mine" />}
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
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

      {/* PC: 숫자 칸 4개(같은 크기) → 날짜별 표 (2026-10-06 의뢰인: 왼쪽 요약 + 오른쪽 카드 더미는 보기 나빴다) */}
      <dl className="hidden grid-cols-4 gap-4 lg:grid">
        {[
          { k: 'totalWorked', v: dur(total), warn: false },
          { k: 'daysWorked', v: t('days', { n: worked.length }), warn: false },
          { k: 'lateTotal', v: t('lateValue', { n: lateOf.size, m: lateMin }), warn: lateOf.size > 0 },
          { k: 'overtimeTotal', v: dur(overtimeTotal), warn: false },
        ].map((x) => (
          <div key={x.k} className="flex flex-col gap-2 rounded-card bg-bg p-5">
            <dt className="text-sm text-muted">{t(x.k)}</dt>
            <dd className={`num text-3xl leading-none font-extrabold ${x.warn ? 'text-warn' : ''}`}>{x.v}</dd>
          </div>
        ))}
      </dl>
      {rows.length > 0 && (
        <Card className="hidden overflow-x-auto p-0 lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[t('colDate'), t('colIn'), t('colOut'), t('colWorked'), t('colOver'), t('colNote')].map((x, i) => (
                  <th key={x} scope="col" className={`px-5 py-3 text-xs font-medium whitespace-nowrap text-faint ${i >= 1 && i <= 3 ? 'text-right' : 'text-left'}`}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ d, firstIn, lastOut, open, req, corrected, pendingCorr }) => (
                <tr key={d.workDate}>
                  <td className="px-5 py-3 font-semibold whitespace-nowrap">{f.dateTime(new Date(`${d.workDate}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' })}</td>
                  <td className="num px-5 py-3 text-right">{firstIn ? hm(firstIn) : '–'}</td>
                  <td className="num px-5 py-3 text-right">
                    {open ? (d.workDate === today ? <span className="text-muted">{th('status.working')}</span> : <span className="text-warn">{t('noOut')}</span>) : lastOut ? hm(lastOut) : '–'}
                  </td>
                  <td className="num px-5 py-3 text-right font-semibold whitespace-nowrap">{open && d.workDate === today ? '–' : dur(d.netMinutes)}</td>
                  <td className="num px-5 py-3 text-xs text-muted">{d.overtimeMinutes + d.holidayMinutes > 0 ? t('overtimeLine', { o: dur(d.overtimeMinutes), n: dur(d.nightMinutes), h: dur(d.holidayMinutes) }) : '–'}</td>
                  <td className="px-5 py-3">
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
              ))}
            </tbody>
          </table>
        </Card>
      )}

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
      <ul className="flex flex-col gap-2 lg:hidden">
        {rows.map(({ d, firstIn, lastOut, open, req, corrected, pendingCorr }) => (
          <li key={d.workDate}>
            <Card className="flex flex-col gap-2 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{f.dateTime(new Date(`${d.workDate}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                <span className="num text-sm text-muted">{open && d.workDate === today ? th('status.working') : dur(d.netMinutes)}</span>
              </div>
              <p className="num text-base">
                {firstIn ? t('inLine', { time: hm(firstIn) }) : t('noIn')}
                <span className="mx-2 text-faint">→</span>
                {open ? (d.workDate === today ? <span className="text-muted">{th('status.working')}</span> : <span className="text-warn">{t('noOut')}</span>) : lastOut ? t('outLine', { time: hm(lastOut) }) : t('noOut')}
              </p>
              {(corrected || pendingCorr || req || lateOf.has(d.workDate) || d.overtimeMinutes + d.holidayMinutes > 0) && (
                <div className="flex flex-wrap items-center gap-2">
                  {lateOf.has(d.workDate) && <Chip tone="warn">{th('lateBy', { n: lateOf.get(d.workDate)! })}</Chip>}
                  {corrected && <Chip tone="info">{t('corrected')}</Chip>}
                  {pendingCorr && <Chip>{t('correctionPending')}</Chip>}
                  {d.overtimeMinutes + d.holidayMinutes > 0 && (
                    <span className="num text-xs text-muted">{t('overtimeLine', { o: dur(d.overtimeMinutes), n: dur(d.nightMinutes), h: dur(d.holidayMinutes) })}</span>
                  )}
                  {req && <Chip tone={req.status === 'approved' ? 'ok' : req.status === 'rejected' ? 'neutral' : 'warn'}>{t(`overtime.${req.status}`)}</Chip>}
                </div>
              )}
              {req?.status === 'pending' && <ReasonForm id={req.id} initial={req.reason} />}
            </Card>
          </li>
        ))}
      </ul>
      <p className="text-center text-xs text-faint">{t('olderHint', { n: MONTHS_BACK })}</p>
    </PageShell>
  );
}
