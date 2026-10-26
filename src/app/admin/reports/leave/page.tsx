// 휴가 리포트 — 부서/전사의 받은 연차 · 사용 · 소멸 · 잔여 · 선사용 · 소진율 (PRD v1.3 37.5, L22). 관리자만.
// 숫자는 휴가 원장의 합이다. 화면과 「엑셀 받기」가 같은 계산(buildLeaveReport)을 쓴다. 휴가 사유는 나오지 않는다.
// 2026-10-23 디자인(의뢰인: 정신없고 빡빡하다): 공통 조각(components/report) · 표는 핵심 칸만 기본, 「항목 모두 보기」를 누르면 소멸 · 선사용까지.
import { Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CountUp } from '@/components/CountUp';
import { Block, dim, Field, FilterBar, KpiStrip, ListCard, Meter, R, ReportHead, TableCard } from '@/components/report';
import { Select } from '@/components/Select';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { orgOptions } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { buildLeaveReport, type LeaveSum } from '@/lib/report-leave';
import { toKstDate } from '@/lib/time';

type Sum = LeaveSum & { rate: number | null };

export default async function LeaveReportPage({ searchParams }: { searchParams: Promise<{ to?: string; g?: string; inactive?: string; live?: string; more?: string }> }) {
  const [t, sp, groups] = await Promise.all([getTranslations('admin.reports'), searchParams, loadOrgGroups()]);
  const [tl, leaveTypes] = await Promise.all([getTranslations('leave'), loadAllLeaveTypes()]);
  const typeName = (code: string) => leaveTypeName(leaveTypes, code, tl);
  const today = toKstDate(new Date());
  const asOf = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && !Number.isNaN(Date.parse(`${sp.to}T00:00:00Z`)) ? sp.to : today;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const options = orgOptions(groups);
  const groupId = options.some((o) => o.id === sp.g) ? sp.g! : null;
  const withInactive = sp.inactive === '1';
  const more = sp.more === '1';
  const r = await buildLeaveReport({ asOf, practice, groupId, withInactive });
  // 일수는 소수 둘째 자리까지(7.125 → 7.13) — 휴가 원장 화면과 같게
  const day = (n: number) => t('days', { n: Math.round(n * 100) / 100 });
  const pct = (v: number | null) => (v === null ? t('rateNone') : t('pct', { n: v }));
  const base = { to: asOf, ...(groupId ? { g: groupId } : {}), ...(withInactive ? { inactive: '1' } : {}), ...(sp.live === '1' ? { live: '1' } : {}) };
  const qs = new URLSearchParams(base).toString();
  const moreHref = `?${new URLSearchParams({ ...base, ...(more ? {} : { more: '1' }) }).toString()}`;
  const toggle = (
    <Link href={moreHref} scroll={false} className={R.link}>
      {more ? t('lessCols') : t('moreCols')}
    </Link>
  );
  const typeTop = Math.max(1, ...r.typeUse.map((x) => x.days));

  // 칸 — 0은 옅은 「–」, 잔여만 눈에 띄게(음수는 빨강)
  const num = (n: number) => dim(day(n), n === 0);
  const remain = (n: number) => <span className={`font-medium ${n < 0 ? 'text-danger' : n === 0 ? 'text-faint' : 'text-primary'}`}>{n === 0 ? '–' : day(n)}</span>;
  const heads = ['lGranted', 'lUsed', ...(more ? (['lExpired'] as const) : []), 'lRemaining', ...(more ? (['lAdvance'] as const) : []), 'lRate'] as const;
  const cellsOf = (s: Sum): ReactNode[] => [num(s.granted), num(s.used), ...(more ? [num(s.expired)] : []), remain(s.remaining), ...(more ? [num(s.advance)] : []), <Meter key="rate" value={s.rate} label={pct(s.rate)} width="w-16" />];
  const head = (first: string, extra: string[], tail: string[] = []) => (
    <thead>
      <tr className="border-b border-border">
        <th scope="col" className={R.th}>{first}</th>
        {extra.map((x) => (
          <th key={x} scope="col" className={R.th}>{x}</th>
        ))}
        {heads.map((k) => (
          <th key={k} scope="col" className={R.th}>{t(k)}</th>
        ))}
        {tail.map((x) => (
          <th key={x} scope="col" className={R.th}>{x}</th>
        ))}
      </tr>
    </thead>
  );
  const started = (s: { started: number; people: number }) => t('startedValue', { n: s.started, all: s.people });
  // 폰: 이름 · 잔여 / 받은 · 사용 · 소진율 두 줄 (표가 옆으로 잘렸다 — 2026-10-17)
  const mobile = (items: { key: string; name: ReactNode; sub?: string; sum: Sum | null }[], className = '') => (
    <ListCard className={`lg:hidden ${className}`}>
      {items.map((x) => (
        <li key={x.key} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium">{x.name}</span>
            {x.sum && (
              <span className="num shrink-0 text-xs text-muted">
                {t('lRemaining')} <span className={`text-sm font-medium ${x.sum.remaining < 0 ? 'text-danger' : 'text-primary'}`}>{day(x.sum.remaining)}</span>
              </span>
            )}
          </div>
          <p className="num text-xs text-muted">
            {[x.sub, ...(x.sum ? [`${t('lGranted')} ${day(x.sum.granted)}`, `${t('lUsed')} ${day(x.sum.used)}`, `${t('lRate')} ${pct(x.sum.rate)}`] : [t('notStarted')])].filter(Boolean).join(' · ')}
          </p>
        </li>
      ))}
    </ListCard>
  );
  const nameLink = (id: string, name: string, inactive: boolean) => (
    <>
      <Link href={`/admin/leave/ledger?emp=${id}#detail`} className="font-medium hover:text-primary hover:underline">
        {name}
      </Link>
      {inactive && <span className="ml-2 text-xs text-faint">{t('inactive')}</span>}
    </>
  );

  return (
    <PageShell wide>
      <ReportHead title={t('leaveTitle')} help={t('leaveIntro')}>
        <a href={`/api/admin/reports/leave?${qs}`} className={R.ghost}>
          <Download aria-hidden size={16} />
          {t('download')}
        </a>
      </ReportHead>

      <FilterBar action="/admin/reports/leave" hidden={{ ...(sp.live === '1' ? { live: '1' } : {}), ...(more ? { more: '1' } : {}) }}>
        <Field label={t('fAsOf')}>
          <input type="date" name="to" defaultValue={asOf} className={R.control} />
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
        <label className="col-span-2 flex h-9 items-center gap-2 self-end text-sm text-muted lg:col-span-1">
          <input type="checkbox" name="inactive" value="1" defaultChecked={withInactive} className="size-4 accent-primary" />
          {t('fInactive')}
        </label>
        <button type="submit" className={`${R.primary} self-end`}>
          {t('apply')}
        </button>
      </FilterBar>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Chip tone="info">{t('startedValue', { n: r.total.started, all: r.total.people })}</Chip>
        {practice && <Chip>{t('practice')}</Chip>}
        <Link href="/admin/leave/ledger" className={R.link}>
          {t('toLedger')} ›
        </Link>
      </div>

      <KpiStrip
        items={[
          { label: t('lGranted'), value: <CountUp value={day(r.total.granted)} /> },
          { label: t('lUsed'), value: <CountUp value={day(r.total.used)} />, tone: 'primary' },
          { label: t('lRemaining'), value: <CountUp value={day(r.total.remaining)} />, tone: r.total.remaining < 0 ? 'danger' : 'default' },
          { label: t('lRate'), value: <CountUp value={pct(r.total.rate)} />, tone: 'primary' },
        ]}
      />

      <Block title={t('byGroup')} aside={toggle}>
        {mobile([
          ...r.groups.map((g) => ({ key: g.groupId ?? '', name: g.groupId === null ? t('unassigned') : g.name, sub: started(g), sum: g })),
          { key: 'total', name: t('total'), sub: started(r.total), sum: r.total },
        ])}
        <TableCard className="max-lg:hidden">
          <table className="w-full">
            {head(t('cGroup'), [t('lPeople')])}
            <tbody>
              {r.groups.map((g) => (
                <tr key={g.groupId ?? ''} className={R.tr}>
                  <td className={`${R.td} font-medium`}>{g.groupId === null ? t('unassigned') : g.name}</td>
                  <td className={R.td}>{started(g)}</td>
                  {cellsOf(g).map((v, i) => (
                    <td key={i} className={R.td}>{v}</td>
                  ))}
                </tr>
              ))}
              <tr className={R.total}>
                <td className={`${R.td} font-medium`}>{t('total')}</td>
                <td className={R.td}>{started(r.total)}</td>
                {cellsOf(r.total).map((v, i) => (
                  <td key={i} className={R.td}>{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </TableCard>
      </Block>

      <Block title={t('byPolicyGroup')}>
        {mobile(r.policyGroups.map((g) => ({ key: g.groupId, name: <>{g.name}{g.excluded && <span className="ml-1.5 text-xs font-normal text-warn">{t('excludedTag')}</span>}</>, sub: started(g), sum: g })))}
        <TableCard className="max-lg:hidden">
          <table className="w-full" data-policy-groups>
            {head(t('cPolicyGroup'), [t('lPeople')])}
            <tbody>
              {r.policyGroups.map((g) => (
                <tr key={g.groupId} className={R.tr}>
                  <td className={`${R.td} font-medium`}>
                    {g.name}
                    {g.excluded && <span className="ml-1.5 text-xs font-normal text-warn">{t('excludedTag')}</span>}
                  </td>
                  <td className={R.td}>{started(g)}</td>
                  {cellsOf(g).map((v, i) => (
                    <td key={i} className={R.td}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </Block>

      <Block title={t('byType', { from: r.yearFrom, to: r.asOf })} note={t('typeNote')}>
        {/* 종류별 사용: 일수만큼 가로 막대 */}
        <div className={`${R.card} p-5`} data-type-use>
          {r.typeUse.length === 0 ? (
            <p className="py-4 text-center text-sm text-faint">{t('typeNone')}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {r.typeUse.map((x, i) => (
                <li key={x.code} className="grid grid-cols-1 gap-1.5 text-sm lg:grid-cols-[11rem_minmax(0,1fr)_15rem] lg:items-center lg:gap-5">
                  <span className="truncate">{typeName(x.code)}</span>
                  <span aria-hidden className="h-2 overflow-hidden rounded-chip bg-surface">
                    <span className="fx-grow-x block h-full rounded-chip bg-primary" style={{ width: `${(x.days / typeTop) * 100}%`, animationDelay: `${i * 80}ms` }} />
                  </span>
                  <span className="num flex gap-4 text-xs text-muted lg:justify-end">
                    <span className="text-sm text-text">{day(x.days)}</span>
                    <span>{t('cRequests')} {x.requests}</span>
                    <span>{t('cPeopleUsed')} {x.people}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Block>

      <Block title={t('byEmployeeTitle')} count={r.employees.length} note={t('leaveNote')} aside={toggle}>
        {mobile(r.employees.map((e) => ({
          key: e.employeeId,
          name: nameLink(e.employeeId, e.name, !e.active),
          sub: e.joinedOn ?? undefined,
          sum: e.isStarted ? e : null,
        })))}
        <TableCard className="max-lg:hidden">
          <table className="w-full">
            {head(t('cName'), [t('lJoined')], more ? [t('lOld')] : [])}
            <tbody>
              {r.employees.map((e) => (
                <tr key={e.employeeId} className={R.tr}>
                  <td className={R.td}>{nameLink(e.employeeId, e.name, !e.active)}</td>
                  <td className={`${R.td} text-muted`}>{e.joinedOn ?? ''}</td>
                  {e.isStarted ? (
                    cellsOf(e).map((v, i) => (
                      <td key={i} className={R.td}>{v}</td>
                    ))
                  ) : (
                    <td colSpan={heads.length} className="px-4 py-3 text-right text-sm text-faint">
                      {t('notStarted')}
                    </td>
                  )}
                  {more && <td className={`${R.td} text-muted`}>{e.old === null ? '' : day(e.old)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {r.employees.length === 0 && <p className="p-4 text-sm text-faint">{t('empty')}</p>}
        </TableCard>
      </Block>
    </PageShell>
  );
}
