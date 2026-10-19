// 출퇴근기록 — 전체 목록 (의뢰인 2026-10-10: 시프티의 「출퇴근기록」 탭처럼).
// 위: 검색 · 거르기 · 기간 · [내 기록]. 아래: 날짜 머리줄(그날 합계) + 기록 한 건이 한 줄 = 출근/퇴근 시각 · 직무 색 막대 · 이름 · 지점/직무 · 배지.
// 합계는 그날 보이는 사람들의 근무 시간(휴게 제외) 합이다. 줄을 누르면 그 기록의 상세(큰 시각 + 항목—값), 거기서 [수정]으로 그 직원의 그 달 기록(정정·대리 입력).
// 월 집계·엑셀 내려받기는 「월 집계」 화면(/admin/records)에 그대로 있다.
import { loadOfficeLocations } from '@/lib/geo-data';
import { HelpTip } from '@/components/Help';
import { SheetOpener } from '@/components/SheetOpener';
import { CircleCheck, Download } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DeemedNote } from '@/components/DeemedNote';
import { AddSheet } from '@/components/AddSheet';
import { ConfirmAll } from '@/components/ConfirmRecords';
import { Fab } from '@/components/Fab';
import { ListBar } from '@/components/ListBar';
import { Pager, pageOf } from '@/components/Pager';
import { SettingsLink } from '@/components/listframe';
import { Card, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { confirmKey, loadConfirms } from '@/lib/confirm-data';
import { loadJobs } from '@/lib/job-data';
import { missingRange } from '@/lib/missing-list';
import { buildOrgTree, groupPath, groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, leaveDaysFor, loadPeriod } from '@/lib/period-data';
import { judgeLateness } from '@/lib/lateness';
import { leaveTypeName } from '@/lib/leave';
import { SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { kstDateTime, toKstDate } from '@/lib/time';
import { RecordAdd } from './RecordAdd';

// 폰: 한 쪽에 하루(최근 날부터) — 실제 직원 24명을 넣고 보니 7일이면 8천 px가 넘었다 (2026-10-16 디자인)
const DATES_PER_PAGE = 1;
// PC 표: 한 쪽에 60줄
const ROWS_PER_PAGE = 60;
type Line = { key: string; idx: number; id: string; name: string; sub: string; color: string; date: string; start: string; end: string | null; deemed: boolean; confirmed: boolean; open: boolean; outside: boolean; sort: number };

export default async function RecordListPage({ searchParams }: { searchParams: Promise<{ q?: string; g?: string; from?: string; to?: string; live?: string; p?: string; pp?: string; dm?: string }> }) {
  const tGear = await getTranslations('frame');
  const [t, tc, f, sp, tCal, tl] = await Promise.all([getTranslations('admin.recordList'), getTranslations('common'), getFormatter(), searchParams, getTranslations('admin.recordCalendar'), getTranslations('leave')]);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const today = toKstDate(new Date());
  // 기본 기간: 이번 달 1일 ~ 오늘 (한 번에 62일까지)
  const { from, to } = missingRange(sp.from ?? `${today.slice(0, 8)}01`, sp.to, today, addDays);
  const [data, groups, jobs, confirms] = await Promise.all([loadPeriod(from, to, practice), loadOrgGroups(), loadJobs(), loadConfirms(from, to, practice)]);
  const jobOf = new Map(jobs.map((j) => [j.id, j]));
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
  const clock = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const lines: Line[] = [];
  // PC 표: 한 줄 = 직원의 하루 (시프티 PC 「출퇴근기록 목록형」). 찍힌 그대로의 시간과 급여용 시간(끊은 것)을 나란히 보인다
  const dayRows: { key: string; id: string; name: string; sub: string; date: string; time: string; plan: string; breakMin: number; net: number; payable: number; deemed: boolean; confirmed: boolean; open: boolean; placeIn: string; placeOut: string; diffIn: number | null; diffOut: number | null; late: boolean; leaveNames: string }[] = [];
  // 출근 · 퇴근 장소(어느 출퇴근 장소로 확인됐는가)와 일정 대비 오차 — 시프티 목록형의 열 (2026-10-11 의뢰인 스샷 `스샷/출퇴근기록 목록형.png`)
  const placeName = new Map((await loadOfficeLocations(true)).map((l) => [l.id, l.label ?? '']));
  const placeOf = (employeeId: string, date: string, kind: 'in' | 'out') => {
    const evs = data.events.filter((e) => e.employeeId === employeeId && e.workDate === date && e.kind === kind && e.locationId);
    const e = kind === 'in' ? evs[0] : evs.at(-1);
    return e?.locationId ? (placeName.get(e.locationId) ?? '') : '';
  };
  const diffMin = (at: Date | null | undefined, date: string, hhmm: string | undefined) => (at && hhmm ? Math.round((at.getTime() - kstDateTime(date, hhmm).getTime()) / 60000) : null);
  const totalOf = new Map<string, number>();
  for (const p of data.people) {
    if (p.employeeNo?.startsWith('e2e-')) continue;
    if (hideDeemed.has(p.id)) continue;
    if (scope && !(p.groupId && scope.has(p.groupId))) continue;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) continue;
    const job = p.jobId ? jobOf.get(p.jobId) : undefined;
    const sub = [groupPath(groups, p.groupId), job?.name].filter(Boolean).join(' / ');
    // 간주 근무 줄: 그날 일정이 간주 근무이고 찍은 기록·승인된 정정이 하나도 없을 때 (계산이 일정 시간으로 채운 줄)
    const leaveOf = leaveDaysFor(data, p.id);
    for (const d of daysFor(data, p.id)) {
      if (d.pairs.length === 0) continue;
      totalOf.set(d.workDate, (totalOf.get(d.workDate) ?? 0) + d.netMinutes);
      {
        const plan = data.planFor(p.id, d.workDate);
        const first = d.pairs.find((x) => x.in)?.in;
        const last = [...d.pairs].reverse().find((x) => x.out)?.out;
        const stillOpen = d.pairs.some((x) => x.in && !x.out);
        // 지각 · 휴가도 상태 칸에 (2026-10-19 의뢰인: PC에서는 지각 · 퇴근 미기록 · 휴가를 구분할 수 없었다) — 달력형과 같은 판정
        const rule = data.ruleFor(p.id, d.workDate) ?? data.rule;
        const late = !!first && !d.deemed && d.dayType === 'workday' && !!rule && judgeLateness({ punchedAt: first, workDate: d.workDate, rule, isHoliday: false }).verdict === 'late';
        const leaveNames = [...new Set((leaveOf.get(d.workDate) ?? []).map((l) => leaveTypeName(data.leaveTypes, l.typeCode, tl)))].join(' · ');
        dayRows.push({
          late, leaveNames,
          key: `${p.id}${d.workDate}`, id: p.id, name: p.name, sub, date: d.workDate,
          time: `${first ? clock(first) : '–'} - ${last && !stillOpen ? clock(last) : '–'}`,
          plan: plan.items.length ? plan.items.map((it) => `${it.startTime} - ${it.endTime}`).join(', ') : t('noPlan'),
          breakMin: d.breakMinutes, net: d.netMinutes, payable: d.payableMinutes, deemed: !!plan.deemed, confirmed: confirms.has(confirmKey(p.id, d.workDate)), open: stillOpen,
          placeIn: placeOf(p.id, d.workDate, 'in'), placeOut: placeOf(p.id, d.workDate, 'out'),
          // 간주 근무는 일정 시각으로 계산하므로 오차가 없다
          diffIn: plan.deemed ? null : diffMin(first, d.workDate, plan.items[0]?.startTime), diffOut: plan.deemed || stillOpen ? null : diffMin(last, d.workDate, plan.items.at(-1)?.endTime),
        });
      }
      d.pairs.forEach((pair, i) => {
        const at = pair.in ?? pair.out;
        if (!at) return;
        lines.push({
          key: `${p.id}${d.workDate}${i}`, idx: i, id: p.id, name: p.name, sub, color: job ? SHIFT_COLOR_CLASS[job.color] : 'bg-border', date: d.workDate,
          start: pair.in ? clock(pair.in) : '–', end: pair.out ? clock(pair.out) : null,
          deemed: !!data.planFor(p.id, d.workDate).deemed, confirmed: confirms.has(confirmKey(p.id, d.workDate)), open: !!pair.in && !pair.out, outside: false, sort: at.getTime(),
        });
      });
    }
  }
  const dates = [...new Set(lines.map((x) => x.date))].sort().reverse();
  const page = pageOf(dates, sp.p, DATES_PER_PAGE);
  const pcPage = pageOf([...dayRows].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)), sp.pp, ROWS_PER_PAGE);
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: min % 60 });
  const keep = { live: sp.live === '1' ? '1' : undefined };
  // + 버튼(기록 추가): 지금 운영 모드의 기록에만, 본인 것은 빼고 (직원별 기록 화면의 대리 등록과 같은 규칙)
  const me = await getMe();
  const admin = me?.role === 'admin'; // 지점관리자는 보기만 (manager-rules.ts)
  const canAdd = practice === OFFICE.practiceMode && admin;
  const addable = data.people.filter((p) => p.active && p.id !== me?.id && !p.employeeNo?.startsWith('e2e-')).map((p) => ({ id: p.id, name: p.name, group: groupPath(groups, p.groupId) }));

  return (
    <PageShell wide flush>
      <h1 className="sr-only lg:hidden">{t('title')}</h1>
      {/* PC: 목록형 표 — 제목 · [월 집계] [기록 추가] / 기간 · 검색 · 부서 / 합계 / 표 */}
      <div className="hidden flex-col gap-4 lg:flex">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}{admin && <SettingsLink href="/admin/settings?tab=punch" label={tGear('item.setPunch')} />}<HelpTip>{t('pcIntro')} {t('hint')}</HelpTip></h1>
          </div>
          <div className="flex items-center gap-2">
{admin && (
            <a href={`/api/admin/export/report?m=${to.slice(0, 7)}${sp.live === '1' ? '&live=1' : ''}`} title={tc('downloadReport', { ym: to.slice(0, 7) })} className="inline-flex h-8 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold whitespace-nowrap text-text hover:bg-surface">
              <Download aria-hidden size={16} />
              {tc('download')}
            </a>
            )}
            <Link href="/admin/records" className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
              {t('toMonth')}
            </Link>
            {canAdd && <SheetOpener id="record" label={t('add')} />}
          </div>
        </div>
        <form action="/admin/records/list" className="flex flex-wrap items-center gap-2">
          {sp.live === '1' && <input type="hidden" name="live" value="1" />}
          <input type="date" name="from" defaultValue={from} max={today} aria-label={t('from')} className="num min-h-8 rounded-button border border-border bg-bg px-2" />
          <span className="text-muted">-</span>
          <input type="date" name="to" defaultValue={to} max={today} aria-label={t('to')} className="num min-h-8 rounded-button border border-border bg-bg px-2" />
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
          <p className="num ml-auto flex items-center gap-4 text-muted">
            <span>
              {t('totalAll')} <b className="text-lg text-text">{hm(dayRows.reduce((a, r) => a + r.net, 0))}</b>
            </span>
            <span>
              {t('payableAll')} <b className="text-lg text-text">{hm(dayRows.reduce((a, r) => a + r.payable, 0))}</b>
            </span>
          </p>
        </form>
        <p className="text-xs text-faint">{practice ? t('practice') : t('live')}</p>
        <div className="overflow-x-auto rounded-card border border-border bg-bg shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {(['colEmployee', 'colDate', 'colTime', 'colPlan', 'colPlace'] as const).map((k) => (
                  <th key={k} scope="col" className="px-2.5 py-2.5">
                    {t(k)}
                  </th>
                ))}
                {(['colBreak', 'colTotal', 'colPayable', 'colDiff'] as const).map((k) => (
                  <th key={k} scope="col" className="px-2.5 py-2.5 text-right">
                    {t(k)}
                  </th>
                ))}
                <th scope="col" className="px-2.5 py-2.5">
                  {t('colState')}
                </th>
                <th scope="col" className="px-2.5 py-2.5 text-center">
                  {t('colConfirmed')}
                </th>
              </tr>
            </thead>
            <tbody>
              {dayRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-faint">
                    {data.rule ? t('empty') : t('noRule')}
                  </td>
                </tr>
              )}
              {pcPage.items.map((r) => (
                  <tr key={r.key}>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <Link href={`/admin/records/${r.id}/${r.date}${sp.live === '1' ? '?live=1' : ''}`} className="font-bold hover:text-primary">
                        {r.name}
                      </Link>
                      {r.sub && <span className="block max-w-40 truncate text-xs text-faint" title={r.sub}>{r.sub}</span>}
                    </td>
                    <td className="num px-2.5 py-2.5 whitespace-nowrap">{f.dateTime(kstDateTime(r.date, '12:00'), { month: '2-digit', day: '2-digit', weekday: 'short' })}</td>
                    <td className={`num px-2.5 py-2.5 whitespace-nowrap ${r.late ? 'font-bold text-danger' : ''}`}>{r.time}</td>
                    <td className="num px-2.5 py-2.5 whitespace-nowrap text-muted">{r.plan}</td>
                    {/* 출근 · 퇴근 장소를 한 칸에 — 같으면 하나만, 다르면 「출근 → 퇴근」 */}
                    <td className="max-w-44 truncate px-2.5 py-2.5 whitespace-nowrap text-muted" title={r.placeIn === r.placeOut || !r.placeOut ? r.placeIn : `${r.placeIn || '–'} → ${r.placeOut}`}>{r.placeIn === r.placeOut || !r.placeOut ? r.placeIn : `${r.placeIn || '–'} → ${r.placeOut}`}</td>
                    <td className="num px-2.5 py-2.5 text-right whitespace-nowrap text-muted">{t('min', { n: r.breakMin })}</td>
                    <td className="num px-2.5 py-2.5 text-right whitespace-nowrap">{hm(r.net)}</td>
                    {/* 굵은 글씨는 문제가 있는 값에만 — 모든 줄이 굵으면 눈에 띄는 것이 없다 (2026-10-19 의뢰인) */}
                    <td className="num px-2.5 py-2.5 text-right whitespace-nowrap">{hm(r.payable)}</td>
                    {/* 일정과의 차이 — 출근 · 퇴근을 한 칸에 두 줄로. 늦은 출근 · 이른 퇴근은 주황 */}
                    <td className="num px-2.5 py-2.5 text-right text-xs leading-snug whitespace-nowrap">
                      {[r.diffIn, r.diffOut].map((v, i) =>
                        v === null || v === 0 ? null : (
                          <span key={i} className={`block ${(i === 0 && v > 0) || (i === 1 && v < 0) ? 'text-warn' : 'text-muted'}`}>
                            {t(i === 0 ? 'diffInShort' : 'diffOutShort')} {t(v > 0 ? 'diffPlus' : 'diffMinus', { n: Math.abs(v) < 60 ? t('min', { n: Math.abs(v) }) : hm(Math.abs(v)) })}
                          </span>
                        ),
                      )}
                    </td>
                    <td className="px-2.5 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {r.late && <Chip tone="danger">{tCal('dotLate')}</Chip>}
                        {r.open && r.date !== today && <Chip tone="warn">{t('noOut')}</Chip>}
                        {r.leaveNames && <Chip tone="info">{r.leaveNames}</Chip>}
                        {r.deemed && <Chip>{t('deemed')}</Chip>}
                        {r.open && r.date === today && <Chip tone="info">{t('working')}</Chip>}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-center">
                      <CircleCheck aria-label={t(r.confirmed ? 'confirmed' : 'unconfirmed')} size={20} className={`inline ${r.confirmed ? 'text-primary' : 'text-border'}`} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pager page={pcPage.page} pages={pcPage.pages} param="pp" params={{ ...sp }} label={tc('pages')} />
      </div>
      <div className="flex flex-col lg:hidden">
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
        labels={{ menu: tc('menu'), search: t('search'), filter: t('filter'), period: t('period'), from: t('from'), to: t('to'), apply: t('apply'), groupAll: t('groupAll') }}
      />
      {!data.rule && <p className="mt-3 rounded-card bg-bg p-5 text-sm text-faint">{t('noRule')}</p>}
      {data.rule && dates.length === 0 && <p className="mt-3 rounded-card bg-bg p-5 text-sm text-faint">{t('empty')}</p>}
      <div className="flex flex-col">
      {page.items.map((d) => {
        const rows = lines.filter((x) => x.date === d).sort((a, b) => a.name.localeCompare(b.name) || a.sort - b.sort);
        // 「모두 확정」에 보낼 것: 아직 확정 안 된 사람(본인 제외). 퇴근이 빠진 날 등은 서버가 건너뛰고 건수를 알려 준다
        const todo = canAdd ? [...new Set(rows.filter((x) => !x.confirmed && x.id !== me?.id).map((x) => x.id))].map((id) => ({ employeeId: id, date: d })) : [];
        return (
          <section key={d}>
            <h2 className="num -mx-4 flex items-center justify-between border-b border-border bg-surface px-5 py-3 font-bold lg:mx-0">
              <span>{f.dateTime(kstDateTime(d, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</span>
              <span className="flex items-center gap-3">
                <ConfirmAll items={todo} />
                <span>{hm(totalOf.get(d) ?? 0)}</span>
              </span>
            </h2>
            <ul className="-mx-4 divide-y divide-border border-b border-border bg-bg lg:mx-0">
              {rows.map((x) => (
                <li key={x.key}>
                  <Link href={`/admin/records/${x.id}/${x.date}?i=${x.idx}${sp.live === '1' ? '&live=1' : ''}`} className="flex min-h-16 items-center gap-3 py-2 pr-3 pl-5">
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
                    <CircleCheck aria-label={t(x.confirmed ? 'confirmed' : 'unconfirmed')} size={24} className={`shrink-0 ${x.confirmed ? 'text-primary' : 'text-border'}`} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      </div>
      <Pager page={page.page} pages={page.pages} param="p" params={{ ...sp }} label={tc('pages')} labelOf={(n) => { const d = dates[n - 1]; return d ? f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'long', day: 'numeric', weekday: 'short' }) : String(n); }} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 px-1 pt-2 text-sm">
        <span className="text-muted">{practice ? t('practice') : t('live')}</span>
        <Link href="/admin/records" className="inline-flex min-h-11 items-center font-medium text-primary">
          {t('toMonth')} ›
        </Link>
      </div>
      <p className="px-1 text-sm text-faint">{t('hint')}</p>
      </div>
      {canAdd && (
        <>
          <AddSheet id="record" title={t('add')} modal>
            <Card className="flex flex-col gap-3">
              <h2 className="hidden text-sm font-medium text-muted lg:block">{t('add')}</h2>
              <RecordAdd people={addable} today={today} />
            </Card>
          </AddSheet>
          <Fab label={t('add')} items={[{ id: 'record', label: t('add') }]} />
        </>
      )}
      {deemedNote}
    </PageShell>
  );
}
