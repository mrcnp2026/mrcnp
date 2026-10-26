// 연간 리포트 — 직원마다 1월~12월 근태를 쌓은 1년 기록 (2026-10-16 의뢰인: 연봉 협상 · 인사평가 근거, 1년치 내려받기). 관리자만.
// 화면 · 엑셀이 같은 계산(buildAnnualReport)을 쓴다. 금액은 없다.
// 폰(2026-10-16 의뢰인: 가로 스크롤 금지 · 세로는 짧게): 조건 두 줄 → 직원마다 한 줄. 항목을 고르면 그 항목의 큰 순서로 줄 서고, 줄 오른쪽에 1년 합계와 12달 작은 막대.
// PC: 항목을 안 고르면 직원 × 전체 항목 합계 표, 고르면 직원 × 1월~12월 표(그 항목). 이름을 누르면 직원 한 명의 1년.
// 2026-10-23 디자인(의뢰인: 정신없고 빡빡하다): 공통 조각(components/report) — 숫자 요약은 한 장, 표는 선만 옅게, 굵은 글씨는 제목 · 큰 숫자에만.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CountUp } from '@/components/CountUp';
import { ParamSelect } from '@/components/ParamSelect';
import { Block, KpiStrip, ListCard, R, ReportHead, TableCard } from '@/components/report';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { groupPath, orgOptions } from '@/lib/org';
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
  const options = orgOptions(groups);
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
  // 맨 위 합계 — 누르면 그 항목으로 줄 세우기
  const sumOf = (m: AnnualMetric) => Math.round(r.employees.reduce((a, e) => a + empTotal(e, m), 0) * 10) / 10;
  const detail = (id: string) => `/admin/reports/annual/${id}?${qs({ g: undefined })}`;
  const kpiMetrics = ['overtime', 'holiday', 'late', 'absent', 'leave'] as const;

  return (
    <PageShell wide>
      <ReportHead title={t('title')} help={t('intro')}>
        <a href={`/api/admin/reports/annual?${qs({ k: undefined })}`} className={R.ghost}>
          <Download aria-hidden size={16} />
          {t('download')}
        </a>
      </ReportHead>

      {/* 조건 — 폰 두 줄, PC 한 줄 */}
      <div className="grid grid-cols-2 items-center gap-2 lg:flex lg:flex-wrap">
        <div className="col-span-2 flex h-11 items-center justify-between rounded-button border border-border bg-bg lg:col-span-1 lg:h-9">
          <Link href={`?${qs({ y: String(year - 1) })}`} aria-label={t('prevYear')} className="flex size-11 items-center justify-center text-muted hover:text-text lg:size-9">
            <ChevronLeft aria-hidden size={18} />
          </Link>
          <span className="num px-3 text-sm font-medium">{t('year', { y: year })}</span>
          {year < thisYear ? (
            <Link href={`?${qs({ y: String(year + 1) })}`} aria-label={t('nextYear')} className="flex size-11 items-center justify-center text-muted hover:text-text lg:size-9">
              <ChevronRight aria-hidden size={18} />
            </Link>
          ) : (
            <span className="size-11 lg:size-9" aria-hidden />
          )}
        </div>
        <ParamSelect name="k" value={k ?? ''} label={t('metric')} params={params} options={[{ value: '', label: t('byName') }, ...ANNUAL_METRICS.map((m) => ({ value: m, label: t(`m.${m}`) }))]} />
        {options.length > 0 && <ParamSelect name="g" value={groupId ?? ''} label={t('group')} params={params} options={[{ value: '', label: `${t('group')}: ${t('all')}` }, ...options.map((o) => ({ value: o.id, label: o.label }))]} />}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
        <span>{first ? t('summary', { n: r.employees.length, from: Number(first.slice(5)), to: Number(last.slice(5)) }) : t('noMonths')}</span>
        {over52 > 0 && <Chip tone="warn">{t('over52People', { n: over52 })}</Chip>}
        {practice && <Chip>{t('practice')}</Chip>}
      </p>

      <KpiStrip
        items={[
          ...kpiMetrics.map((m) => {
            const v = sumOf(m);
            return { label: t(`m.${m}`), value: <CountUp value={unit(m, v)} />, tone: v === 0 ? ('faint' as const) : ('default' as const), href: `?${qs({ k: k === m ? undefined : m })}`, active: k === m };
          }),
          { label: t('kpiOver52'), value: <CountUp value={t('kpiPeople', { n: over52 })} />, tone: over52 > 0 ? 'warn' : 'faint', href: `?${qs({ k: k === 'over52' ? undefined : 'over52' })}`, active: k === 'over52' },
        ]}
      />

      <Block title={k ? t(`m.${k}`) : t('byNameTitle')} count={rows.length}>
        {/* 폰: 직원마다 한 줄 */}
        <ListCard className="lg:hidden" data-phone-annual>
          {rows.map((e) => (
            <li key={e.employeeId}>
              <Link href={detail(e.employeeId)} className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-surface">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{e.name}</span>
                    {e.overWeeks.length > 0 && <Chip tone="warn">{t('m.over52')}</Chip>}
                  </span>
                  {k ? (
                    <span className="truncate text-xs text-muted">{groupName(e.groupId)}</span>
                  ) : (
                    <span className="num truncate text-xs text-muted">
                      {(['late', 'absent', 'overtime', 'holiday'] as const).map((m) => `${t(`m.${m}`)} ${unit(m, empTotal(e, m))}`).join(' · ')}
                    </span>
                  )}
                </span>
                {k && (
                  <>
                    <Spark values={empMonths(e, k)} label={t('sparkAria', { name: t(`m.${k}`), values: empMonths(e, k).map((v, i) => `${i + 1}:${v ?? '-'}`).join(' ') })} />
                    <span className="num w-16 shrink-0 text-right text-sm font-medium">{unit(k, empTotal(e, k))}</span>
                  </>
                )}
                <ChevronRight aria-hidden size={18} className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
          {rows.length === 0 && <li className="p-4 text-sm text-faint">{t('empty')}</li>}
        </ListCard>

        {/* PC: 표 — 항목을 안 고르면 전체 항목 합계, 고르면 그 항목의 1월~12월 */}
        <TableCard className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={R.th}>{t('name')}</th>
                <th scope="col" className={`${R.th} text-left!`}>{t('groupCol')}</th>
                {k
                  ? Array.from({ length: 12 }, (_, i) => (
                      <th key={i} scope="col" className={`${R.th} px-2!`}>{t('monthLabel', { m: i + 1 })}</th>
                    ))
                  : ANNUAL_METRICS.map((m) => (
                      <th key={m} scope="col" className={R.th}>
                        <Link href={`?${qs({ k: m })}`} className="hover:text-primary hover:underline">{t(`m.${m}`)}</Link>
                      </th>
                    ))}
                <th scope="col" className={R.th}>{k ? t('total') : t('monthsCol')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.employeeId} className={R.tr}>
                  <td className={R.td}>
                    <Link href={detail(e.employeeId)} className="font-medium hover:text-primary hover:underline">{e.name}</Link>
                  </td>
                  <td className={`${R.td} text-left! text-muted`}>{groupName(e.groupId)}</td>
                  {k
                    ? empMonths(e, k).map((v, i, all) => {
                        const top = Math.max(1, ...all.map((x) => x ?? 0));
                        return (
                          <td key={i} className={`${R.td} relative px-2! ${!v ? 'text-faint!' : ''}`}>
                            {/* 그 사람의 가장 많은 달 대비 — 칸 아래 얇은 막대 */}
                            {!!v && <span aria-hidden className="fx-grow-x absolute bottom-1.5 left-2 block h-0.5 rounded-chip bg-primary/40" style={{ width: `calc(${(v / top) * 100}% - 1rem)` }} />}
                            {!v ? '–' : v}
                          </td>
                        );
                      })
                    : ANNUAL_METRICS.map((m) => {
                        const v = empTotal(e, m);
                        return (
                          <td key={m} className={`${R.td} ${v === 0 ? 'text-faint!' : m === 'over52' ? 'text-danger!' : ''}`}>{v === 0 ? '–' : unit(m, v)}</td>
                        );
                      })}
                  <td className={`${R.td} ${k ? 'font-medium' : 'text-muted'}`}>{k ? unit(k, empTotal(e, k)) : t('closedOf', { c: e.closedMonths, n: e.months })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-4 text-sm text-faint">{t('empty')}</p>}
        </TableCard>
      </Block>
    </PageShell>
  );
}

/** 12달 작은 막대 (폰 줄 오른쪽) — 기록 없는 달은 빈칸 */
function Spark({ values, label }: { values: (number | null)[]; label: string }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <span role="img" aria-label={label} className="flex h-7 w-20 shrink-0 items-end gap-px">
      {values.map((v, i) => (
        <span key={i} className={`fx-grow flex-1 rounded-t-sm ${v ? 'bg-primary' : 'bg-border'}`} style={{ height: v ? `${Math.max(12, (v / max) * 100)}%` : '2px' }} />
      ))}
    </span>
  );
}
