// 근태 리포트 — 부서/전사의 한 달 근태 합계와 직원별 내역 (PRD v1.3 35.4, A21). 관리자만.
// 화면과 「엑셀 받기」가 같은 계산(buildAttendanceDeptReport)을 쓴다 — 조건이 같으면 숫자가 같다. 금액은 없다.
// 2026-10-23 디자인(의뢰인: 정신없고 빡빡하다): 공통 조각(components/report) · 표는 핵심 8칸만 기본, 「항목 모두 보기」를 누르면 13칸.
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense } from 'react';
import { CountUp } from '@/components/CountUp';
import { Block, dim, Field, FilterBar, KpiStrip, ListCard, Meter, R, ReportHead, TableCard } from '@/components/report';
import { Select } from '@/components/Select';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { isMonth } from '@/lib/close-review';
import { orgOptions } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { attendanceRate, type AttSum } from '@/lib/report-attendance';
import { toKstDate } from '@/lib/time';
import { reportOnce, TrendCharts } from './TrendCharts';

// 표에 나오는 칸 번호(cells 배열 기준): 0 인원 · 1 근무 · 2 인정 · 3 연장 · 4 야간 · 5 휴일 · 6 지각 · 7 결근 · 8 유급휴가 · 9 이상 · 10 미처리 · 11 출근율 · 12 마감
const BASIC = [11, 2, 3, 6, 7, 9] as const; // 기본 — 한눈에 볼 여섯 칸 (+ 인원 · 마감)
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export default async function AttendanceReportPage({ searchParams }: { searchParams: Promise<{ m?: string; g?: string; basis?: string; live?: string; tr?: string; more?: string }> }) {
  const [t, sp, groups] = await Promise.all([getTranslations('admin.reports'), searchParams, loadOrgGroups()]);
  const today = toKstDate(new Date());
  const month = isMonth(sp.m) && sp.m <= today.slice(0, 7) ? sp.m : today.slice(0, 7);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const options = orgOptions(groups);
  const groupId = options.some((o) => o.id === sp.g) ? sp.g! : null;
  const basis = sp.basis === 'current' ? 'current' : 'at_month_end';
  const more = sp.more === '1';
  const r = await reportOnce(month, practice, groupId, basis);
  // 시간은 천 단위 쉼표(1,089.7시간), 일수는 소수 둘째 자리까지(8.0625 → 8.06)
  const f = await getFormatter();
  const h = (min: number) => t('hours', { n: f.number(Math.round((min / 60) * 10) / 10, { maximumFractionDigits: 1 }) });
  const dayN = (n: number) => f.number(Math.round(n * 100) / 100, { maximumFractionDigits: 2 });
  const base = { m: month, ...(groupId ? { g: groupId } : {}), ...(basis === 'current' ? { basis } : {}), ...(sp.live === '1' ? { live: '1' } : {}) };
  const qs = new URLSearchParams(base).toString();
  const cols = ['cPeople', 'cNet', 'cPayable', 'cOvertime', 'cNight', 'cHoliday', 'cLate', 'cAbsent', 'cPaidLeave', 'cAnomaly', 'cPending', 'cRate', 'cClose'] as const;
  const rate = (s: AttSum) => { const v = attendanceRate(s); return v === null ? '–' : t('pct', { n: f.number(v, { maximumFractionDigits: 1 }) }); };
  // 칸마다 값 (0은 옅은 –)
  const cell = (s: AttSum, i: number): React.ReactNode => {
    switch (i) {
      case 1: return dim(h(s.netMinutes), s.netMinutes === 0);
      case 2: return dim(h(s.payableMinutes), s.payableMinutes === 0);
      case 3: return dim(h(s.overtimeMinutes), s.overtimeMinutes === 0);
      case 4: return dim(h(s.nightMinutes), s.nightMinutes === 0);
      case 5: return dim(h(s.holidayMinutes), s.holidayMinutes === 0);
      case 6: return dim(s.lateCount, s.lateCount === 0);
      case 7: return dim(dayN(s.absentDays), s.absentDays === 0);
      case 8: return dim(dayN(s.paidLeaveDays), s.paidLeaveDays === 0);
      case 9: return dim(t('anomalyValue', { block: s.anomalyBlock, check: s.anomalyCheck }), s.anomalyBlock + s.anomalyCheck === 0);
      case 10: return dim(s.pending, s.pending === 0);
      case 11: return <Meter value={attendanceRate(s)} label={rate(s)} />;
      default: return null;
    }
  };
  const shown = more ? ALL : BASIC;
  const moreHref = `?${new URLSearchParams({ ...base, ...(more ? {} : { more: '1' }) }).toString()}`;
  const provisional = r.total.people - r.total.closed;
  const recHref = (id: string) => `/admin/records/${id}?m=${month}${sp.live === '1' ? '&live=1' : ''}`;
  const statusChip = (closed: boolean) => (closed ? <Chip tone="ok">{t('closed')}</Chip> : <Chip tone="warn">{t('open')}</Chip>);
  const toggle = (
    <Link href={moreHref} scroll={false} className={R.link}>
      {more ? t('lessCols') : t('moreCols')}
    </Link>
  );

  return (
    <PageShell wide>
      <ReportHead title={t('attTitle')} help={t('attIntro')}>
        <a href={`/api/admin/reports/attendance?${qs}`} className={R.ghost}>
          <Download aria-hidden size={16} />
          {t('download')}
        </a>
      </ReportHead>

      <FilterBar action="/admin/reports/attendance" hidden={{ ...(sp.live === '1' ? { live: '1' } : {}), ...(more ? { more: '1' } : {}) }}>
        <Field label={t('fMonth')}>
          <input type="month" name="m" defaultValue={month} max={today.slice(0, 7)} className={R.control} />
        </Field>
        <Field label={t('fGroup')}>
          <Select name="g" defaultValue={groupId ?? ''} className={R.control}>
            <option value="">{t('all')}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('fBasis')}>
          <Select name="basis" defaultValue={basis} className={R.control}>
            <option value="at_month_end">{t('basisThen')}</option>
            <option value="current">{t('basisNow')}</option>
          </Select>
        </Field>
        <button type="submit" className={`${R.primary} self-end`}>
          {t('apply')}
        </button>
      </FilterBar>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {provisional === 0 && r.total.people > 0 ? <Chip tone="ok">{t('final')}</Chip> : <Chip tone="warn">{t('provisional', { n: provisional })}</Chip>}
        {practice && <Chip>{t('practice')}</Chip>}
        <Link href={`/admin/closing?m=${month}${sp.live === '1' ? '&live=1' : ''}`} className={R.link}>
          {t('toClosing')} ›
        </Link>
      </div>

      <KpiStrip
        items={[
          { label: t('cNet'), value: <CountUp value={h(r.total.netMinutes)} /> },
          { label: t('cOvertime'), value: <CountUp value={h(r.total.overtimeMinutes)} />, tone: r.total.overtimeMinutes ? 'primary' : 'faint' },
          { label: t('cLate'), value: <CountUp value={String(r.total.lateCount)} />, tone: r.total.lateCount ? 'warn' : 'faint' },
          { label: t('cAbsent'), value: <CountUp value={dayN(r.total.absentDays)} />, tone: r.total.absentDays ? 'danger' : 'faint' },
          { label: t('cRate'), value: <CountUp value={rate(r.total)} />, tone: 'primary' },
        ]}
      />

      <Block title={t('byGroup')} aside={toggle}>
        {/* 폰: 부서마다 한 줄 */}
        <ListCard className="lg:hidden" data-phone-groups>
          {[...r.groups.map((g) => ({ key: g.groupId ?? '', name: g.groupId === null ? t('unassigned') : g.name, s: g as AttSum })), { key: 'total', name: t('total'), s: r.total }].map((x) => (
            <li key={x.key} className={`px-4 py-3 ${x.key === 'total' ? 'bg-surface/70' : ''}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{x.name}</span>
                <span className="num text-xs text-muted">{t('cPeople')} {x.s.people} · {t(cols[11])} {rate(x.s)}</span>
              </div>
              <dl className="num mt-2 grid grid-cols-2 gap-3 text-sm">
                {([2, 3] as const).map((i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted">{t(cols[i])}</dt>
                    <dd>{cell(x.s, i)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ListCard>
        <TableCard className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={R.th}>{t('cGroup')}</th>
                <th scope="col" className={R.th}>{t(cols[0])}</th>
                {shown.map((i) => (
                  <th key={i} scope="col" className={R.th}>{t(cols[i])}</th>
                ))}
                <th scope="col" className={R.th}>{t(cols[12])}</th>
              </tr>
            </thead>
            <tbody>
              {r.groups.map((g) => (
                <tr key={g.groupId ?? ''} className={R.tr}>
                  <td className={`${R.td} font-medium`}>{g.groupId === null ? t('unassigned') : g.name}</td>
                  <td className={R.td}>{g.people}</td>
                  {shown.map((i) => (
                    <td key={i} className={R.td}>{cell(g, i)}</td>
                  ))}
                  <td className={R.td}>{t('closeValue', { closed: g.closed, all: g.people })}</td>
                </tr>
              ))}
              <tr className={R.total}>
                <td className={`${R.td} font-medium`}>{t('total')}</td>
                <td className={R.td}>{r.total.people}</td>
                {shown.map((i) => (
                  <td key={i} className={`${R.td} font-medium`}>{cell(r.total, i)}</td>
                ))}
                <td className={R.td}>{t('closeValue', { closed: r.total.closed, all: r.total.people })}</td>
              </tr>
            </tbody>
          </table>
        </TableCard>
      </Block>

      <Block title={t('byEmployeeTitle')} count={r.employees.length} note={t('attNote')} aside={toggle}>
        {/* 폰: 직원마다 한 줄 — 누르면 그 직원의 월 기록 */}
        <ListCard className="lg:hidden" data-phone-employees>
          {r.employees.map((e) => (
            <li key={e.employeeId}>
              <Link href={recHref(e.employeeId)} className="flex items-center gap-3 px-4 py-3 active:bg-surface">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{e.name}</span>
                    {statusChip(e.isClosed)}
                  </span>
                  <span className="num truncate text-xs text-muted">
                    {t('cPayable')} {h(e.payableMinutes)} · {t('cLate')} {e.lateCount}
                  </span>
                </span>
                <span className="num shrink-0 text-sm">{rate(e)}</span>
                <ChevronRight aria-hidden size={18} className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
          {r.employees.length === 0 && <li className="p-4 text-sm text-faint">{t('empty')}</li>}
        </ListCard>
        <TableCard className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={R.th}>{t('cName')}</th>
                {shown.map((i) => (
                  <th key={i} scope="col" className={R.th}>{t(cols[i])}</th>
                ))}
                <th scope="col" className={R.th}>{t(cols[12])}</th>
              </tr>
            </thead>
            <tbody>
              {r.employees.map((e) => (
                <tr key={e.employeeId} className={R.tr}>
                  <td className={R.td}>
                    <Link href={recHref(e.employeeId)} className="font-medium hover:text-primary hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  {shown.map((i) => (
                    <td key={i} className={R.td}>{cell(e, i)}</td>
                  ))}
                  <td className={R.td}>{statusChip(e.isClosed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.employees.length === 0 && <p className="p-4 text-sm text-faint">{t('empty')}</p>}
        </TableCard>
      </Block>

      <Block title={t('trendTitle')}>
        {/* 6개월 추이는 늦게 채운다 — 표가 먼저 보이고 그래프는 뒤따라 (2026-10-19 속도) */}
        <div className="hidden lg:block">
          <Suspense fallback={<p className="h-24 rounded-card bg-surface" aria-hidden />}>
            <TrendCharts month={month} practice={practice} groupId={groupId} basis={basis} />
          </Suspense>
        </div>
        <details className="group lg:hidden">
          <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium ${R.card}`}>
            {t('trendOpen')}
            <ChevronDown aria-hidden size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <Suspense fallback={<p className="h-24 rounded-card bg-surface" aria-hidden />}>
              <TrendCharts month={month} practice={practice} groupId={groupId} basis={basis} />
            </Suspense>
          </div>
        </details>
      </Block>
    </PageShell>
  );
}
