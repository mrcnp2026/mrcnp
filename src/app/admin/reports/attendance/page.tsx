// 근태 리포트 — 부서/전사의 한 달 근태 합계와 직원별 내역 (PRD v1.3 35.4, A21). 관리자만.
// 화면과 「엑셀 받기」가 같은 계산(buildAttendanceDeptReport)을 쓴다 — 조건이 같으면 숫자가 같다. 금액은 없다.
import { getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import Link from 'next/link';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { isMonth } from '@/lib/close-review';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { buildAttendanceDeptReport, type AttSum } from '@/lib/report-attendance';
import { toKstDate } from '@/lib/time';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';

export default async function AttendanceReportPage({ searchParams }: { searchParams: Promise<{ m?: string; g?: string; basis?: string; live?: string }> }) {
  const [t, sp, groups] = await Promise.all([getTranslations('admin.reports'), searchParams, loadOrgGroups()]);
  const today = toKstDate(new Date());
  const month = isMonth(sp.m) && sp.m <= today.slice(0, 7) ? sp.m : today.slice(0, 7);
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const options = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const groupId = options.some((o) => o.id === sp.g) ? sp.g! : null;
  const basis = sp.basis === 'current' ? 'current' : 'at_month_end';
  const r = await buildAttendanceDeptReport({ ym: month, practice, groupId, basis });
  const h = (min: number) => t('hours', { n: Math.round((min / 60) * 10) / 10 });
  const qs = new URLSearchParams({ m: month, ...(groupId ? { g: groupId } : {}), ...(basis === 'current' ? { basis } : {}), ...(sp.live === '1' ? { live: '1' } : {}) }).toString();
  const cols = ['cPeople', 'cNet', 'cPayable', 'cOvertime', 'cNight', 'cHoliday', 'cLate', 'cAbsent', 'cPaidLeave', 'cAnomaly', 'cPending', 'cClose'] as const;
  const cells = (s: AttSum) => [
    s.people, h(s.netMinutes), h(s.payableMinutes), h(s.overtimeMinutes), h(s.nightMinutes), h(s.holidayMinutes), s.lateCount, s.absentDays, s.paidLeaveDays,
    s.anomalyBlock + s.anomalyCheck === 0 ? 0 : t('anomalyValue', { block: s.anomalyBlock, check: s.anomalyCheck }), s.pending, t('closeValue', { closed: s.closed, all: s.people }),
  ];
  const provisional = r.total.people - r.total.closed;

  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('attTitle')}<HelpTip>{t('attIntro')}</HelpTip></h1>
      </div>
      <form action="/admin/reports/attendance" className="flex flex-wrap items-end gap-3 text-sm">
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
        <button type="submit" className="inline-flex h-9 items-center rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
          {t('apply')}
        </button>
        <a href={`/api/admin/reports/attendance?${qs}`} className="inline-flex h-9 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
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
      <div className="overflow-x-auto rounded-card border border-border bg-bg">
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
      <div className="overflow-x-auto rounded-card border border-border bg-bg">
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
    </PageShell>
  );
}
