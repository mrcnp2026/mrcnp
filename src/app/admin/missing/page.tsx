// 출근/퇴근 누락 기록 (의뢰인 2026-10-10: 시프티의 「출근/퇴근 누락 기록」처럼) — 기간을 골라 「출근 누락 / 퇴근 누락」 탭으로 본다.
// 날짜별 묶음. 한 줄 = 시각(출근 누락: 그날 일정 / 퇴근 누락: 출근 시각 – 없음) · 직무 색 막대 · 이름 · 지점/직무 · ›(그 직원 기록).
// 보여 주기만 한다 — 채우는 길은 직원의 정정 요청이나 그 직원 기록 화면의 「기록 넣기」다 (4-8).
import { ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { Chip, PageShell } from '@/components/ui';
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

export default async function MissingPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; tab?: string; live?: string }> }) {
  const [t, f, sp] = await Promise.all([getTranslations('admin.missing'), getFormatter(), searchParams]);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const now = new Date();
  const today = toKstDate(now);
  const { from, to } = missingRange(sp.from, sp.to, today, addDays);
  const tabKind: MissingKind = sp.tab === 'in' ? 'in' : 'out';
  const [data, groups, jobs] = await Promise.all([loadPeriod(from, to, practice), loadOrgGroups(), loadJobs()]);
  const jobOf = new Map(jobs.map((j) => [j.id, j]));
  const clock = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const found: Found[] = [];
  for (const p of data.people) {
    if (!p.active || p.employeeNo?.startsWith('e2e-')) continue;
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
  const shown = found.filter((x) => x.kind === tabKind).sort((a, b) => b.workDate.localeCompare(a.workDate) || a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  const dates = [...new Set(shown.map((x) => x.workDate))];
  const q = (tab: MissingKind) => ({ pathname: '/admin/missing', query: { from, to, tab, ...(sp.live === '1' ? { live: '1' } : {}) } });
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center gap-1 border-b-2 text-sm font-bold ${on ? 'border-text text-text' : 'border-transparent text-muted'}`;

  return (
    <PageShell>
      <div className="flex flex-wrap items-center gap-x-1 px-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <Help>{t('intro', { h: OFFICE.missingOutGraceHours, m: OFFICE.missingInGraceMin })}</Help>
      </div>
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}
      <RangeForm key={`${from}${to}`} from={from} to={to} tab={tabKind} today={today} live={sp.live === '1'} />
      <nav aria-label={t('title')} className="flex rounded-card bg-bg px-2">
        {(['in', 'out'] as const).map((k) => (
          <Link key={k} href={q(k)} aria-current={tabKind === k ? 'page' : undefined} className={tab(tabKind === k)}>
            {t(`tab.${k}`)}
            <span className="num">{count(k)}</span>
          </Link>
        ))}
      </nav>
      {!data.rule && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
      {data.rule && shown.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(`empty.${tabKind}`)}</p>}
      {dates.map((d) => {
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
