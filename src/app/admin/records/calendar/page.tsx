// 출퇴근기록 달력형 (PC) — 줄 = 직원, 칸 = 그 달의 날짜 (2026-10-11 의뢰인: PC는 시프티 수준으로. `pc용/시프티 PC 화면 기록.md` 3장 「출퇴근기록 달력형」).
// 칸: 윗줄 출근 · 아랫줄 퇴근. 하루 전부 휴가면 「휴가」, 간주 근무일은 일정 시각 + 「간주」. 오른쪽 끝은 기록이 있는 날 수와 급여용 시간 합.
// 폰에서는 목록형으로 보낸다 — 31칸 표는 폰 폭에 맞지 않는다.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageShell } from '@/components/ui';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { isFullDayLeave } from '@/lib/leave';
import { buildOrgTree, groupPath, groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { kstDateTime, toKstDate } from '@/lib/time';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function RecordCalendarPage({ searchParams }: { searchParams: Promise<{ ym?: string; q?: string; g?: string; live?: string }> }) {
  const [t, f, sp] = await Promise.all([getTranslations('admin.recordCalendar'), getFormatter(), searchParams]);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const today = toKstDate(new Date());
  const ym = sp.ym && YM.test(sp.ym) && sp.ym <= today.slice(0, 7) ? sp.ym : today.slice(0, 7);
  const from = `${ym}-01`;
  const nextFirst = `${addDays(from, 31).slice(0, 7)}-01`;
  const to = addDays(nextFirst, -1);
  const prevYm = addDays(from, -1).slice(0, 7);
  const [data, groups] = await Promise.all([loadPeriod(from, to, practice), loadOrgGroups()]);
  const groupOptions = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const g = groupOptions.some((o) => o.id === sp.g) ? sp.g! : '';
  const scope = g ? groupScope(groups, g) : null;
  const q = (sp.q ?? '').trim().slice(0, 40);
  const clock = (d: Date) => f.dateTime(d, { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const link = (over: Record<string, string>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ym, q, g, live: sp.live === '1' ? '1' : '', ...over })) if (v) qs.set(k, v);
    return `/admin/records/calendar?${qs}`;
  };
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  const rows = data.people
    .filter((p) => p.active && !p.employeeNo?.startsWith('e2e-') && (!scope || (p.groupId && scope.has(p.groupId))) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
    .map((p) => {
      const byDate = new Map(daysFor(data, p.id).map((d) => [d.workDate, d]));
      const leave = leaveDaysFor(data, p.id);
      let worked = 0;
      let payable = 0;
      const cells = days.map((d) => {
        const r = byDate.get(d);
        const first = r?.pairs.find((x) => x.in)?.in ?? null;
        const open = !!r?.pairs.some((x) => x.in && !x.out);
        const last = open ? null : ([...(r?.pairs ?? [])].reverse().find((x) => x.out)?.out ?? null);
        if (r && r.pairs.length) {
          worked++;
          payable += r.payableMinutes;
        }
        return { d, in: first ? clock(first) : null, out: last ? clock(last) : null, open: open && d !== today, deemed: !!r?.deemed, leave: isFullDayLeave(leave.get(d)) };
      });
      return { p, cells, worked, payable };
    });

  return (
    <PageShell wide>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link href={`/admin/records/list${sp.live === '1' ? '?live=1' : ''}`} className="inline-flex min-h-8 items-center rounded-button border border-nav bg-bg px-4 text-sm font-bold text-nav">
          {t('toList')}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex">
          <Link href={link({ ym: prevYm })} aria-label={t('prev')} className="inline-flex size-8 items-center justify-center rounded-l-button border border-border bg-bg text-muted">
            <ChevronLeft aria-hidden size={16} />
          </Link>
          {nextFirst.slice(0, 7) <= today.slice(0, 7) ? (
            <Link href={link({ ym: nextFirst.slice(0, 7) })} aria-label={t('next')} className="-ml-px inline-flex size-8 items-center justify-center rounded-r-button border border-border bg-bg text-muted">
              <ChevronRight aria-hidden size={16} />
            </Link>
          ) : (
            <span aria-hidden className="-ml-px inline-flex size-8 items-center justify-center rounded-r-button border border-border bg-surface text-border">
              <ChevronRight size={16} />
            </span>
          )}
        </div>
        <Link href={link({ ym: today.slice(0, 7) })} className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-4 text-sm text-muted">
          {t('thisMonth')}
        </Link>
        <p className="num ml-2 text-lg font-bold">{f.dateTime(kstDateTime(from, '12:00'), { year: 'numeric', month: 'long' })}</p>
        <form action="/admin/records/calendar" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="ym" value={ym} />
          {sp.live === '1' && <input type="hidden" name="live" value="1" />}
          <input type="search" name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} maxLength={40} className="min-h-8 w-44 rounded-button border border-border bg-bg px-3" />
          <select name="g" defaultValue={g} aria-label={t('filter')} className="min-h-8 rounded-button border border-border bg-surface px-2 text-muted">
            <option value="">{t('groupAll')}</option>
            {groupOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="submit" className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-3 text-sm text-muted">
            {t('apply')}
          </button>
        </form>
      </div>
      <p className="text-xs text-faint">
        {practice ? t('practice') : t('live')} · {t('hint')}
      </p>
      <div className="overflow-x-auto rounded-card border border-border bg-bg shadow-card">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-36 min-w-36 border-r border-border px-3 py-2 text-left">
                {t('colEmployee')}
              </th>
              {days.map((d) => {
                const rule = data.ruleAt(d) ?? data.rule;
                const red = rule ? resolveDayType(d, rule, data.holidays) === 'holiday' : false;
                return (
                  <th key={d} scope="col" className={`num min-w-12 border-r border-border px-1 py-2 text-center text-xs! ${d === today ? 'bg-primary-tint!' : ''} ${red ? 'text-danger!' : ''}`}>
                    {f.dateTime(kstDateTime(d, '12:00'), { day: 'numeric', weekday: 'narrow' })}
                  </th>
                );
              })}
              <th scope="col" className="min-w-24 px-2 py-2 text-right">
                {t('colTotal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={days.length + 2} className="px-3 py-8 text-center text-sm text-faint">
                  {t('empty')}
                </td>
              </tr>
            )}
            {rows.map(({ p, cells, worked, payable }) => (
              <tr key={p.id}>
                <th scope="row" className="sticky left-0 z-10 border-r border-b border-border bg-bg px-3 py-1.5 text-left font-normal">
                  <Link href={`/admin/records/${p.id}?ym=${ym}${sp.live === '1' ? '&live=1' : ''}`} className="text-sm font-bold hover:text-primary">
                    {p.name}
                  </Link>
                  <span className="block truncate text-faint">{groupPath(groups, p.groupId)}</span>
                </th>
                {cells.map((c) => (
                  <td key={c.d} className={`num border-r border-b border-border p-0 text-center align-middle ${c.d === today ? 'bg-primary-tint' : ''}`}>
                    {c.in || c.out ? (
                      <Link href={`/admin/records/${p.id}/${c.d}${sp.live === '1' ? '?live=1' : ''}`} title={c.open ? t('noOut') : undefined} className={`flex flex-col px-1 py-1.5 leading-tight hover:bg-primary-tint ${c.deemed ? 'text-muted' : ''}`}>
                        <span>{c.in ?? '–'}</span>
                        <span className={c.open ? 'font-bold text-warn' : ''}>{c.out ?? '–'}</span>
                        {c.deemed && <span className="text-faint">{t('deemed')}</span>}
                      </Link>
                    ) : c.leave ? (
                      <span className="block bg-surface px-1 py-2 text-muted">{t('leave')}</span>
                    ) : null}
                  </td>
                ))}
                <td className="num border-b border-border px-2 py-1.5 text-right">
                  <span className="block text-sm font-bold">{t('days', { n: worked })}</span>
                  <span className="text-muted">{hm(payable)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
