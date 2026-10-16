// 출퇴근기록 달력형 (PC) — 줄 = 직원, 칸 = 그 달의 날짜 (2026-10-11 의뢰인: PC는 시프티 수준으로. `pc용/시프티 PC 화면 기록.md` 3장 「출퇴근기록 달력형」).
// 칸: 윗줄 출근 · 아랫줄 퇴근. 하루 전부 휴가면 「휴가」, 간주 근무일은 일정 시각 + 「간주」. 오른쪽 끝은 기록이 있는 날 수와 급여용 시간 합.
// 폰(2026-10-15 의뢰인 · 결정 사항 개발-38): 31칸 표를 밀어 보지 않고 월 달력 — 날짜마다 출근 · 지각 · 퇴근 미기록 · 휴가 인원, 날짜를 누르면 아래에 그날 직원 목록(?pd=날짜).
import { getMe } from '@/lib/auth';
import { HelpTip } from '@/components/Help';
import { loadJobs } from '@/lib/job-data';
import { leaveTypeName } from '@/lib/leave';
import { judgeLateness } from '@/lib/lateness';
import { MineBar } from '@/components/MineBar';
import { Chip } from '@/components/ui';
import { SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DeemedNote } from '@/components/DeemedNote';
import { SettingsLink } from '@/components/listframe';
import { PageShell } from '@/components/ui';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays, isoWeekday } from '@/lib/calendar';
import { isFullDayLeave } from '@/lib/leave';
import { buildOrgTree, groupPath, groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { kstDateTime, toKstDate } from '@/lib/time';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function RecordCalendarPage({ searchParams }: { searchParams: Promise<{ ym?: string; q?: string; g?: string; live?: string; pd?: string; dm?: string }> }) {
  const tGear = await getTranslations('frame');
  const admin = (await getMe())?.role === 'admin'; // ⚙ 기준 바로가기는 관리자에게만 (지점관리자는 통합설정에 못 들어간다)
  const [t, tc, f, sp] = await Promise.all([getTranslations('admin.recordCalendar'), getTranslations('common'), getFormatter(), searchParams]);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const today = toKstDate(new Date());
  const ym = sp.ym && YM.test(sp.ym) && sp.ym <= today.slice(0, 7) ? sp.ym : today.slice(0, 7);
  const from = `${ym}-01`;
  const nextFirst = `${addDays(from, 31).slice(0, 7)}-01`;
  const to = addDays(nextFirst, -1);
  const prevYm = addDays(from, -1).slice(0, 7);
  const [data, groups, jobs, tl] = await Promise.all([loadPeriod(from, to, practice), loadOrgGroups(), loadJobs(), getTranslations('leave')]);
  const jobColor = new Map(jobs.map((j) => [j.id, j.color]));
  const groupOptions = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const g = groupOptions.some((o) => o.id === sp.g) ? sp.g! : '';
  const scope = g ? groupScope(groups, g) : null;
  const q = (sp.q ?? '').trim().slice(0, 40);
  // 간주 근무자(근무일정 틀이 간주 근무 — 임원 등)는 기본으로 뺀다. 이름으로 찾거나 dm=1이면 보인다 (2026-10-17 의뢰인)
  const deemedPeople = data.people.filter((p) => p.active && data.templateOf(p.id)?.kind === 'deemed');
  const showDeemed = sp.dm === '1' || !!q;
  const hideDeemed = new Set(showDeemed ? [] : deemedPeople.map((p) => p.id));
  const dmHref = (() => {
    const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== 'dm' && typeof v === 'string' && v) as [string, string][]);
    if (sp.dm !== '1') qs.set('dm', '1');
    return `?${qs}`;
  })();
  const deemedNote = <DeemedNote names={deemedPeople.map((p) => p.name)} shown={showDeemed} href={dmHref} labels={{ hidden: tc('deemedHidden', { n: deemedPeople.length, names: deemedPeople.map((p) => p.name).join(' · ') }), show: tc('deemedShow'), hide: tc('deemedHide') }} />;
  const clock = (d: Date) => f.dateTime(d, { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const link = (over: Record<string, string>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ym, q, g, live: sp.live === '1' ? '1' : '', ...over })) if (v) qs.set(k, v);
    return `/admin/records/calendar?${qs}`;
  };
  // 토요일 · 일요일 · 공휴일(주휴일 포함)은 빨간 글자와 옅은 붉은 바탕 (2026-10-11 의뢰인)
  const redDay = (d: string) => {
    const rule = data.ruleAt(d) ?? data.rule;
    return isoWeekday(d) >= 6 || (rule ? resolveDayType(d, rule, data.holidays) === 'holiday' : false);
  };
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  const rows = data.people
    .filter((p) => p.active && !hideDeemed.has(p.id) && !p.employeeNo?.startsWith('e2e-') && (!scope || (p.groupId && scope.has(p.groupId))) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
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
        // 휴가는 유형 이름으로 적는다(연차 · 반차 …) — 하루 전부면 칸 전체, 일부면 시각 아래에 작게
        const onLeave = leave.get(d) ?? [];
        const rule = data.ruleFor(p.id, d) ?? data.rule;
        const late = !!first && !r?.deemed && r?.dayType === 'workday' && !!rule && judgeLateness({ punchedAt: first, workDate: d, rule, isHoliday: false }).verdict === 'late';
        return { d, in: first ? clock(first) : null, out: last ? clock(last) : null, open: open && d !== today, deemed: !!r?.deemed, late, leave: isFullDayLeave(onLeave), anyLeave: onLeave.length > 0, leaveNames: [...new Set(onLeave.map((l) => leaveTypeName(data.leaveTypes, l.typeCode, tl)))].join(' · ') };
      });
      return { p, cells, worked, payable, color: (p.jobId ? jobColor.get(p.jobId) : null) ?? null };
    });

  // ── 폰 월 달력 ──
  const pd = sp.pd && /^\d{4}-\d{2}-\d{2}$/.test(sp.pd) && sp.pd.startsWith(ym) && sp.pd <= today ? sp.pd : today.startsWith(ym) ? today : to;
  const gridFrom = addDays(from, -(isoWeekday(from) % 7));
  const gridTo = addDays(to, 6 - (isoWeekday(to) % 7));
  const cellsOf = (d: string) => rows.map((r) => ({ r, c: r.cells.find((c) => c.d === d) })).filter((x): x is { r: (typeof rows)[number]; c: (typeof rows)[number]['cells'][number] } => !!x.c);
  const phoneDays: { d: string; inMonth: boolean; came: number; late: number; open: number; leave: number }[] = [];
  for (let d = gridFrom; d <= gridTo; d = addDays(d, 1)) {
    const xs = cellsOf(d);
    phoneDays.push({ d, inMonth: d >= from && d <= to, came: xs.filter((x) => x.c.in).length, late: xs.filter((x) => x.c.late).length, open: xs.filter((x) => x.c.open).length, leave: xs.filter((x) => x.c.anyLeave).length });
  }
  const sunday = addDays(from, -(isoWeekday(from) % 7));
  const weekdayNames = [...Array(7)].map((_, i) => f.dateTime(kstDateTime(addDays(sunday, i), '12:00'), { weekday: 'short' }));
  const dayList = cellsOf(pd).filter((x) => x.c.in || x.c.out || x.c.anyLeave);

  return (
    <PageShell wide>
      <div className="flex flex-col gap-3 lg:hidden" data-phone-records>
        <MineBar menu={tc('menu')} title={t('title')} side={{ href: `/admin/records/list${sp.live === '1' ? '?live=1' : ''}`, label: t('toList') }}>
          <form action="/admin/records/calendar" className="flex items-center gap-2 px-4 pb-2">
            <input type="hidden" name="ym" value={ym} />
            {sp.live === '1' && <input type="hidden" name="live" value="1" />}
            <input type="search" name="q" defaultValue={q} placeholder={t('search')} aria-label={t('search')} maxLength={40} className="h-10 min-w-0 flex-1 rounded-button border border-border bg-bg px-3 text-sm" />
            <select name="g" defaultValue={g} aria-label={t('filter')} className="h-10 max-w-32 rounded-button border border-border bg-surface px-2 text-sm text-muted">
              <option value="">{t('groupAll')}</option>
              {groupOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="submit" className="h-10 shrink-0 rounded-button border border-border bg-bg px-3 text-sm text-muted">
              {t('find')}
            </button>
          </form>
        </MineBar>
        <nav aria-label={t('month')} className="flex items-center justify-center gap-1">
          <Link href={link({ ym: prevYm })} aria-label={t('prev')} className="flex size-11 items-center justify-center text-text">
            <ChevronLeft aria-hidden size={20} />
          </Link>
          <span className="num min-w-28 text-center text-lg font-bold">{f.dateTime(kstDateTime(from, '12:00'), { year: 'numeric', month: 'long' })}</span>
          {nextFirst.slice(0, 7) <= today.slice(0, 7) ? (
            <Link href={link({ ym: nextFirst.slice(0, 7) })} aria-label={t('next')} className="flex size-11 items-center justify-center text-text">
              <ChevronRight aria-hidden size={20} />
            </Link>
          ) : (
            <span className="size-11" />
          )}
          <Link href={link({ ym: today.slice(0, 7), pd: today })} className="ml-1 inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-3 text-sm text-muted">
            {t('thisMonth')}
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
            {phoneDays.map((c) =>
              c.inMonth && c.d <= today ? (
                <Link key={c.d} href={link({ pd: c.d })} scroll={false} aria-current={c.d === pd ? 'date' : undefined} className={`flex min-h-16 flex-col items-center gap-0.5 border-b border-border py-1 ${c.d === pd ? 'bg-primary-tint' : ''}`}>
                  <span className={`num flex size-6 items-center justify-center rounded-chip text-sm ${c.d === today ? 'bg-text font-bold text-on-primary' : redDay(c.d) ? 'text-danger' : ''}`}>{Number(c.d.slice(8))}</span>
                  {c.came > 0 && <span className="num text-xs font-semibold text-primary">{t('cellCame', { n: c.came })}</span>}
                  <span className="flex gap-0.5">
                    {c.late > 0 && <span aria-hidden className="size-1.5 rounded-chip bg-danger" />}
                    {c.open > 0 && <span aria-hidden className="size-1.5 rounded-chip bg-warn" />}
                    {c.leave > 0 && <span aria-hidden className="size-1.5 rounded-chip bg-primary" />}
                  </span>
                </Link>
              ) : (
                <span key={c.d} className={`flex min-h-16 flex-col items-center border-b border-border py-1 ${c.inMonth ? '' : 'opacity-40'}`}>
                  <span className={`num flex size-6 items-center justify-center text-sm ${c.inMonth ? 'text-faint' : redDay(c.d) ? 'text-danger' : ''}`}>{Number(c.d.slice(8))}</span>
                </span>
              ),
            )}
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
          {(
            [
              ['bg-danger', 'dotLate'],
              ['bg-warn', 'dotOpen'],
              ['bg-primary', 'dotLeave'],
            ] as const
          ).map(([c, k]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden className={`size-2 rounded-chip ${c}`} />
              {t(k)}
            </li>
          ))}
        </ul>
        <section data-phone-day>
          {(() => {
            const day = phoneDays.find((x) => x.d === pd);
            return (
              <h2 className="num flex flex-wrap items-baseline justify-between gap-x-2 px-1 pb-2 font-bold">
                {f.dateTime(kstDateTime(pd, '12:00'), { month: 'long', day: 'numeric', weekday: 'short' })}
                <span className="text-sm font-medium text-muted">{t('daySummary', { came: day?.came ?? 0, late: day?.late ?? 0, leave: day?.leave ?? 0 })}</span>
              </h2>
            );
          })()}
          {dayList.length === 0 ? (
            <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('emptyDay')}</p>
          ) : (
            <ul className="-mx-4 divide-y divide-border border-y border-border bg-bg">
              {dayList.map(({ r, c }) => (
                <li key={r.p.id}>
                  <Link href={c.in || c.out ? `/admin/records/${r.p.id}/${pd}${sp.live === '1' ? '?live=1' : ''}` : `/admin/records/${r.p.id}?ym=${ym}`} className="flex min-h-14 items-center gap-3 py-2 pr-4 pl-5">
                    <span className="num flex w-14 shrink-0 flex-col text-sm leading-snug">
                      <span className={`font-semibold ${c.late ? 'text-danger' : ''}`}>{c.in ?? '–'}</span>
                      <span className={c.open ? 'font-bold text-warn' : 'text-muted'}>{c.out ?? '–'}</span>
                    </span>
                    <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-chip ${r.color ? SHIFT_COLOR_CLASS[r.color] : 'bg-border'}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{r.p.name}</span>
                      <span className="truncate text-sm text-muted">{groupPath(groups, r.p.groupId)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {c.late && <Chip tone="warn">{t('late')}</Chip>}
                      {c.open && <Chip tone="warn">{t('noOut')}</Chip>}
                      {c.deemed && <Chip>{t('deemed')}</Chip>}
                      {c.anyLeave && <Chip tone="info">{c.leaveNames || t('leave')}</Chip>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="hidden flex-col gap-4 lg:flex">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}{admin && <SettingsLink href="/admin/settings?tab=punch" label={tGear('item.setPunch')} />}<HelpTip>{t('pcIntro')}</HelpTip></h1>
        </div>
{(await getMe())?.role === 'admin' ? (
        <a href={`/api/admin/export/report?m=${ym}${sp.live === '1' ? '&live=1' : ''}`} title={tc('downloadReport', { ym })} className="ml-auto inline-flex h-8 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold whitespace-nowrap text-text hover:bg-surface">
          <Download aria-hidden size={16} />
          {tc('download')}
        </a>
        ) : (
          <span className="ml-auto" />
        )}
        <Link href={`/admin/records/list${sp.live === '1' ? '?live=1' : ''}`} className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
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
                const red = redDay(d);
                return (
                  <th key={d} scope="col" className={`num min-w-11 border-r border-border px-0.5 py-2 text-center text-xs! whitespace-nowrap ${d === today ? 'bg-primary-tint!' : red ? 'bg-danger-tint!' : ''} ${red ? 'text-danger!' : ''}`}>
                    {Number(d.slice(8))}/{f.dateTime(kstDateTime(d, '12:00'), { weekday: 'narrow' })}
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
            {rows.map(({ p, cells, worked, payable, color }) => (
              <tr key={p.id}>
                <th scope="row" className="sticky left-0 z-10 border-r border-b border-border bg-bg px-3 py-1.5 text-left font-normal">
                  <Link href={`/admin/records/${p.id}?ym=${ym}${sp.live === '1' ? '&live=1' : ''}`} className="text-sm font-bold hover:text-primary">
                    {p.name}
                  </Link>
                  <span className="block truncate text-faint">{groupPath(groups, p.groupId)}</span>
                </th>
                {cells.map((c) => (
                  <td key={c.d} className={`num border-r border-b border-border p-0 text-center align-middle ${c.d === today ? 'bg-primary-tint' : redDay(c.d) ? 'bg-danger-tint' : ''}`}>
                    {c.in || c.out ? (
                      <Link href={`/admin/records/${p.id}/${c.d}${sp.live === '1' ? '?live=1' : ''}`} title={c.open ? t('noOut') : undefined} className={`flex flex-col px-1 py-1.5 leading-tight hover:bg-primary-tint ${c.deemed ? 'text-muted' : ''}`}>
                        <span>{c.in ?? '–'}</span>
                        <span className={c.open ? 'font-bold text-warn' : ''}>{c.out ?? '–'}</span>
                        {c.deemed && <span className="text-faint">{t('deemed')}</span>}
                        {!c.leave && c.leaveNames && <span className="truncate text-muted">{c.leaveNames}</span>}
                        {/* 직무 색 띠 — 시프티 달력형의 칸 아래 색 띠처럼 누가 어느 직무인지 한눈에 */}
                        <span aria-hidden className={`mt-1 h-1 ${color ? SHIFT_COLOR_CLASS[color] : 'bg-border'}`} />
                      </Link>
                    ) : c.leave ? (
                      <span className="block bg-surface px-0.5 py-2 text-muted">{c.leaveNames || t('leave')}</span>
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
      </div>
      {deemedNote}
    </PageShell>
  );
}
