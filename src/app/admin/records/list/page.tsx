// 출퇴근기록 — 전체 목록 (의뢰인 2026-10-10: 시프티의 「출퇴근기록」 탭처럼).
// 위: 검색 · 거르기 · 기간 · [내 기록]. 아래: 날짜 머리줄(그날 합계) + 기록 한 건이 한 줄 = 출근/퇴근 시각 · 직무 색 막대 · 이름 · 지점/직무 · 배지.
// 합계는 그날 보이는 사람들의 근무 시간(휴게 제외) 합이다. 줄을 누르면 그 직원의 그 달 기록(정정·대리 입력은 거기서).
// 월 집계·엑셀 내려받기는 「월 집계」 화면(/admin/records)에 그대로 있다.
import { ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ListBar } from '@/components/ListBar';
import { Pager, pageOf } from '@/components/Pager';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { loadJobs } from '@/lib/job-data';
import { missingRange } from '@/lib/missing-list';
import { buildOrgTree, groupPath, groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, loadPeriod } from '@/lib/period-data';
import { SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { kstDateTime, toKstDate } from '@/lib/time';

const DATES_PER_PAGE = 7;
type Line = { key: string; id: string; name: string; sub: string; color: string; date: string; start: string; end: string | null; deemed: boolean; open: boolean; outside: boolean; sort: number };

export default async function RecordListPage({ searchParams }: { searchParams: Promise<{ q?: string; g?: string; from?: string; to?: string; live?: string; p?: string }> }) {
  const [t, tc, f, sp] = await Promise.all([getTranslations('admin.recordList'), getTranslations('common'), getFormatter(), searchParams]);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const today = toKstDate(new Date());
  // 기본 기간: 이번 달 1일 ~ 오늘 (한 번에 62일까지)
  const { from, to } = missingRange(sp.from ?? `${today.slice(0, 8)}01`, sp.to, today, addDays);
  const [data, groups, jobs] = await Promise.all([loadPeriod(from, to, practice), loadOrgGroups(), loadJobs()]);
  const jobOf = new Map(jobs.map((j) => [j.id, j]));
  const groupOptions = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const g = groupOptions.some((o) => o.id === sp.g) ? sp.g! : '';
  const scope = g ? groupScope(groups, g) : null;
  const q = (sp.q ?? '').trim().slice(0, 40);
  const clock = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const lines: Line[] = [];
  const totalOf = new Map<string, number>();
  for (const p of data.people) {
    if (p.employeeNo?.startsWith('e2e-')) continue;
    if (scope && !(p.groupId && scope.has(p.groupId))) continue;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) continue;
    const job = p.jobId ? jobOf.get(p.jobId) : undefined;
    const sub = [groupPath(groups, p.groupId), job?.name].filter(Boolean).join(' / ');
    // 간주 근무 줄: 그날 일정이 간주 근무이고 찍은 기록·승인된 정정이 하나도 없을 때 (계산이 일정 시간으로 채운 줄)
    const real = new Set([...data.events.filter((e) => e.employeeId === p.id).map((e) => e.workDate), ...data.corrections.filter((c) => c.employeeId === p.id && c.status === 'approved').map((c) => c.workDate)]);
    for (const d of daysFor(data, p.id)) {
      if (d.pairs.length === 0) continue;
      totalOf.set(d.workDate, (totalOf.get(d.workDate) ?? 0) + d.netMinutes);
      d.pairs.forEach((pair, i) => {
        const at = pair.in ?? pair.out;
        if (!at) return;
        lines.push({
          key: `${p.id}${d.workDate}${i}`, id: p.id, name: p.name, sub, color: job ? SHIFT_COLOR_CLASS[job.color] : 'bg-border', date: d.workDate,
          start: pair.in ? clock(pair.in) : '–', end: pair.out ? clock(pair.out) : null,
          deemed: !real.has(d.workDate) && !!data.planFor(p.id, d.workDate).deemed, open: !!pair.in && !pair.out, outside: false, sort: at.getTime(),
        });
      });
    }
  }
  const dates = [...new Set(lines.map((x) => x.date))].sort();
  const page = pageOf(dates, sp.p, DATES_PER_PAGE);
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const keep = { live: sp.live === '1' ? '1' : undefined };

  return (
    <PageShell>
      <h1 className="sr-only">{t('title')}</h1>
      <ListBar
        key={`${q}|${g}|${from}|${to}`}
        q={q}
        from={from}
        to={to}
        max={today}
        group={g}
        groups={groupOptions}
        keep={keep}
        side={{ href: '/punch/records', label: t('mine') }}
        labels={{ search: t('search'), filter: t('filter'), period: t('period'), from: t('from'), to: t('to'), apply: t('apply'), groupAll: t('groupAll') }}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 px-1 text-sm">
        <span className="text-muted">{practice ? t('practice') : t('live')}</span>
        <Link href="/admin/records" className="inline-flex min-h-11 items-center font-medium text-primary">
          {t('toMonth')} ›
        </Link>
      </div>
      {!data.rule && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
      {data.rule && dates.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('empty')}</p>}
      <div className="flex flex-col">
      {page.items.map((d) => {
        const rows = lines.filter((x) => x.date === d).sort((a, b) => a.name.localeCompare(b.name) || a.sort - b.sort);
        return (
          <section key={d}>
            <h2 className="num -mx-4 flex items-center justify-between border-b border-border bg-surface px-5 py-3 font-bold lg:mx-0">
              <span>{f.dateTime(kstDateTime(d, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</span>
              <span>{hm(totalOf.get(d) ?? 0)}</span>
            </h2>
            <ul className="-mx-4 divide-y divide-border border-b border-border bg-bg lg:mx-0">
              {rows.map((x) => (
                <li key={x.key}>
                  <Link href={`/admin/records/${x.id}?m=${x.date.slice(0, 7)}`} className="flex min-h-16 items-center gap-3 py-2 pr-3 pl-5">
                    <span className="num flex w-14 shrink-0 flex-col text-sm leading-snug">
                      <span className="font-semibold">{x.start}</span>
                      <span className="text-muted">{x.end ?? '–'}</span>
                    </span>
                    <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-chip ${x.color}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{x.name}</span>
                      {x.sub && <span className="truncate text-sm text-muted">{x.sub}</span>}
                    </span>
                    {x.deemed && <Chip>{t('deemed')}</Chip>}
                    {x.open && x.date !== today && <Chip tone="warn">{t('noOut')}</Chip>}
                    {x.open && x.date === today && <Chip tone="info">{t('working')}</Chip>}
                    <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      </div>
      <Pager page={page.page} pages={page.pages} param="p" params={{ ...sp }} label={tc('pages')} />
      <p className="px-1 text-sm text-faint">{t('hint')}</p>
    </PageShell>
  );
}
