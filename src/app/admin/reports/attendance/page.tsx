// 근태 리포트 — 부서/전사의 한 달 근태 합계와 직원별 내역 (PRD v1.3 35.4, A21). 관리자만.
// 화면과 「엑셀 받기」가 같은 계산(buildAttendanceDeptReport)을 쓴다 — 조건이 같으면 숫자가 같다. 금액은 없다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { HelpTip } from '@/components/Help';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { isMonth } from '@/lib/close-review';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { attendanceRate, type AttSum } from '@/lib/report-attendance';
import { DailyRate } from './DailyRate';
import { reportOnce, TrendCharts } from './TrendCharts';
import { toKstDate } from '@/lib/time';

const field = 'min-h-9 w-full rounded-button border border-border bg-bg px-3 text-sm lg:w-auto';

export default async function AttendanceReportPage({ searchParams }: { searchParams: Promise<{ m?: string; g?: string; basis?: string; live?: string; tr?: string }> }) {
  const [t, sp, groups] = await Promise.all([getTranslations('admin.reports'), searchParams, loadOrgGroups()]);
  const today = toKstDate(new Date());
  const month = isMonth(sp.m) && sp.m <= today.slice(0, 7) ? sp.m : today.slice(0, 7);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const options = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const groupId = options.some((o) => o.id === sp.g) ? sp.g! : null;
  const basis = sp.basis === 'current' ? 'current' : 'at_month_end';
  const r = await reportOnce(month, practice, groupId, basis);
  // 2026-10-18 디자인: 시간은 천 단위 쉼표(1,089.7시간), 일수는 소수 둘째 자리까지(8.0625 → 8.06)
  const f = await getFormatter();
  const h = (min: number) => t('hours', { n: f.number(Math.round((min / 60) * 10) / 10, { maximumFractionDigits: 1 }) });
  const dayN = (n: number) => f.number(Math.round(n * 100) / 100, { maximumFractionDigits: 2 });
  const qs = new URLSearchParams({ m: month, ...(groupId ? { g: groupId } : {}), ...(basis === 'current' ? { basis } : {}), ...(sp.live === '1' ? { live: '1' } : {}) }).toString();
  const cols = ['cPeople', 'cNet', 'cPayable', 'cOvertime', 'cNight', 'cHoliday', 'cLate', 'cAbsent', 'cPaidLeave', 'cAnomaly', 'cPending', 'cRate', 'cClose'] as const;
  const rate = (s: AttSum) => { const v = attendanceRate(s); return v === null ? '–' : t('pct', { n: f.number(v, { maximumFractionDigits: 1 }) }); }; // 출근율 (2026-10-19)
  const cells = (s: AttSum) => [
    s.people, h(s.netMinutes), h(s.payableMinutes), h(s.overtimeMinutes), h(s.nightMinutes), h(s.holidayMinutes), s.lateCount, dayN(s.absentDays), dayN(s.paidLeaveDays),
    s.anomalyBlock + s.anomalyCheck === 0 ? 0 : t('anomalyValue', { block: s.anomalyBlock, check: s.anomalyCheck }), s.pending, rate(s), t('closeValue', { closed: s.closed, all: s.people }),
  ];
  const provisional = r.total.people - r.total.closed;
  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('attTitle')}<HelpTip>{t('attIntro')}</HelpTip></h1>
      </div>
      {/* 폰: 두 칸씩 — 조건이 첫 화면 1/3을 차지하던 것 (2026-10-15 모바일 분석 11) */}
      <form action="/admin/reports/attendance" className="grid grid-cols-2 items-end gap-2 text-sm lg:flex lg:flex-wrap lg:gap-3">
        {sp.live === '1' && <input type="hidden" name="live" value="1" />}
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fMonth')}</span>
          <input type="month" name="m" defaultValue={month} max={today.slice(0, 7)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fGroup')}</span>
          <select name="g" defaultValue={groupId ?? ''} className={field}>
            <option value="">{t('all')}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fBasis')}</span>
          <select name="basis" defaultValue={basis} className={field}>
            <option value="at_month_end">{t('basisThen')}</option>
            <option value="current">{t('basisNow')}</option>
          </select>
        </label>
        <button type="submit" className="inline-flex h-9 items-center justify-center rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
          {t('apply')}
        </button>
        <a href={`/api/admin/reports/attendance?${qs}`} className="col-span-2 inline-flex h-9 items-center justify-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
          {t('download')}
        </a>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {provisional === 0 && r.total.people > 0 ? <Chip tone="ok">{t('final')}</Chip> : <Chip tone="warn">{t('provisional', { n: provisional })}</Chip>}
        {practice && <Chip>{t('practice')}</Chip>}
        <Link href={`/admin/closing?m=${month}${sp.live === '1' ? '&live=1' : ''}`} className="text-sm font-bold text-primary hover:underline">
          {t('toClosing')}
        </Link>
      </div>

      <h2 className="text-lg font-bold">{t('byGroup')}</h2>
      {/* 폰: 부서마다 카드 — 인원 · 인정 시간 · 초과 · 이상 · 마감 (2026-10-15: 표가 오른쪽에서 잘리던 것) */}
      <ul className="flex flex-col gap-2 lg:hidden" data-phone-groups>
        {[...r.groups.map((g) => ({ key: g.groupId ?? '', name: g.groupId === null ? t('unassigned') : g.name, s: g, total: false })), { key: 'total', name: t('total'), s: r.total, total: true }].map((x) => (
          <li key={x.key} className={`rounded-card border border-border p-3 ${x.total ? 'bg-surface' : 'bg-bg'}`}>
            <p className="font-bold">{x.name}</p>
            <dl className="num mt-1 grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
              {([0, 11, 2, 3, 6, 12] as const).map((i) => (
                <div key={i} className="flex flex-col">
                  <dt className="text-xs text-faint">{t(cols[i])}</dt>
                  <dd>{cells(x.s)[i]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-card border border-border bg-bg lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('cGroup')}</th>
              {cols.map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.groups.map((g) => (
              <tr key={g.groupId ?? ''} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 font-bold whitespace-nowrap">{g.groupId === null ? t('unassigned') : g.name}</td>
                {cells(g).map((v, i) => (
                  <td key={i} className="num px-3 py-2 whitespace-nowrap">{v}</td>
                ))}
              </tr>
            ))}
            <tr className="bg-surface font-bold">
              <td className="px-3 py-2">{t('total')}</td>
              {cells(r.total).map((v, i) => (
                <td key={i} className="num px-3 py-2 whitespace-nowrap">{v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-bold">{t('byEmployee', { n: r.employees.length })}</h2>
      {/* 폰: 직원마다 한 줄 — 이름 · 인정 시간 · 초과 · 지각 · 마감, 누르면 그 직원의 월 기록 */}
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg lg:hidden" data-phone-employees>
        {r.employees.map((e) => {
          const c = cells(e);
          return (
            <li key={e.employeeId}>
              <Link href={`/admin/records/${e.employeeId}?m=${month}${sp.live === '1' ? '&live=1' : ''}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-surface">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2">
                    <b className="truncate">{e.name}</b>
                    {e.isClosed ? <Chip tone="ok">{t('closed')}</Chip> : <Chip tone="warn">{t('open')}</Chip>}
                  </span>
                  <span className="num truncate text-xs text-muted">
                    {t('cRate')} {c[11]} · {t('cPayable')} {c[2]} · {t('cOvertime')} {c[3]} · {t('cLate')} {c[6]}
                  </span>
                </span>
                <ChevronRight aria-hidden size={18} className="shrink-0 text-faint" />
              </Link>
            </li>
          );
        })}
        {r.employees.length === 0 && <li className="p-4 text-sm text-faint">{t('empty')}</li>}
      </ul>
      <div className="hidden overflow-x-auto rounded-card border border-border bg-bg lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('cName')}</th>
              {cols.slice(1).map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.employees.map((e) => (
              <tr key={e.employeeId} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/admin/records/${e.employeeId}?m=${month}${sp.live === '1' ? '&live=1' : ''}`} className="font-bold text-primary hover:underline">
                    {e.name}
                  </Link>
                </td>
                {cells(e).slice(1, -1).map((v, i) => (
                  <td key={i} className="num px-3 py-2 whitespace-nowrap">{v}</td>
                ))}
                <td className="px-3 py-2">{e.isClosed ? <Chip tone="ok">{t('closed')}</Chip> : <Chip tone="warn">{t('open')}</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.employees.length === 0 && <p className="p-4 text-sm text-faint">{t('empty')}</p>}
      </div>
      <p className="text-xs text-faint">{t('attNote')}</p>

      {/* 출근율 일별 · 주별 (2026-10-19) — 이 달 안에서 */}
      <DailyRate daily={r.daily} mode={sp.tr === 'w' ? 'week' : 'day'} hrefOf={(m) => `/admin/reports/attendance?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qs)), ...(m === 'week' ? { tr: 'w' } : {}) }).toString()}`} />

      <h2 className="hidden text-lg font-bold lg:block">{t('trendTitle')}</h2>
      {/* 6개월 추이는 늦게 채운다 — 표가 먼저 보이고 그래프는 뒤따라 (2026-10-19 속도: 달마다 다시 세느라 화면 전체가 5초 기다렸다) */}
      <div className="hidden flex-col gap-2 lg:flex">
        <Suspense fallback={<p className="h-24 rounded-card bg-surface" aria-hidden />}>
          <TrendCharts month={month} practice={practice} groupId={groupId} basis={basis} />
        </Suspense>
      </div>
      <details className="group rounded-card bg-bg px-4 lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 font-bold">
          {t('trendTitle')}
          <ChevronDown aria-hidden size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-2 pb-4">
          <Suspense fallback={<p className="h-24 rounded-card bg-surface" aria-hidden />}>
            <TrendCharts month={month} practice={practice} groupId={groupId} basis={basis} />
          </Suspense>
        </div>
      </details>
    </PageShell>
  );
}
