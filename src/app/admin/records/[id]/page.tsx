// ③ 기록 › 직원 한 명의 날짜별 기록 (2026-10-05 의뢰인: 시프티·샤플 대조 반영).
// 월 합계(기록 탭)만으로는 "며칠에 몇 시에 찍었나"를 볼 수 없었다 — 여기서 하루 한 줄로 본다.
// 원래 찍은 기록과 정정 내역을 그대로 펼쳐 보여 준다 (사실을 숨기지 않는다, 4-1). 빠진 기록은 관리자가 사유와 함께 넣는다 (②-3 7-6).
// 색은 예외에만(지각·기록 없음·사무실 밖) + 글자를 함께 (R-10-5).
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { buildDayDetails, isProxyCorrection } from '@/lib/day-detail';
import { buildMonth, isYearMonth, monthRange } from '@/lib/month-data';
import { daysFor, leaveDaysFor, workDaysFor } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import { ProxyEntry } from './ProxyEntry';

function shift(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default async function EmployeeRecordsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string; live?: string }> }) {
  const t = await getTranslations('admin.detail');
  const tr = await getTranslations('records');
  const th = await getTranslations('home');
  const ti = await getTranslations('admin.inbox');
  const tl = await getTranslations('leave');
  const ta = await getTranslations('admin.home');
  const f = await getFormatter();
  const { id } = await params;
  const sp = await searchParams;
  const today = toKstDate(new Date());
  const thisMonth = today.slice(0, 7);
  const ym = isYearMonth(sp.m) && sp.m <= thisMonth ? sp.m : thisMonth;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const liveQ = OFFICE.practiceMode && !practice ? '&live=1' : '';
  const q = (m: string) => `?m=${m}${liveQ}`;
  // 대리 등록은 지금 운영 모드의 기록에만 넣는다 — 연습 기간에 "실제 기록 보기"로 들어온 화면에서는 넣지 않는다
  // 본인 기록은 대신 넣지 못한다 (스스로 넣고 스스로 승인하는 것을 막는다)
  const self = (await getMe())?.id === id;
  const canEnter = practice === OFFICE.practiceMode && !self;

  const { data, rows } = await buildMonth(ym, practice);
  const person = data.people.find((p) => p.id === id);
  if (!person) notFound();
  const { from, to } = monthRange(ym);
  const upTo = to < today ? to : today;
  const summary = rows.find((r) => r.person.id === id)?.summary;
  const nameOf = new Map(data.people.map((p) => [p.id, p.name]));
  const events = data.events.filter((e) => e.employeeId === id);
  const corrections = data.corrections.filter((c) => c.employeeId === id);
  const details = data.rule
    ? buildDayDetails({
        days: daysFor(data, id, from, upTo), events, corrections, leave: leaveDaysFor(data, id), work: workDaysFor(data, id),
        ruleAt: data.ruleAt, today, startsOn: person.startsOn,
      }).reverse()
    : [];

  const hm = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dur = (min: number) => tr('hm', { h: Math.floor(min / 60), m: min % 60 });
  const dayLabel = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' });
  const missingDays = details.filter((d) => d.missing).length;

  return (
    <PageShell>
      <Link href={`/admin/records${q(ym)}`} className="-mb-2 inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('backToList')}
      </Link>
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{person.name}</h1>
          {person.employeeNo && <p className="num text-sm text-muted">{person.employeeNo}</p>}
        </div>
        <nav className="flex shrink-0 items-center" aria-label={tr('month')}>
          <Link href={q(shift(ym, -1))} aria-label={tr('prev')} className="flex size-11 shrink-0 items-center justify-center text-primary">
            <ChevronLeft aria-hidden size={22} strokeWidth={1.75} />
          </Link>
          <span className="num text-xl font-semibold">{ym}</span>
          {ym < thisMonth ? (
            <Link href={q(shift(ym, 1))} aria-label={tr('next')} className="flex size-11 shrink-0 items-center justify-center text-primary">
              <ChevronRight aria-hidden size={22} strokeWidth={1.75} />
            </Link>
          ) : (
            <span className="size-11 shrink-0" />
          )}
        </nav>
      </header>
      {OFFICE.practiceMode && (
        <Link href={practice ? `?m=${ym}&live=1` : `?m=${ym}`} className="inline-flex min-h-11 items-center self-start text-sm text-primary">
          {practice ? ta('showLive') : ta('showPractice')}
        </Link>
      )}
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}
      {!data.rule && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{ta('noRule')}</p>}

      {summary && (
        <Card className="grid grid-cols-4 p-2 text-center">
          {[
            { k: 'sumWorked', v: dur(summary.netMinutes), warn: false },
            { k: 'sumLate', v: String(summary.row.late_count), warn: Number(summary.row.late_count) > 0 },
            { k: 'sumMissing', v: String(missingDays), warn: missingDays > 0 },
            { k: 'sumLeave', v: String(summary.paidLeaveDays + Number(summary.row.unpaid_leave_days ?? 0)), warn: false },
          ].map((x) => (
            <div key={x.k} className="flex min-h-16 flex-col items-center justify-center px-1">
              <span className={`num text-lg leading-tight font-extrabold ${x.warn ? 'text-warn' : ''}`}>{x.v}</span>
              <span className="mt-1 text-xs text-muted">{t(x.k)}</span>
            </div>
          ))}
        </Card>
      )}

      {data.rule && details.length === 0 && <p className="text-muted">{tr('emptyMonth')}</p>}
      <ul className="flex flex-col gap-2">
        {details.map((d) => {
          const raw = events.filter((e) => e.workDate === d.workDate);
          const corr = corrections.filter((c) => c.workDate === d.workDate);
          const none = !d.firstIn && !d.lastOut;
          return (
            <li key={d.workDate}>
              <Card className="flex flex-col gap-2 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {dayLabel(d.workDate)}
                    {d.dayType !== 'workday' && <span className="ml-2 text-xs font-medium text-faint">{t('dayOff')}</span>}
                  </span>
                  <span className="num text-sm text-muted">{d.open && d.workDate === today ? th('status.working') : none ? '' : dur(d.netMinutes)}</span>
                </div>
                {none ? (
                  <p className={`text-base ${d.missing ? 'text-warn' : 'text-faint'}`}>{d.missing ? t('noRecord') : t('noRecordOk')}</p>
                ) : (
                  <p className="num text-base">
                    {d.firstIn ? tr('inLine', { time: hm(d.firstIn) }) : <span className="text-warn">{tr('noIn')}</span>}
                    <span className="mx-2 text-faint">→</span>
                    {d.open ? (
                      d.workDate === today ? <span className="text-muted">{th('status.working')}</span> : <span className="text-warn">{tr('noOut')}</span>
                    ) : d.lastOut ? tr('outLine', { time: hm(d.lastOut) }) : <span className="text-warn">{tr('noOut')}</span>}
                  </p>
                )}
                {(d.lateMinutes > 0 || d.leave.length > 0 || d.work || d.outside || d.corrected || d.pendingCorrection || d.proxy || d.extraMinutes > 0) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {d.lateMinutes > 0 && <Chip tone="warn">{th('lateBy', { n: d.lateMinutes })}</Chip>}
                    {d.outside && <Chip tone="warn">{th('outside')}</Chip>}
                    {d.leave.map((l) => <Chip key={l.requestId} tone="info">{tl.has(`type.${l.typeCode}`) ? tl(`type.${l.typeCode}`) : l.typeCode}</Chip>)}
                    {d.work && <Chip tone="info">{ta(`work.${d.work}`)}</Chip>}
                    {d.proxy && <Chip>{ta('adminEntered')}</Chip>}
                    {d.corrected && <Chip tone="info">{tr('corrected')}</Chip>}
                    {d.pendingCorrection && <Chip>{tr('correctionPending')}</Chip>}
                    {d.extraMinutes > 0 && <span className="num text-xs text-muted">{t('extra', { t: dur(d.extraMinutes) })}</span>}
                  </div>
                )}
                {(raw.length > 0 || corr.length > 0) && (
                  <details className="text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center text-muted">{t('rawTitle', { n: raw.length + corr.length })}</summary>
                    <ul className="flex flex-col gap-2 pb-1">
                      {raw.map((e) => (
                        <li key={e.id} className="num flex flex-wrap items-baseline gap-x-2 text-muted">
                          <span className="font-semibold text-text">{ti(`kind.${e.kind}`)} {hm(e.punchedAt)}</span>
                          <span>{t('rawPunched')}</span>
                          {!e.ipVerified && <span className="text-warn">{th('outside')}</span>}
                        </li>
                      ))}
                      {corr.map((c) => {
                        const target = c.targetId ? raw.find((e) => e.id === c.targetId) : null;
                        return (
                          <li key={c.id} className="flex flex-col text-muted">
                            <span className="num flex flex-wrap items-baseline gap-x-2">
                              <span className="font-semibold text-text">
                                {c.correctionType === 'add_missing' && c.kind && c.newPunchedAt
                                  ? ti('addMissingLine', { kind: ti(`kind.${c.kind}`), time: hm(c.newPunchedAt) })
                                  : c.correctionType === 'modify' && c.newPunchedAt
                                    ? ti('modifyLine', { from: target ? hm(target.punchedAt) : '', to: hm(c.newPunchedAt) })
                                    : ti('voidLine', { time: target ? hm(target.punchedAt) : '' })}
                              </span>
                              <span>{isProxyCorrection(c) ? t('byAdmin', { who: nameOf.get(c.requestedBy) ?? '' }) : t('byRequest')}</span>
                              <span className={c.status === 'pending' ? 'text-warn' : ''}>{ti(`status.${c.status}`)}</span>
                            </span>
                            <span className="break-words whitespace-pre-wrap">{t('reasonLine', { reason: c.reason })}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
                {canEnter && d.canAdd.length > 0 && (
                  <ProxyEntry employeeId={id} name={person.name} workDate={d.workDate} dateLabel={dayLabel(d.workDate)} kinds={d.missing === 'out' ? ['out'] : d.canAdd} today={today} />
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {canEnter && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm text-muted">{t('otherHint')}</p>
          <ProxyEntry employeeId={id} name={person.name} kinds={['in', 'out']} today={today} />
        </Card>
      )}
      {self && <p className="text-sm text-muted">{t('selfNote')}</p>}
      <p className="text-xs text-faint">{t('footNote')}</p>
    </PageShell>
  );
}
