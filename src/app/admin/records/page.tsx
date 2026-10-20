// ③ 기록 — 월간 집계 + 내려받기 모음 (마스터 5장, ①-4 7-10, 부록 R-10-5·R-10-6).
// 네 묶음 이름 통일: 실제 · 인정 · 보류 · 미검토. 폰(<768px)은 카드, 넓은 화면만 표 — 표는 자기 상자 안에서만 가로 스크롤.
// 색은 예외에만(지각·미기록·미승인) + 글자/아이콘을 함께.
// 직원 이름(넓은 화면)·「날짜별 기록 보기」(폰)를 누르면 그 직원의 하루 단위 기록으로 간다 (records/[id]).
import { ChevronDown, ChevronLeft, ChevronRight, Download, ShieldAlert } from 'lucide-react';
import { HelpTip } from '@/components/Help';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { GroupFilter } from '@/components/GroupFilter';
import { Pager, pageOf } from '@/components/Pager';
import { ScopeSwitch } from '@/components/ScopeSwitch';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { FLAG } from '@/lib/flags';
import { buildMonth, isYearMonth } from '@/lib/month-data';
import { buildOrgTree, groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { kstDateTime, toKstDate } from '@/lib/time';
import { groupPath } from '@/lib/org';
import { PunchBulk } from './PunchBulk';

function shift(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ m?: string; live?: string; p?: string; f?: string; g?: string }> }) {
  const t = await getTranslations('admin.records');
  const me = (await getMe())!;
  const sp = await searchParams;
  const ym = isYearMonth(sp.m) ? sp.m : toKstDate(new Date()).slice(0, 7);
// ★ 연습 모드에서는 모든 기록이 연습 기록이다 — 관리자 화면도 기본으로 연습 기록을 본다 (2026-10-02: 시험직원 정정 요청이 관리자에게 0건으로 보이던 문제). ?live=1이면 실제 기록
  const practice = OFFICE.practiceMode && sp.live !== '1';
  // 부서·팀으로 걸러 보기 (조직도, 2026-10-05). 부서를 고르면 그 밑의 팀 직원도 함께 나온다. 엑셀 내려받기는 걸러지지 않는다(전체)
  const groups = await loadOrgGroups();
  const groupOptions = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const g = groupOptions.some((o) => o.id === sp.g) ? sp.g! : '';
  const q = (m: string) => `?m=${m}${OFFICE.practiceMode && !practice ? '&live=1' : ''}${g ? `&g=${g}` : ''}`;
  const month = await buildMonth(ym, practice);
  const data = month.data;
  const scope = g ? groupScope(groups, g) : null;
  const rows = scope ? month.rows.filter((x) => x.person.groupId && scope.has(x.person.groupId)) : month.rows;
  // 확인이 필요한 사람: 지각·결근·미승인 연장·막힘 표시 중 하나라도 있으면
  const hasIssue = (r: (typeof rows)[number]['summary']['row']) =>
    Number(r.late_count) > 0 || Number(r.absent_days) > 0 || Number(r.pending_overtime_minutes) > 0 || String(r.flags).split(';').some((f) => f.startsWith('block:') && f !== FLAG.LEAVE_MODULE_MISSING);
  const issueRows = rows.filter((x) => hasIssue(x.summary.row));
  const onlyIssues = sp.f === 'issues';
  // 요약 숫자를 누르면 그 사람만 (2026-10-19 의뢰인: 이 달 지각 · 결근을 누르면 누가 그런지 바로) — 폰 목록 · PC 표 둘 다 같은 걸러진 목록
  const pick = sp.f === 'late' || sp.f === 'absent' || sp.f === 'pending' ? sp.f : null;
  const pickTest = { late: (r: (typeof rows)[number]['summary']['row']) => Number(r.late_count) > 0, absent: (r: (typeof rows)[number]['summary']['row']) => Number(r.absent_days) > 0, pending: (r: (typeof rows)[number]['summary']['row']) => Number(r.pending_overtime_minutes) > 0 };
  const shown = pick ? rows.filter((x) => pickTest[pick](x.summary.row)).sort((a, b) => (pick === 'late' ? Number(b.summary.row.late_count) - Number(a.summary.row.late_count) : pick === 'absent' ? Number(b.summary.row.absent_days) - Number(a.summary.row.absent_days) : 0)) : rows;
  const pageRows = pageOf(pick ? shown : onlyIssues ? issueRows : rows, sp.p, 10);
  const totals = {
    late: rows.reduce((a, x) => a + Number(x.summary.row.late_count), 0),
    absent: rows.reduce((a, x) => a + Number(x.summary.row.absent_days), 0),
    pending: rows.filter((x) => Number(x.summary.row.pending_overtime_minutes) > 0).length,
  };
  const f = await getFormatter();
  const md = (d: string) => f.dateTime(kstDateTime(d, '12:00'), { month: 'numeric', day: 'numeric', weekday: 'short' });
  const clock = (iso: string) => f.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hm = (min: number) => t('hm', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') });

  return (
    <PageShell wide>
      <ScopeSwitch kind="attendance" current="all" />
      {/* 출퇴근 기록 엑셀 일괄 입력 (2026-10-20 노프로 비교) — 접힌 한 줄 */}
      <PunchBulk today={toKstDate(new Date())} />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('title')}<HelpTip>{t('intro')}</HelpTip></h1>
        </div>
        <nav className="flex items-center gap-1" aria-label={t('month')}>
          <Link href={q(shift(ym, -1))} className="flex min-h-11 min-w-11 items-center justify-center" aria-label={t('prev')}>
            <ChevronLeft aria-hidden size={22} strokeWidth={1.75} />
          </Link>
          <span className="num text-xl font-semibold">{ym}</span>
          <Link href={q(shift(ym, 1))} className="flex min-h-11 min-w-11 items-center justify-center" aria-label={t('next')}>
            <ChevronRight aria-hidden size={22} strokeWidth={1.75} />
          </Link>
        </nav>
      </header>
      {/* 바로가기 한 줄 — 기록 목록 · 연습/실제 기록 바꾸기 (2026-10-16 디자인: 링크가 한 줄씩 떨어져 세로가 길었다) */}
      <div className="flex flex-wrap items-center gap-x-4 text-sm">
        <Link href="/admin/records/list" className="inline-flex min-h-11 items-center font-medium text-primary">
          ‹ {t('toList')}
        </Link>
        {OFFICE.practiceMode && (
          <Link href={practice ? `?m=${ym}&live=1` : `?m=${ym}`} className="ml-auto inline-flex min-h-11 items-center text-primary">
            {practice ? t('showLive') : t('showPractice')}
          </Link>
        )}
      </div>
      <GroupFilter value={g} options={groupOptions} allLabel={t('groupAll')} label={t('groupFilter')} params={{ m: ym, live: OFFICE.practiceMode && !practice ? '1' : undefined }} />
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}
      {!data.rule && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{t('noRule')}</p>}
      {data.rule && rows.length === 0 && <p className="text-muted">{t('empty')}</p>}

      {/* 이 달 요약 — 한 줄로 */}
      {rows.length > 0 && (
        <Card className="grid grid-cols-3 p-2 text-center">
          {(
            [
              { f: 'late', k: 'sumLate', n: totals.late },
              { f: 'absent', k: 'sumAbsent', n: totals.absent },
              { f: 'pending', k: 'sumPending', n: totals.pending },
            ] as const
          ).map((x) =>
            x.n > 0 ? (
              // 누르면 그 사람만, 다시 누르면 전체 (숫자가 0이면 누를 것이 없다)
              <Link key={x.k} href={`${q(ym)}${pick === x.f ? '' : `&f=${x.f}`}`} scroll={false} aria-pressed={pick === x.f} className={`flex min-h-16 flex-col items-center justify-center rounded-button transition-colors duration-150 ${pick === x.f ? 'bg-warn-tint ring-2 ring-warn' : 'hover:bg-surface'}`}>
                <span className="num text-2xl leading-none font-extrabold text-warn underline decoration-warn/40 underline-offset-4">{x.n}</span>
                <span className="mt-1 text-xs text-muted">{t(x.k)}</span>
              </Link>
            ) : (
              <div key={x.k} className="flex min-h-16 flex-col items-center justify-center">
                <span className="num text-2xl leading-none font-extrabold">{x.n}</span>
                <span className="mt-1 text-xs text-muted">{t(x.k)}</span>
              </div>
            ),
          )}
        </Card>
      )}
      {/* 숫자를 누른 뒤의 상세 — 사람마다 그 날짜들 (지각: 출근 시각 · 늦은 분 / 결근: 날짜 / 연장 미승인: 날짜 · 시간). 날짜를 누르면 그날 기록 (폰 · PC 같은 카드) */}
      {pick && (
        <Card className="flex flex-col gap-0 p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warn-tint px-4 py-2 text-sm text-warn lg:px-5">
            <span className="font-bold">{t(`picked.${pick}`, { n: shown.length })}</span>
            <Link href={q(ym)} scroll={false} className="inline-flex min-h-9 items-center font-semibold text-primary">
              {t('pickedClear')}
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {shown.map(({ person, summary: s }) => {
              const items =
                pick === 'late'
                  ? s.lateDays.map((x) => ({ d: x.date, text: `${md(x.date)} ${clock(x.at)} · ${t('lateMin', { n: x.minutes })}` }))
                  : pick === 'absent'
                    ? s.absentDates.map((d) => ({ d, text: md(d) }))
                    : s.pendingDays.map((x) => ({ d: x.date, text: `${md(x.date)} · ${hm(x.minutes)}` }));
              return (
                <li key={person.id} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-start lg:gap-4 lg:px-5">
                  <div className="flex items-baseline justify-between gap-2 lg:w-52 lg:shrink-0 lg:flex-col lg:items-start lg:gap-0.5">
                    <Link href={`/admin/records/${person.id}${q(ym)}`} className="font-bold hover:text-primary">
                      {person.name}
                    </Link>
                    <span className="num text-sm text-warn">
                      {pick === 'late' ? t('late', { n: Number(s.row.late_count), m: Number(s.row.late_minutes) }) : pick === 'absent' ? t('absent', { n: s.absentDates.length }) : hm(Number(s.row.pending_overtime_minutes))}
                    </span>
                    <span className="hidden truncate text-xs text-faint lg:block">{groupPath(groups, person.groupId)}</span>
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    {items.map((x) => (
                      <Link key={x.d} href={`/admin/records/${person.id}/${x.d}${OFFICE.practiceMode && !practice ? '?live=1' : ''}`} className="num inline-flex min-h-8 items-center rounded-button border border-warn/40 bg-bg px-2.5 text-sm hover:bg-warn-tint">
                        {x.text}
                      </Link>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* 폰: 직원 한 명 = 한 줄 (이름 · 근무시간 · 예외 표시). 누르면 펼쳐서 연장·야간·휴일. 10명씩 페이지 (2026-10-02 의뢰인) */}
      {rows.length > 0 && !pick && (
        <div className="flex flex-col gap-2 md:hidden">
          <nav className="grid grid-cols-2 rounded-card bg-bg p-1" aria-label={t('filter')}>
            {(['all', 'issues'] as const).map((k) => (
              <Link
                key={k}
                href={`${q(ym)}${k === 'issues' ? '&f=issues' : ''}`}
                scroll={false}
                aria-current={!pick && onlyIssues === (k === 'issues') ? 'page' : undefined}
                className={`flex min-h-11 items-center justify-center rounded-button text-sm font-bold ${!pick && onlyIssues === (k === 'issues') ? 'bg-primary-tint text-primary' : 'text-muted'}`}
              >
                {t(k === 'all' ? 'fAll' : 'fIssues', { n: k === 'all' ? rows.length : issueRows.length })}
              </Link>
            ))}
          </nav>
          <Card className="p-0 py-1">
            {pageRows.items.length === 0 && <p className="px-5 py-4 text-sm text-faint">{t('noIssues')}</p>}
            <ul>
              {pageRows.items.map(({ person, summary: s }) => {
                const r = s.row;
                const blocks = String(r.flags).split(';').filter((f) => f.startsWith('block:') && f !== FLAG.LEAVE_MODULE_MISSING);
                const clean = Number(r.late_count) === 0 && Number(r.absent_days) === 0 && Number(r.pending_overtime_minutes) === 0 && blocks.length === 0;
                return (
                  <li key={person.id}>
                    <details className="group">
                      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{person.name}</span>
                          <span className="flex flex-wrap gap-x-2 text-xs">
                            {Number(r.late_count) > 0 && <span className="text-warn">{t('lateShort', { n: Number(r.late_count) })}</span>}
                            {Number(r.absent_days) > 0 && <span className="text-warn">{t('absent', { n: Number(r.absent_days) })}</span>}
                            {s.leaveDates.length > 0 && <span className="text-primary">{t('leaveShort', { n: s.paidLeaveDays + Number(r.unpaid_leave_days ?? 0) })}</span>}
                            {Number(r.pending_overtime_minutes) > 0 && <span className="text-warn">{t('pendingShort')}</span>}
                            {blocks.length > 0 && <span className="text-warn">{t('blocked')}</span>}
                            {clean && <span className="text-faint">{t('clean')}</span>}
                          </span>
                        </span>
                        <span className="num shrink-0 font-bold">{hm(s.netMinutes)}</span>
                        <ChevronDown aria-hidden size={18} strokeWidth={2} className="shrink-0 text-faint group-open:rotate-180" />
                      </summary>
                      <div className="flex flex-col gap-2 px-5 pb-4">
                        <dl className="num grid grid-cols-4 gap-1 text-center text-xs">
                          {(['actual', 'approved', 'pending', 'unreviewed'] as const).map((k) => (
                            <div key={k} className="rounded-button bg-surface p-1.5">
                              <dt className="text-muted">{t(k)}</dt>
                              <dd className="text-sm font-bold">
                                {k === 'actual' ? hm(Number(r.overtime_minutes)) : k === 'approved' ? hm(Number(r.approved_overtime_minutes)) : k === 'pending' ? hm(Number(r.pending_overtime_minutes)) : hm(Number(r.unreviewed_overtime_minutes))}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p className="num text-xs text-muted">{t('overtimeRow')}</p>
                        <div className="num flex flex-wrap gap-x-3 text-sm text-muted">
                          <span>{t('night', { t: hm(Number(r.night_minutes)) })}</span>
                          <span>{t('holiday', { t: hm(Number(r.holiday_within8_minutes) + Number(r.holiday_over8_minutes)) })}</span>
                          {Number(r.late_count) > 0 && <span className="text-warn">{t('late', { n: Number(r.late_count), m: Number(r.late_minutes) })}</span>}
                        </div>
                        {blocks.length > 0 && <div className="flex flex-wrap gap-1">{blocks.map((b) => <Chip key={b} tone="warn">{b.slice(6)}</Chip>)}</div>}
                        <Link href={`/admin/records/${person.id}${q(ym)}`} className="inline-flex min-h-11 items-center self-start text-sm font-bold text-primary">
                          {t('viewDays')} ›
                        </Link>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            <Pager page={pageRows.page} pages={pageRows.pages} param="p" params={{ m: ym, live: OFFICE.practiceMode && !practice ? '1' : undefined, f: pick ?? (onlyIssues ? 'issues' : undefined), g: g || undefined }} label={t('pages')} />
          </Card>
        </div>
      )}

      {/* 넓은 화면: 표 — 자기 상자 안에서만 가로 스크롤 (5장) */}
      {rows.length > 0 && (
        <div className="hidden overflow-x-auto rounded-card border border-border md:block">
          <table className="num w-full table-fixed text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                {(['name', 'workedCol', 'payableCol', 'actual', 'approved', 'pending', 'unreviewed', 'nightCol', 'holidayCol', 'lateCol', 'absentCol'] as const).map((k) => (
                  <th key={k} className="px-2 py-2 text-right leading-tight break-words first:w-1/5 first:text-left">{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map(({ person, summary: s }) => {
                const r = s.row;
                return (
                  <tr key={person.id}>
                    <td className="truncate px-2 py-2 text-left font-semibold">
                      <Link href={`/admin/records/${person.id}${q(ym)}`} title={t('viewDays')} className="inline-flex min-h-11 items-center text-primary">
                        {person.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(s.netMinutes)}</td>
                    <td className="px-2 py-2 text-right font-bold whitespace-nowrap">{hm(s.payableMinutes)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.overtime_minutes))}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.approved_overtime_minutes))}</td>
                    <td className={`px-2 py-2 text-right whitespace-nowrap ${Number(r.pending_overtime_minutes) > 0 ? 'text-warn' : ''}`}>{hm(Number(r.pending_overtime_minutes))}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.unreviewed_overtime_minutes))}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.night_minutes))}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(Number(r.holiday_within8_minutes) + Number(r.holiday_over8_minutes))}</td>
                    <td className={`px-2 py-2 text-right whitespace-nowrap ${Number(r.late_count) > 0 ? 'text-warn' : ''} ${pick === 'late' ? 'bg-warn-tint font-bold' : ''}`}>{r.late_count}</td>
                    <td className={`px-2 py-2 text-right whitespace-nowrap ${Number(r.absent_days) > 0 ? 'text-warn' : ''} ${pick === 'absent' ? 'bg-warn-tint font-bold' : ''}`}>{r.absent_days}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-faint">{t('leaveNote')}</p>

      {/* 내려받기 모음 (R-10-6): 한 카드 = 기간 + 형식 + 버튼 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t('downloads')}</h2>
        <p className="flex gap-2 text-sm text-warn">
          <ShieldAlert aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
          {t('privacyWarning')}
        </p>
        {/* 사람이 보고·인쇄하는 파일 = 엑셀 확인서 (②-4 7-5 요점 4: 증빙에 CSV 선택지를 두지 않는다) */}
{me.role === 'admin' && (
        <Card className="flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold">{t('reportXlsx')}</p>
            <p className="num text-sm text-muted">{ym} · Excel</p>
            <p className="text-xs text-faint">{t('reportXlsxHint')}</p>
          </div>
          <a href={`/api/admin/export/report${q(ym)}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-button bg-primary px-4 font-semibold text-on-primary">
            <Download aria-hidden size={18} strokeWidth={1.75} />
            {t('download')}
          </a>
        </Card>
        )}
        {me.canViewPayroll && (
          <Card className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{t('payrollCsv')}</p>
              <p className="num text-sm text-muted">{ym} · CSV</p>
              <p className="text-xs text-faint">{t('payrollCsvHint')}</p>
            </div>
            <a href={`/api/admin/export/payroll${q(ym)}`} className="inline-flex min-h-11 items-center gap-2 rounded-button border border-border px-4 font-semibold text-primary">
              <Download aria-hidden size={18} strokeWidth={1.75} />
              {t('download')}
            </a>
          </Card>
        )}
      </section>
    </PageShell>
  );
}
