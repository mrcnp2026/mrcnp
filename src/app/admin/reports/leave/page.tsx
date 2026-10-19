// 휴가 리포트 — 부서/전사의 받은 연차 · 사용 · 소멸 · 잔여 · 선사용 · 소진율 (PRD v1.3 37.5, L22). 관리자만.
// 숫자는 휴가 원장의 합이다. 화면과 「엑셀 받기」가 같은 계산(buildLeaveReport)을 쓴다. 휴가 사유는 나오지 않는다.
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { HelpTip } from '@/components/Help';
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
  const [tl, leaveTypes] = await Promise.all([getTranslations('leave'), loadAllLeaveTypes()]);
  const typeName = (code: string) => leaveTypeName(leaveTypes, code, tl);
  const today = toKstDate(new Date());
  const asOf = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && !Number.isNaN(Date.parse(`${sp.to}T00:00:00Z`)) ? sp.to : today;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const options = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const groupId = options.some((o) => o.id === sp.g) ? sp.g! : null;
  const withInactive = sp.inactive === '1';
  const r = await buildLeaveReport({ asOf, practice, groupId, withInactive });
  // 15분 단위(1/32일)로 떨어지면 그대로, 비례 발생처럼 안 떨어지면 소수 둘째 자리까지 (2026-10-17 디자인: 153.5292일)
  // 2026-10-18 디자인: 일수는 소수 둘째 자리까지(7.125 → 7.13) — 휴가 원장 화면과 같게
  const day = (n: number) => t('days', { n: Math.round(n * 100) / 100 });
  const rate = (v: number | null) => (v === null ? t('rateNone') : t('pct', { n: v }));
  const qs = new URLSearchParams({ to: asOf, ...(groupId ? { g: groupId } : {}), ...(withInactive ? { inactive: '1' } : {}), ...(sp.live === '1' ? { live: '1' } : {}) }).toString();
  const cols = ['lGranted', 'lUsed', 'lExpired', 'lRemaining', 'lAdvance', 'lRate'] as const;
  const cells = (s: LeaveSum & { rate: number | null }) => [day(s.granted), day(s.used), day(s.expired), day(s.remaining), day(s.advance), rate(s.rate)];
  // 폰: 표 대신 두 줄 목록(이름 · 잔여 / 받은 · 사용 · 소진율, 소멸 · 선사용은 있을 때만) — 표가 옆으로 잘렸다 (2026-10-17 디자인)
  const mobile = (items: { key: string; name: ReactNode; sub?: string; sum: (LeaveSum & { rate: number | null }) | null }[], cls = '') => (
    <ul className={`divide-y divide-border rounded-card border border-border bg-bg lg:hidden ${cls}`}>
      {items.map((x) => (
        <li key={x.key} className="flex flex-col gap-0.5 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-bold">{x.name}</span>
            {x.sum && <span className="num shrink-0 text-sm text-muted">{t('lRemaining')} <b className={`text-base ${x.sum.remaining < 0 ? 'text-danger' : 'text-primary'}`}>{day(x.sum.remaining)}</b></span>}
          </div>
          <p className="num text-xs text-muted">
            {[x.sub, ...(x.sum ? [`${t('lGranted')} ${day(x.sum.granted)}`, `${t('lUsed')} ${day(x.sum.used)}`, x.sum.expired ? `${t('lExpired')} ${day(x.sum.expired)}` : '', x.sum.advance ? `${t('lAdvance')} ${day(x.sum.advance)}` : '', `${t('lRate')} ${rate(x.sum.rate)}`] : [t('notStarted')])].filter(Boolean).join(' · ')}
          </p>
        </li>
      ))}
    </ul>
  );

  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('leaveTitle')}<HelpTip>{t('leaveIntro')}</HelpTip></h1>
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
        <a href={`/api/admin/reports/leave?${qs}`} className="inline-flex h-9 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
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
      {mobile([
        ...r.groups.map((g) => ({ key: g.groupId ?? '', name: g.groupId === null ? t('unassigned') : g.name, sub: t('startedValue', { n: g.started, all: g.people }), sum: g })),
        { key: 'total', name: t('total'), sub: t('startedValue', { n: r.total.started, all: r.total.people }), sum: r.total },
      ])}
      <div className="overflow-x-auto rounded-card border border-border bg-bg max-lg:hidden">
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

      <h2 className="text-lg font-bold">{t('byPolicyGroup')}</h2>
      {mobile(r.policyGroups.map((g) => ({ key: g.groupId, name: <>{g.name}{g.excluded && <span className="ml-1 text-xs font-normal text-warn">{t('excludedTag')}</span>}</>, sub: t('startedValue', { n: g.started, all: g.people }), sum: g })))}
      <div className="overflow-x-auto rounded-card border border-border bg-bg max-lg:hidden">
        <table className="w-full text-sm" data-policy-groups>
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('cPolicyGroup')}</th>
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('lPeople')}</th>
              {cols.map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.policyGroups.map((g) => (
              <tr key={g.groupId} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 font-bold whitespace-nowrap">
                  {g.name}
                  {g.excluded && <span className="ml-1 text-xs font-normal text-warn">{t('excludedTag')}</span>}
                </td>
                <td className="num px-3 py-2">{t('startedValue', { n: g.started, all: g.people })}</td>
                {cells(g).map((v, i) => (
                  <td key={i} className="num px-3 py-2 whitespace-nowrap">{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-bold">{t('byType', { from: r.yearFrom, to: r.asOf })}</h2>
      <div className="overflow-x-auto rounded-card border border-border bg-bg">
        <table className="w-full text-sm" data-type-use>
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              {(['cType', 'cRequests', 'cDays', 'cPeopleUsed'] as const).map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.typeUse.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-faint">{t('typeNone')}</td>
              </tr>
            )}
            {r.typeUse.map((x) => (
              <tr key={x.code} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 font-bold">{typeName(x.code)}</td>
                <td className="num px-3 py-2">{x.requests}</td>
                <td className="num px-3 py-2">{Math.round(x.days * 100) / 100}</td>
                <td className="num px-3 py-2">{x.people}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-faint">{t('typeNote')}</p>

      <h2 className="text-lg font-bold">{t('byEmployee', { n: r.employees.length })}</h2>
      {mobile(r.employees.map((e) => ({
        key: e.employeeId,
        name: <Link href={`/admin/leave/ledger?emp=${e.employeeId}#detail`} className="text-primary">{e.name}{!e.active && <span className="ml-2 text-xs font-normal text-faint">{t('inactive')}</span>}</Link>,
        sub: e.joinedOn ?? undefined,
        sum: e.isStarted ? e : null,
      })))}
      <div className="overflow-x-auto rounded-card border border-border bg-bg max-lg:hidden">
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
