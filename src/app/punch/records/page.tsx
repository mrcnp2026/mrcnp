// 직원 "내 기록" — 월 단위 + 월 이동(최근 6개월) (2026-10-02 의뢰인: 14일만 보이고 시간 표시가 지저분하다).
// 하루 한 줄: "출근 09:00 → 퇴근 20:00" / 근무 중이면 "출근 10:56 · 근무 중". 정정된 날은 "정정됨" 칩 (R-10-8: 상태를 숨기지 않는다).
// 연장 확인 요청이 대기 중이면 사유를 적을 수 있다 (6장: 서버 API로만).
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
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

  return (
    <PageShell>
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
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

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          [t('daysWorked'), t('days', { n: worked.length })],
          [t('totalWorked'), dur(total)],
          [t('overtimeTotal'), dur(overtimeTotal)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-card border border-border bg-bg p-3 shadow-card">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="num text-base font-semibold whitespace-nowrap">{v}</dd>
          </div>
        ))}
      </dl>

      {shown.length === 0 && <p className="text-muted">{t('emptyMonth')}</p>}
      <ul className="flex flex-col gap-2">
        {shown.map((d) => {
          const ins = d.pairs.map((p) => p.in).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
          const outs = d.pairs.map((p) => p.out).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
          const open = d.pairs.some((p) => p.in && !p.out);
          const firstIn = ins[0];
          const lastOut = outs[outs.length - 1];
          const req = overtime.find((o) => o.workDate === d.workDate);
          const corrected = corrections.some((c) => c.workDate === d.workDate && c.status === 'approved');
          const pendingCorr = corrections.some((c) => c.workDate === d.workDate && c.status === 'pending');
          return (
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
                {(corrected || pendingCorr || req || d.overtimeMinutes + d.holidayMinutes > 0) && (
                  <div className="flex flex-wrap items-center gap-2">
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
          );
        })}
      </ul>
      <p className="text-center text-xs text-faint">{t('olderHint', { n: MONTHS_BACK })}</p>
    </PageShell>
  );
}
