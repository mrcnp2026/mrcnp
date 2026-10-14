// 근태 리포트 — 부서/전사의 한 달 근태 합계와 직원별 내역 (PRD v1.3 35.4, A21). 관리자만.
// 화면과 「엑셀 받기」가 같은 계산(buildAttendanceDeptReport)을 쓴다 — 조건이 같으면 숫자가 같다. 금액은 없다.
import { getTranslations } from 'next-intl/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { HelpTip } from '@/components/Help';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { isMonth } from '@/lib/close-review';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { buildAttendanceDeptReport, type AttSum } from '@/lib/report-attendance';
import { toKstDate } from '@/lib/time';

const field = 'min-h-9 w-full rounded-button border border-border bg-bg px-3 text-sm lg:w-auto';

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
  // 최근 6개월 추이 (PRD 35.4 · 미구현 41번, 2026-10-15) — 같은 조건(부서 · 소속 기준)으로 달마다 다시 센다. 근무 규칙이 없던 달 등 셀 수 없으면 빈칸
  const shiftYm = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const { data: firstRule } = await createAdminClient().from('work_rules').select('effective_from').eq('active', true).order('effective_from').limit(1);
  const ruleFrom = ((firstRule?.[0]?.effective_from as string | undefined) ?? '9999-12-31').slice(0, 7); // 근무 규칙이 시작한 달 — 그 전 달은 셀 수 없다
  const trend = await Promise.all(Array.from({ length: 6 }, (_, i) => shiftYm(month, i - 5)).map((m) => (m < ruleFrom ? Promise.resolve({ m, s: null as AttSum | null }) : buildAttendanceDeptReport({ ym: m, practice, groupId, basis }).then((x) => ({ m, s: x.total as AttSum | null }), () => ({ m, s: null as AttSum | null })))));
  const METRICS = [
    { key: 'cNet', v: (x: AttSum) => Math.round((x.netMinutes / 60) * 10) / 10, unit: 'hUnit' },
    { key: 'cOvertime', v: (x: AttSum) => Math.round((x.overtimeMinutes / 60) * 10) / 10, unit: 'hUnit' },
    { key: 'cLate', v: (x: AttSum) => x.lateCount, unit: 'countUnit' },
    { key: 'cAbsent', v: (x: AttSum) => x.absentDays, unit: 'dayUnit' },
    { key: 'cPaidLeave', v: (x: AttSum) => x.paidLeaveDays, unit: 'dayUnit' },
  ] as const;

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
              {([0, 2, 3, 6, 9, 11] as const).map((i) => (
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
                    {t('cPayable')} {c[2]} · {t('cOvertime')} {c[3]} · {t('cLate')} {c[6]}
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

      <h2 className="text-lg font-bold">{t('trendTitle')}</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5 lg:gap-3" data-trend>
        {METRICS.map((mt) => {
          const vals = trend.map((x) => (x.s ? mt.v(x.s) : null));
          const max = Math.max(1, ...vals.map((v) => v ?? 0));
          return (
            <section key={mt.key} className="rounded-card border border-border bg-bg p-3">
              <h3 className="text-sm font-bold">{t(mt.key)}</h3>
              <div className="mt-2 flex h-28 items-end gap-1.5" role="img" aria-label={t('trendAria', { name: t(mt.key), values: trend.map((x, i) => `${x.m} ${vals[i] ?? '-'}`).join(', ') })}>
                {trend.map((x, i) => (
                  <div key={x.m} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="num text-xs text-muted">{vals[i] ?? '–'}</span>
                    <div className={`w-full rounded-t-sm ${x.m === month ? 'bg-primary' : 'bg-primary-tint'}`} style={{ height: `${vals[i] ? Math.max(4, (vals[i]! / max) * 100) : 0}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1.5">
                {trend.map((x) => (
                  <span key={x.m} className="num flex-1 text-center text-xs text-faint">{x.m.slice(5)}</span>
                ))}
              </div>
              <p className="pt-1 text-xs text-faint">{t(mt.unit)}</p>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-faint">{t('trendNote')}</p>
    </PageShell>
  );
}
