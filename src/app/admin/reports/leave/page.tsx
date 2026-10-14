// 휴가 리포트 — 부서/전사의 받은 연차 · 사용 · 소멸 · 잔여 · 선사용 · 소진율 (PRD v1.3 37.5, L22). 관리자만.
// 숫자는 휴가 원장의 합이다. 화면과 「엑셀 받기」가 같은 계산(buildLeaveReport)을 쓴다. 휴가 사유는 나오지 않는다.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { buildLeaveReport, type LeaveSum } from '@/lib/report-leave';
import { toKstDate } from '@/lib/time';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';

export default async function LeaveReportPage({ searchParams }: { searchParams: Promise<{ to?: string; g?: string; inactive?: string; live?: string }> }) {
  const [t, sp, groups] = await Promise.all([getTranslations('admin.reports'), searchParams, loadOrgGroups()]);
  const today = toKstDate(new Date());
  const asOf = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && !Number.isNaN(Date.parse(`${sp.to}T00:00:00Z`)) ? sp.to : today;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const options = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const groupId = options.some((o) => o.id === sp.g) ? sp.g! : null;
  const withInactive = sp.inactive === '1';
  const r = await buildLeaveReport({ asOf, practice, groupId, withInactive });
  const day = (n: number) => t('days', { n });
  const rate = (v: number | null) => (v === null ? t('rateNone') : t('pct', { n: v }));
  const qs = new URLSearchParams({ to: asOf, ...(groupId ? { g: groupId } : {}), ...(withInactive ? { inactive: '1' } : {}), ...(sp.live === '1' ? { live: '1' } : {}) }).toString();
  const cols = ['lGranted', 'lUsed', 'lExpired', 'lRemaining', 'lAdvance', 'lRate'] as const;
  const cells = (s: LeaveSum & { rate: number | null }) => [day(s.granted), day(s.used), day(s.expired), day(s.remaining), day(s.advance), rate(s.rate)];

  return (
    <PageShell wide>
      <div>
        <h1 className="text-2xl font-bold">{t('leaveTitle')}</h1>
        <p className="pt-1 text-sm text-faint">{t('leaveIntro')}</p>
      </div>
      <form action="/admin/reports/leave" className="flex flex-wrap items-end gap-3 text-sm">
        {sp.live === '1' && <input type="hidden" name="live" value="1" />}
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('fAsOf')}</span>
          <input type="date" name="to" defaultValue={asOf} className={field} />
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
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" name="inactive" value="1" defaultChecked={withInactive} className="size-5 accent-primary" />
          {t('fInactive')}
        </label>
        <button type="submit" className="inline-flex h-9 items-center rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
          {t('apply')}
        </button>
        <a href={`/api/admin/reports/leave?${qs}`} className="inline-flex h-9 items-center rounded-button border border-nav bg-bg px-4 text-sm font-bold text-nav">
          {t('download')}
        </a>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="info">{t('startedValue', { n: r.total.started, all: r.total.people })}</Chip>
        {practice && <Chip>{t('practice')}</Chip>}
        <Link href="/admin/leave/ledger" className="text-sm font-bold text-primary hover:underline">
          {t('toLedger')}
        </Link>
      </div>

      <h2 className="text-lg font-bold">{t('byGroup')}</h2>
      <div className="overflow-x-auto rounded-card border border-border bg-bg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('cGroup')}</th>
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('lPeople')}</th>
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
                <td className="num px-3 py-2">{t('startedValue', { n: g.started, all: g.people })}</td>
                {cells(g).map((v, i) => (
                  <td key={i} className="num px-3 py-2 whitespace-nowrap">{v}</td>
                ))}
              </tr>
            ))}
            <tr className="bg-surface font-bold">
              <td className="px-3 py-2">{t('total')}</td>
              <td className="num px-3 py-2">{t('startedValue', { n: r.total.started, all: r.total.people })}</td>
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
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('lJoined')}</th>
              {cols.map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {t(k)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('lOld')}</th>
            </tr>
          </thead>
          <tbody>
            {r.employees.map((e) => (
              <tr key={e.employeeId} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/admin/leave/ledger?emp=${e.employeeId}#detail`} className="font-bold text-primary hover:underline">
                    {e.name}
                  </Link>
                  {!e.active && <span className="ml-2 text-xs text-faint">{t('inactive')}</span>}
                </td>
                <td className="num px-3 py-2 whitespace-nowrap">{e.joinedOn ?? ''}</td>
                {e.isStarted ? (
                  cells(e).map((v, i) => (
                    <td key={i} className="num px-3 py-2 whitespace-nowrap">{v}</td>
                  ))
                ) : (
                  <td colSpan={cols.length} className="px-3 py-2 text-faint">
                    {t('notStarted')}
                  </td>
                )}
                <td className="num px-3 py-2">{e.old === null ? '' : day(e.old)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.employees.length === 0 && <p className="p-4 text-sm text-faint">{t('empty')}</p>}
      </div>
      <p className="text-xs text-faint">{t('leaveNote')}</p>
    </PageShell>
  );
}
