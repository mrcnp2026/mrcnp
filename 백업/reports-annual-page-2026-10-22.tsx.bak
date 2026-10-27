// 연간 리포트 — 직원마다 1월~12월 근태를 쌓은 1년 기록 (2026-10-16 의뢰인: 연봉 협상 · 인사평가 근거, 1년치 내려받기). 관리자만.
// 화면 · 엑셀이 같은 계산(buildAnnualReport)을 쓴다. 금액은 없다.
// 폰(2026-10-16 의뢰인: 가로 스크롤 금지 · 세로는 짧게): 조건 두 줄 → 직원마다 한 줄. 항목을 고르면 그 항목의 큰 순서로 줄 서고, 줄 오른쪽에 1년 합계와 12달 작은 막대.
// PC: 항목을 안 고르면 직원 × 전체 항목 합계 표, 고르면 직원 × 1월~12월 표(그 항목). 이름을 누르면 직원 한 명의 1년.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpTip } from '@/components/Help';
import { ParamSelect } from '@/components/ParamSelect';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { buildOrgTree, groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { ANNUAL_METRICS, buildAnnualReport, empMonths, empTotal, isMetric, type AnnualEmp, type AnnualMetric } from '@/lib/report-annual';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;

export default async function AnnualReportPage({ searchParams }: { searchParams: Promise<{ y?: string; g?: string; k?: string; live?: string }> }) {
  const [t, sp, groups] = await Promise.all([getTranslations('admin.annual'), searchParams, loadOrgGroups()]);
  const thisYear = Number(toKstDate(new Date()).slice(0, 4));
  const y = Number(sp.y);
  const year = Number.isInteger(y) && y >= 2000 && y <= thisYear ? y : thisYear;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const options = buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]);
  const groupId = options.some((o) => o.id === sp.g) ? sp.g! : null;
  const k: AnnualMetric | null = isMetric(sp.k) ? sp.k : null;
  const r = await buildAnnualReport({ year, practice, groupId });

  const params = { y: String(year), g: groupId ?? undefined, k: k ?? undefined, live: sp.live === '1' ? '1' : undefined };
  const qs = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [a, b] of Object.entries({ ...params, ...over })) if (b) q.set(a, b);
    return q.toString();
  };
  const unit = (m: AnnualMetric, n: number) => t(`u.${m}`, { n });
  const rows: AnnualEmp[] = k ? [...r.employees].sort((a, b) => empTotal(b, k) - empTotal(a, k) || a.name.localeCompare(b.name, 'ko')) : r.employees;
  const over52 = r.employees.filter((e) => e.overWeeks.length > 0).length;
  const first = r.months[0], last = r.months[r.months.length - 1];
  const groupName = (id: string | null) => (id ? (groupPath(groups, id) ?? '') : t('unassigned'));
  const detail = (id: string) => `/admin/reports/annual/${id}?${qs({ g: undefined })}`;

  return (
    <PageShell wide>
      <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
        {t('title')}
        <HelpTip>{t('intro')}</HelpTip>
      </h1>

      {/* 조건 — 폰 두 줄: [‹ 해 ›][항목] / [부서][엑셀]. PC 한 줄 */}
      <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
        <div className="flex min-h-11 items-center justify-between rounded-button border border-border bg-bg lg:min-h-9">
          <Link href={`?${qs({ y: String(year - 1) })}`} aria-label={t('prevYear')} className="flex size-11 items-center justify-center text-muted lg:size-9">
            <ChevronLeft aria-hidden size={18} />
          </Link>
          <b className="num px-1 text-base lg:text-sm">{t('year', { y: year })}</b>
          {year < thisYear ? (
            <Link href={`?${qs({ y: String(year + 1) })}`} aria-label={t('nextYear')} className="flex size-11 items-center justify-center text-muted lg:size-9">
              <ChevronRight aria-hidden size={18} />
            </Link>
          ) : (
            <span className="size-11 lg:size-9" aria-hidden />
          )}
        </div>
        <ParamSelect name="k" value={k ?? ''} label={t('metric')} params={params} options={[{ value: '', label: t('byName') }, ...ANNUAL_METRICS.map((m) => ({ value: m, label: t(`m.${m}`) }))]} />
        {options.length > 0 ? (
          <ParamSelect name="g" value={groupId ?? ''} label={t('group')} params={params} options={[{ value: '', label: `${t('group')}: ${t('all')}` }, ...options.map((o) => ({ value: o.id, label: o.label }))]} />
        ) : (
          <span className="hidden" />
        )}
        <a href={`/api/admin/reports/annual?${qs({ k: undefined })}`} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-button border border-border bg-bg px-3 text-sm font-semibold text-text hover:bg-surface lg:ml-auto lg:min-h-9 ${options.length > 0 ? '' : 'col-span-2'}`}>
          <Download aria-hidden size={16} />
          {t('download')}
        </a>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span>{first ? t('summary', { n: r.employees.length, from: Number(first.slice(5)), to: Number(last.slice(5)) }) : t('noMonths')}</span>
        {over52 > 0 && <Chip tone="warn">{t('over52People', { n: over52 })}</Chip>}
        {practice && <Chip>{t('practice')}</Chip>}
      </p>

      {/* 폰: 직원마다 한 줄 */}
      <ul className="-mx-4 flex flex-col divide-y divide-border border-y border-border bg-bg lg:hidden" data-phone-annual>
        {rows.map((e) => (
          <li key={e.employeeId}>
            <Link href={detail(e.employeeId)} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-surface">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                  <b className="truncate">{e.name}</b>
                  {e.overWeeks.length > 0 && <Chip tone="warn">{t('m.over52')}</Chip>}
                </span>
                {k ? (
                  <span className="truncate text-xs text-faint">{groupName(e.groupId)}</span>
                ) : (
                  <span className="num truncate text-xs text-muted">
                    {(['late', 'absent', 'overtime', 'holiday'] as const).map((m) => `${t(`m.${m}`)} ${unit(m, empTotal(e, m))}`).join(' · ')}
                  </span>
                )}
              </span>
              {k && (
                <>
                  <Spark values={empMonths(e, k)} label={t('sparkAria', { name: t(`m.${k}`), values: empMonths(e, k).map((v, i) => `${i + 1}:${v ?? '-'}`).join(' ') })} />
                  <b className="num w-16 shrink-0 text-right">{unit(k, empTotal(e, k))}</b>
                </>
              )}
              <ChevronRight aria-hidden size={18} className="shrink-0 text-faint" />
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="p-4 text-sm text-faint">{t('empty')}</li>}
      </ul>

      {/* PC: 표 — 항목을 안 고르면 전체 항목 합계, 고르면 그 항목의 1월~12월 */}
      <div className="hidden overflow-x-auto border-t border-text bg-bg lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('name')}</th>
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t('groupCol')}</th>
              {k
                ? Array.from({ length: 12 }, (_, i) => (
                    <th key={i} scope="col" className="px-2 py-2.5 text-right text-xs font-semibold whitespace-nowrap text-muted">{t('monthLabel', { m: i + 1 })}</th>
                  ))
                : ANNUAL_METRICS.map((m) => (
                    <th key={m} scope="col" className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap">
                      <Link href={`?${qs({ k: m })}`} className="text-muted hover:text-primary hover:underline">{t(`m.${m}`)}</Link>
                    </th>
                  ))}
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap text-muted">{k ? t('total') : t('monthsCol')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.employeeId} className="border-b border-border hover:bg-surface">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={detail(e.employeeId)} className="font-bold text-primary hover:underline">{e.name}</Link>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted">{groupName(e.groupId)}</td>
                {k
                  ? empMonths(e, k).map((v, i) => (
                      <td key={i} className={`num px-2 py-2 text-right whitespace-nowrap ${v === null ? 'text-faint' : v === 0 ? 'text-faint' : ''}`}>{v === null ? '–' : v}</td>
                    ))
                  : ANNUAL_METRICS.map((m) => {
                      const v = empTotal(e, m);
                      return (
                        <td key={m} className={`num px-3 py-2 text-right whitespace-nowrap ${v === 0 ? 'text-faint' : m === 'over52' ? 'font-bold text-danger' : ''}`}>{unit(m, v)}</td>
                      );
                    })}
                <td className="num px-3 py-2 text-right whitespace-nowrap">{k ? <b>{unit(k, empTotal(e, k))}</b> : t('closedOf', { c: e.closedMonths, n: e.months })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-faint">{t('empty')}</p>}
      </div>
    </PageShell>
  );
}

/** 12달 작은 막대 (폰 줄 오른쪽) — 기록 없는 달은 빈칸 */
function Spark({ values, label }: { values: (number | null)[]; label: string }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <span role="img" aria-label={label} className="flex h-7 w-20 shrink-0 items-end gap-px">
      {values.map((v, i) => (
        <span key={i} className={`flex-1 rounded-t-sm ${v ? 'bg-primary' : 'bg-border'}`} style={{ height: v ? `${Math.max(12, (v / max) * 100)}%` : '2px' }} />
      ))}
    </span>
  );
}
