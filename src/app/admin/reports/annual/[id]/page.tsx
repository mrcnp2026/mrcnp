// 연간 리포트 › 직원 한 명의 1년 (2026-10-16 의뢰인: 연봉 협상 · 인사평가 근거). 관리자만.
// 폰(가로 스크롤 금지 · 세로 짧게): 항목 8칸(4 × 2) → 고른 항목의 1월~12월 막대(한 달 한 줄, 누르면 그 달 기록) → 52시간 넘은 주.
// PC: 같은 순서 + 아래에 달별 전체 항목 표.
// 2026-10-23 디자인(의뢰인: 정신없고 빡빡하다): 공통 조각(components/report) — 글자 크기 네 단계, 굵은 글씨는 제목 · 큰 숫자에만.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DetailBar } from '@/components/detail';
import { Block, KpiStrip, R, TableCard } from '@/components/report';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { ANNUAL_METRICS, buildAnnualReport, empMonths, empTotal, isMetric, metricValue, type AnnualMetric } from '@/lib/report-annual';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;

export default async function AnnualEmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ y?: string; k?: string; live?: string }> }) {
  const [t, { id }, sp, groups] = await Promise.all([getTranslations('admin.annual'), params, searchParams, loadOrgGroups()]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const thisYear = Number(toKstDate(new Date()).slice(0, 4));
  const y = Number(sp.y);
  const year = Number.isInteger(y) && y >= 2000 && y <= thisYear ? y : thisYear;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const k: AnnualMetric = isMetric(sp.k) ? sp.k : 'overtime';
  const r = await buildAnnualReport({ year, practice, groupId: null, employeeId: id });
  const e = r.employees[0];
  const live = sp.live === '1' ? '1' : undefined;
  const qs = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [a, b] of Object.entries({ y: String(year), k: isMetric(sp.k) ? sp.k : undefined, live, ...over })) if (b) q.set(a, b);
    return q.toString();
  };
  const unit = (m: AnnualMetric, n: number) => t(`u.${m}`, { n });
  const backQ = qs({});
  if (!e && year === thisYear) notFound();

  return (
    <PageShell wide>
      <DetailBar
        back={`/admin/reports/annual?${backQ}`}
        backLabel={t('back')}
        title={e?.name ?? t('title')}
        desc={e ? `${e.employeeNo ? `${e.employeeNo} · ` : ''}${e.groupId ? (groupPath(groups, e.groupId) ?? '') : t('unassigned')}` : undefined}
        extra={
          e && (
            <a href={`/api/admin/reports/annual?${new URLSearchParams({ y: String(year), e: id, ...(live ? { live } : {}) })}`} aria-label={t('downloadOne')} title={t('downloadOne')} className="flex size-11 shrink-0 items-center justify-center rounded-button text-primary lg:size-auto lg:min-h-9 lg:gap-1.5 lg:border lg:border-border lg:bg-bg lg:px-3 lg:text-sm lg:font-medium lg:text-text">
              <Download aria-hidden size={18} />
              <span className="hidden lg:inline">{t('downloadOne')}</span>
            </a>
          )
        }
      />

      {/* 해 바꾸기 + 상태 한 줄 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 items-center rounded-button border border-border bg-bg lg:h-9">
          <Link href={`?${qs({ y: String(year - 1) })}`} aria-label={t('prevYear')} className="flex size-10 items-center justify-center text-muted hover:text-text lg:size-9">
            <ChevronLeft aria-hidden size={18} />
          </Link>
          <span className="num px-3 text-sm font-medium">{t('year', { y: year })}</span>
          {year < thisYear ? (
            <Link href={`?${qs({ y: String(year + 1) })}`} aria-label={t('nextYear')} className="flex size-10 items-center justify-center text-muted hover:text-text lg:size-9">
              <ChevronRight aria-hidden size={18} />
            </Link>
          ) : (
            <span className="size-10 lg:size-9" aria-hidden />
          )}
        </div>
        {e && <span className="text-sm text-muted">{t('monthsCol')} {t('closedOf', { c: e.closedMonths, n: e.months })}</span>}
        {practice && <Chip>{t('practice')}</Chip>}
      </div>

      {!e ? (
        <p className="rounded-card border border-border bg-bg p-5 text-sm text-faint">{t('noMonths')}</p>
      ) : (
        <>
          {/* 항목 한 장 — 누르면 아래 막대가 그 항목으로 바뀐다 (주소에 남아 뒤로 가기가 된다) */}
          <KpiStrip
            items={ANNUAL_METRICS.map((m) => {
              const v = empTotal(e, m);
              // 칸이 좁아 100 이상은 정수로
              return { label: t(`m.${m}`), value: unit(m, Math.abs(v) >= 100 ? Math.round(v) : v), tone: m === 'over52' && v > 0 ? ('danger' as const) : v === 0 ? ('faint' as const) : ('default' as const), href: `?${qs({ k: m })}`, active: m === k };
            })}
          />

          {/* 고른 항목의 달별 막대 — 한 달 한 줄, 누르면 그 달 기록 */}
          <Block title={t('byMonth', { name: t(`m.${k}`) })} note={t('provisional')}>
            <div className={`${R.card} p-5`}>
              {(() => {
                const vals = empMonths(e, k);
                const max = Math.max(1, ...vals.map((v) => v ?? 0));
                const href = (i: number) => `/admin/records/${id}?m=${year}-${String(i + 1).padStart(2, '0')}${live ? '&live=1' : ''}`;
                const label = (i: number, v: number | null) => `${t('monthLabel', { m: i + 1 })} ${v === null ? '–' : unit(k, v)} · ${t('toRecords')}`;
                const tone = (i: number) => (e.cells[i]?.isClosed ? 'bg-primary' : 'bg-primary-tint');
                return (
                  <>
                    {/* 폰: 한 달 한 줄(가로 막대) */}
                    <ol className="flex flex-col lg:hidden">
                      {vals.map((v, i) => {
                        const row = (
                          <>
                            <span className="num w-9 shrink-0 text-xs text-muted">{t('monthLabel', { m: i + 1 })}</span>
                            <span className="relative h-2.5 flex-1 rounded-chip bg-surface">
                              {v ? <span className={`absolute inset-y-0 left-0 rounded-chip ${tone(i)}`} style={{ width: `${Math.max(3, (v / max) * 100)}%` }} /> : null}
                            </span>
                            <span className={`num w-16 shrink-0 text-right text-sm ${v === null ? 'text-faint' : ''}`}>{v === null ? '–' : unit(k, v)}</span>
                          </>
                        );
                        return (
                          <li key={i}>
                            {e.cells[i] ? (
                              <Link href={href(i)} aria-label={label(i, v)} className="-mx-1 flex min-h-9 items-center gap-3 rounded-button px-1 active:bg-surface">{row}</Link>
                            ) : (
                              <div className="flex min-h-9 items-center gap-3">{row}</div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                    {/* PC: 12달 세로 막대 한 줄 */}
                    <ol className="hidden h-48 items-end gap-3 lg:flex">
                      {vals.map((v, i) => {
                        const col = (
                          <>
                            <span className={`num text-xs ${v === null ? 'text-faint' : 'text-muted'}`}>{v === null ? '–' : unit(k, v)}</span>
                            <span className={`w-full max-w-10 rounded-t ${v ? tone(i) : 'bg-surface'}`} style={{ height: v ? `${Math.max(4, (v / max) * 100)}%` : '3px' }} />
                            <span className="num text-xs text-muted">{t('monthLabel', { m: i + 1 })}</span>
                          </>
                        );
                        return (
                          <li key={i} className="flex h-full flex-1">
                            {e.cells[i] ? (
                              <Link href={href(i)} aria-label={label(i, v)} className="flex h-full w-full flex-col items-center justify-end gap-1.5 rounded-button px-1 hover:bg-surface">{col}</Link>
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-end gap-1.5 px-1">{col}</div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </>
                );
              })()}
            </div>
          </Block>

          {/* 52시간 넘은 주 */}
          <Block title={t('weeksTitle')} note={t('weeksNote')}>
            <div className={`${R.card} px-5 py-4`}>
              {e.overWeeks.length === 0 ? (
                <p className="text-sm text-faint">{t('noWeeks')}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border/60">
                  {e.overWeeks.map((w) => (
                    <li key={w.monday} className="num py-2.5 text-sm text-danger">
                      {t('weekRow', { monday: w.monday, h: Math.round((w.minutes / 60) * 10) / 10 })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Block>

          {/* PC: 달별 전체 항목 표 (폰은 위 막대로 본다 — 가로 스크롤 없게) */}
          <div className="hidden lg:block">
            <Block title={t('monthTable')}>
              <TableCard>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className={R.th}>{t('monthCol')}</th>
                      {ANNUAL_METRICS.map((m) => (
                        <th key={m} scope="col" className={`${R.th} ${m === k ? 'text-primary!' : ''}`}>{t(`m.${m}`)}</th>
                      ))}
                      <th scope="col" className={R.th}>{t('monthsCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.cells.map((c, i) => (
                      <tr key={i} className={R.tr}>
                        <td className={`${R.td} font-medium`}>{t('monthLabel', { m: i + 1 })}</td>
                        {ANNUAL_METRICS.map((m) => {
                          const v = empMonths(e, m)[i];
                          return <td key={m} className={`${R.td} ${!v ? 'text-faint!' : ''} ${m === k ? 'bg-primary-tint/50' : ''}`}>{v === null ? '–' : !v ? '–' : unit(m, v)}</td>;
                        })}
                        <td className={R.td}>{c ? (c.isClosed ? <Chip tone="ok">{t('closed')}</Chip> : <Chip tone="warn">{t('open')}</Chip>) : null}</td>
                      </tr>
                    ))}
                    <tr className={R.total}>
                      <td className={`${R.td} font-medium`}>{t('total')}</td>
                      {ANNUAL_METRICS.map((m) => (
                        <td key={m} className={`${R.td} font-medium`}>{unit(m, m === 'over52' ? e.overWeeks.length : metricValue(e.total, m))}</td>
                      ))}
                      <td className={`${R.td} text-muted`}>{t('closedOf', { c: e.closedMonths, n: e.months })}</td>
                    </tr>
                  </tbody>
                </table>
              </TableCard>
            </Block>
          </div>
        </>
      )}
    </PageShell>
  );
}
