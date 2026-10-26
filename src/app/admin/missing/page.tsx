// 출근/퇴근 누락 기록 (의뢰인 2026-10-10: 시프티의 「출근/퇴근 누락 기록」처럼) — 기간을 골라 「출근 누락 / 퇴근 누락」 탭으로 본다.
// 날짜별 묶음. 한 줄 = 시각(출근 누락: 그날 일정 / 퇴근 누락: 출근 시각 – 없음) · 직무 색 막대 · 이름 · 지점/직무 · ›(그 직원 기록).
// 보여 주기만 한다 — 채우는 길은 직원의 정정 요청이나 그 직원 기록 화면의 「기록 넣기」다 (4-8).
import { ChevronRight } from 'lucide-react';
import { HelpTip } from '@/components/Help';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { RowList } from '@/components/list';
import { Chip, PageShell } from '@/components/ui';
import { CountUp } from '@/components/CountUp';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { loadJobs } from '@/lib/job-data';
import { fullLeaveSet } from '@/lib/leave';
import { missingOfDay, missingRange, type MissingKind } from '@/lib/missing-list';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, leaveDaysFor, loadPeriod, workDaysFor } from '@/lib/period-data';
import { hhmm, SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { kstDateTime, toKstDate } from '@/lib/time';
import { RangeForm } from './RangeForm';

type Found = { id: string; name: string; sub: string; color: string; workDate: string; kind: MissingKind; start: string; end: string | null; pending: boolean };

export default async function MissingPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; tab?: string; live?: string; v?: string }> }) {
  const [t, f, sp] = await Promise.all([getTranslations('admin.missing'), getFormatter(), searchParams]);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const now = new Date();
  const today = toKstDate(now);
  const { from, to } = missingRange(sp.from, sp.to, today, addDays);
  const [data, groups, jobs] = await Promise.all([loadPeriod(from, to, practice), loadOrgGroups(), loadJobs()]);
  const jobOf = new Map(jobs.map((j) => [j.id, j]));
  const clock = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const found: Found[] = [];
  for (const p of data.people) {
    if (!p.active || p.employeeNo?.startsWith('e2e-') || p.employeeNo === OFFICE.ownerEmployeeNo) continue; // 시스템관리자(admin)는 직원이 아니다 — 출퇴근 판정에서 뺀다 (2026-10-17: 연습 모드를 끈 뒤 admin 홈에 「출근 기록 없음」이 떴다)
    const fullLeave = fullLeaveSet(leaveDaysFor(data, p.id));
    const away = workDaysFor(data, p.id);
    const job = p.jobId ? jobOf.get(p.jobId) : undefined;
    const sub = [groupPath(groups, p.groupId), job?.name].filter(Boolean).join(' / ');
    for (const d of daysFor(data, p.id)) {
      if (d.workDate < p.startsOn) continue;
      const plan = data.planFor(p.id, d.workDate);
      const span = plan.items.length && plan.rule ? { startTime: hhmm(plan.rule.startTime), endTime: hhmm(plan.rule.endTime) } : null;
      const kind = missingOfDay({
        workDate: d.workDate, pairs: d.pairs, plan: span, deemed: !!plan.deemed, excused: fullLeave.has(d.workDate) || away.has(d.workDate), now,
        outGraceHours: OFFICE.missingOutGraceHours, inGraceMin: OFFICE.missingInGraceMin,
      });
      if (!kind) continue;
      const openIn = d.pairs.find((x) => x.in && !x.out)?.in ?? null;
      found.push({
        id: p.id, name: p.name, sub, color: job ? SHIFT_COLOR_CLASS[job.color] : 'bg-border', workDate: d.workDate, kind,
        start: kind === 'out' && openIn ? clock(openIn) : (span?.startTime ?? ''),
        end: kind === 'in' ? (span?.endTime ?? null) : null,
        pending: data.corrections.some((c) => c.employeeId === p.id && c.status === 'pending' && c.workDate === d.workDate && c.kind === kind),
      });
    }
  }
  const count = (k: MissingKind) => found.filter((x) => x.kind === k).length;
  // 탭을 고르지 않고 들어오면 누락이 있는 탭부터 연다 (2026-10-19 의뢰인: 홈 「미기록 1」을 눌렀는데 퇴근 누락 탭이 열려 아무것도 안 보였다)
  const tabKind: MissingKind = sp.tab === 'in' || sp.tab === 'out' ? sp.tab : count('out') === 0 && count('in') > 0 ? 'in' : 'out';
  const shown = found.filter((x) => x.kind === tabKind).sort((a, b) => b.workDate.localeCompare(a.workDate) || a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  const dates = [...new Set(shown.map((x) => x.workDate))];
  const byDate = sp.v === 'date';
  const q = (tab: MissingKind) => ({ pathname: '/admin/missing', query: { from, to, tab, v: 'date', ...(sp.live === '1' ? { live: '1' } : {}) } });
  const viewHref = (date: boolean) => ({ pathname: '/admin/missing', query: { from, to, ...(date ? { v: 'date' } : {}), ...(sp.live === '1' ? { live: '1' } : {}) } });
  // 사람별 (기본, 2026-10-22 의뢰인: 「누락 기록 화면 이상하지 않아?」 — 같은 사람이 날짜마다 반복돼 몇 명이 몇 번 빠졌는지 안 보였다)
  const people = [...new Set(found.map((x) => x.id))]
    .map((id) => {
      const mine = found.filter((x) => x.id === id).sort((a, b) => b.workDate.localeCompare(a.workDate));
      return { id, name: mine[0].name, sub: mine[0].sub, color: mine[0].color, items: mine };
    })
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const viewBtn = (on: boolean) => `inline-flex min-h-9 items-center border px-3.5 text-sm first:rounded-l-button last:rounded-r-button ${on ? 'z-10 border-primary bg-primary-tint font-bold text-primary' : 'border-border bg-bg text-muted hover:text-text'}`;
  const tab = (on: boolean) => `flex min-h-11 flex-1 lg:flex-none lg:px-4 items-center justify-center gap-1 border-b-2 text-sm font-bold ${on ? 'border-text text-text lg:border-primary lg:text-primary' : 'border-transparent text-muted hover:text-text'}`;

  return (
    <PageShell wide>
      <div className="px-1">
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}<HelpTip>{t('intro', { h: OFFICE.missingOutGraceHours, m: OFFICE.missingInGraceMin })}</HelpTip></h1>
      </div>
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}
      <RangeForm key={`${from}${to}`} from={from} to={to} tab={tabKind} today={today} live={sp.live === '1'} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: 'in', n: count('in'), tone: count('in') ? 'text-warn' : 'text-faint' },
          { k: 'out', n: count('out'), tone: count('out') ? 'text-danger' : 'text-faint' },
          { k: 'people', n: people.length, tone: people.length ? 'text-text' : 'text-faint' },
          { k: 'pending', n: found.filter((x) => x.pending).length, tone: found.some((x) => x.pending) ? 'text-primary' : 'text-faint' },
        ].map((c) => (
          <div key={c.k} className="flex flex-col gap-1 rounded-card border border-border bg-bg px-5 py-4">
            <span className="text-sm font-semibold text-muted">{t(`sum.${c.k}`)}</span>
            <CountUp value={c.n} className={`num text-3xl font-bold ${c.tone}`} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end">
        <div className="flex">
          <Link href={viewHref(false)} aria-current={!byDate ? 'page' : undefined} className={viewBtn(!byDate)}>{t('viewPeople')}</Link>
          <Link href={viewHref(true)} aria-current={byDate ? 'page' : undefined} className={`-ml-px ${viewBtn(byDate)}`}>{t('viewDate')}</Link>
        </div>
      </div>
      {!byDate && data.rule && (
        people.length === 0 ? (
          <p className="rounded-card bg-ok-tint px-5 py-4 text-sm font-semibold text-ok">{t('noneAll')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-bg">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/records/${p.id}?m=${p.items[0].workDate.slice(0, 7)}`} className="flex flex-col gap-3 px-5 py-4 hover:bg-surface lg:flex-row lg:items-center lg:gap-6">
                  <span className="flex min-w-0 items-center gap-3 lg:w-64 lg:shrink-0">
                    <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-chip ${p.color}`} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-bold">{p.name}</span>
                      <span className="truncate text-xs text-muted">{p.sub}</span>
                    </span>
                    <span className="num ml-auto shrink-0 rounded-chip bg-warn-tint px-2.5 py-0.5 text-xs font-bold text-warn lg:ml-2">{t('times', { n: p.items.length })}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {p.items.slice(0, 12).map((x) => (
                      <span key={`${x.workDate}${x.kind}`} className={`num inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-semibold ${x.kind === 'in' ? 'bg-warn-tint text-warn' : 'bg-danger-tint text-danger'}`}>
                        {md(x.workDate)} {t(`short.${x.kind}`)}
                        {x.pending && <span className="text-primary">· {t('pendingShort')}</span>}
                      </span>
                    ))}
                    {p.items.length > 12 && <span className="text-xs text-faint">{t('moreN', { n: p.items.length - 12 })}</span>}
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-sm font-bold text-primary lg:flex">
                    {t('open')}
                    <ChevronRight aria-hidden size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
      {byDate && (
      <nav aria-label={t('title')} className="flex rounded-card bg-bg px-2">
        {(['in', 'out'] as const).map((k) => (
          <Link key={k} href={q(k)} aria-current={tabKind === k ? 'page' : undefined} className={tab(tabKind === k)}>
            {t(`tab.${k}`)}
            <span className="num">{count(k)}</span>
          </Link>
        ))}
      </nav>
      )}
      {!data.rule && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
      {byDate && data.rule && shown.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(`empty.${tabKind}`)}</p>}
      {byDate && dates.map((d) => {
        const rows = shown.filter((x) => x.workDate === d);
        return (
          <section key={d} className="flex flex-col gap-2">
            <h2 className="num flex items-center justify-between px-1 text-sm font-medium text-muted">
              <span>{f.dateTime(kstDateTime(d, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</span>
              <span>{t('count', { n: rows.length })}</span>
            </h2>
            <RowList>
              {rows.map((x) => (
                <li key={`${x.id}${x.workDate}`}>
                  <Link href={`/admin/records/${x.id}?m=${x.workDate.slice(0, 7)}`} className="flex min-h-16 items-center gap-3 py-2 pr-3 pl-5">
                    <span className="num flex w-14 shrink-0 flex-col text-sm leading-snug">
                      <span className="font-semibold">{x.start}</span>
                      <span className="text-muted">{x.end ?? '–'}</span>
                    </span>
                    <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-chip ${x.color}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{x.name}</span>
                      <span className="truncate text-sm text-muted">{x.sub || t(x.kind === 'in' ? 'lineIn' : 'lineOut')}</span>
                    </span>
                    {x.pending && <Chip tone="info">{t('pending')}</Chip>}
                    <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </RowList>
          </section>
        );
      })}
      <p className="px-1 text-sm text-faint">{t('hint')}</p>
    </PageShell>
  );
}
