// 연간 리포트 › 직원 한 명의 1년 (2026-10-16 의뢰인: 연봉 협상 · 인사평가 근거). 관리자만.
// 폰(가로 스크롤 금지 · 세로 짧게): 항목 8칸(4 × 2) → 고른 항목의 1월~12월 막대(한 달 한 줄, 누르면 그 달 기록) → 52시간 넘은 주.
// PC: 같은 순서 + 아래에 달별 전체 항목 표.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DetailBar } from '@/components/detail';
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
            <a href={`/api/admin/reports/annual?${new URLSearchParams({ y: String(year), e: id, ...(live ? { live } : {}) })}`} aria-label={t('downloadOne')} title={t('downloadOne')} className="flex size-11 shrink-0 items-center justify-center rounded-button text-primary lg:size-auto lg:min-h-9 lg:gap-1.5 lg:border lg:border-border lg:bg-bg lg:px-3 lg:text-sm lg:font-semibold lg:text-text">
              <Download aria-hidden size={18} />
              <span className="hidden lg:inline">{t('downloadOne')}</span>
            </a>
          )
        }
      />

      {/* 해 바꾸기 + 상태 한 줄 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-button border border-border bg-bg">
          <Link href={`?${qs({ y: String(year - 1) })}`} aria-label={t('prevYear')} className="flex size-10 items-center justify-center text-muted lg:size-9">
            <ChevronLeft aria-hidden size={18} />
          </Link>
          <b className="num px-1 text-sm">{t('year', { y: year })}</b>
          {year < thisYear ? (
            <Link href={`?${qs({ y: String(year + 1) })}`} aria-label={t('nextYear')} className="flex size-10 items-center justify-center text-muted lg:size-9">
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
        <p className="rounded-card border border-border bg-bg p-4 text-sm text-faint">{t('noMonths')}</p>
      ) : (
        <>
          {/* 항목 8칸 — 누르면 아래 막대가 그 항목으로 바뀐다 (주소에 남아 뒤로 가기가 된다) */}
          <nav aria-label={t('metric')} className="grid grid-cols-4 gap-1.5 lg:grid-cols-8 lg:gap-2">
            {ANNUAL_METRICS.map((m) => {
              const on = m === k;
              const v = empTotal(e, m);
              return (
                <Link
                  key={m}
                  href={`?${qs({ k: m })}`}
                  replace
                  scroll={false}
                  aria-current={on ? 'true' : undefined}
                  className={`flex min-h-16 flex-col justify-center rounded-card border px-2 py-2 lg:shadow-card ${on ? 'border-primary bg-primary-tint' : 'border-border bg-bg hover:border-primary'}`}
                >
                  <span className={`truncate text-xs ${on ? 'font-bold text-primary' : 'text-muted'}`}>{t(`m.${m}`)}</span>
                  {/* 칸이 좁아 100 이상은 정수로 (2026-10-17 디자인: 「1474....」로 잘렸다) */}
                  <b className={`num truncate text-sm lg:text-base ${m === 'over52' && v > 0 ? 'text-danger' : ''}`}>{unit(m, Math.abs(v) >= 100 ? Math.round(v) : v)}</b>
                </Link>
              );
            })}
          </nav>

          {/* 고른 항목의 달별 막대 — 한 달 한 줄, 누르면 그 달 기록 */}
          <section className="rounded-card border border-border bg-bg p-3 lg:p-4 lg:shadow-card">
            <h2 className="text-sm font-bold lg:text-base">{t('byMonth', { name: t(`m.${k}`) })}</h2>
            {(() => {
              const vals = empMonths(e, k);
              const max = Math.max(1, ...vals.map((v) => v ?? 0));
              const href = (i: number) => `/admin/records/${id}?m=${year}-${String(i + 1).padStart(2, '0')}${live ? '&live=1' : ''}`;
              const label = (i: number, v: number | null) => `${t('monthLabel', { m: i + 1 })} ${v === null ? '–' : unit(k, v)} · ${t('toRecords')}`;
              const tone = (i: number) => (e.cells[i]?.isClosed ? 'bg-primary' : 'bg-primary-tint');
              return (
                <>
                  {/* 폰: 한 달 한 줄(가로 막대) */}
                  <ol className="mt-2 flex flex-col lg:hidden">
                    {vals.map((v, i) => {
                      const row = (
                        <>
                          <span className="num w-9 shrink-0 text-xs text-muted">{t('monthLabel', { m: i + 1 })}</span>
                          <span className="relative h-3.5 flex-1 rounded-sm bg-surface">
                            {v ? <span className={`absolute inset-y-0 left-0 rounded-sm ${tone(i)}`} style={{ width: `${Math.max(3, (v / max) * 100)}%` }} /> : null}
                          </span>
                          <span className={`num w-16 shrink-0 text-right text-sm ${v === null ? 'text-faint' : ''}`}>{v === null ? '–' : unit(k, v)}</span>
                        </>
                      );
                      return (
                        <li key={i}>
                          {e.cells[i] ? (
                            <Link href={href(i)} aria-label={label(i, v)} className="-mx-1 flex min-h-8 items-center gap-2 rounded-button px-1 active:bg-surface">{row}</Link>
                          ) : (
                            <div className="flex min-h-8 items-center gap-2">{row}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {/* PC: 12달 세로 막대 한 줄 — 낮게 */}
                  <ol className="mt-3 hidden h-44 items-end gap-2 lg:flex">
                    {vals.map((v, i) => {
                      const col = (
                        <>
                          <span className={`num text-xs ${v === null ? 'text-faint' : 'text-muted'}`}>{v === null ? '–' : unit(k, v)}</span>
                          <span className={`w-full rounded-t-sm ${v ? tone(i) : 'bg-surface'}`} style={{ height: v ? `${Math.max(4, (v / max) * 100)}%` : '3px' }} />
                          <span className="num text-xs text-faint">{t('monthLabel', { m: i + 1 })}</span>
                        </>
                      );
                      return (
                        <li key={i} className="flex h-full flex-1">
                          {e.cells[i] ? (
                            <Link href={href(i)} aria-label={label(i, v)} className="flex h-full w-full flex-col items-center justify-end gap-1 rounded-button px-1 hover:bg-surface">{col}</Link>
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-end gap-1 px-1">{col}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </>
              );
            })()}
            <p className="mt-1 text-xs text-faint">{t('provisional')}</p>
          </section>

          {/* 52시간 넘은 주 */}
          <section className="rounded-card border border-border bg-bg p-3 lg:p-4 lg:shadow-card">
            <h2 className="text-sm font-bold lg:text-base">{t('weeksTitle')}</h2>
            {e.overWeeks.length === 0 ? (
              <p className="mt-1 text-sm text-faint">{t('noWeeks')}</p>
            ) : (
              <ul className="mt-1 flex flex-col divide-y divide-border">
                {e.overWeeks.map((w) => (
                  <li key={w.monday} className="num py-2 text-sm">
                    <span className="font-bold text-danger">{t('weekRow', { monday: w.monday, h: Math.round((w.minutes / 60) * 10) / 10 })}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-faint">{t('weeksNote')}</p>
          </section>

          {/* PC: 달별 전체 항목 표 (폰은 위 막대로 본다 — 가로 스크롤 없게) */}
          <section className="hidden lg:block">
            <h2 className="mb-2 text-base font-bold">{t('monthTable')}</h2>
            <div className="overflow-x-auto border-t border-text bg-bg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left">
                    <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-muted">{t('monthCol')}</th>
                    {ANNUAL_METRICS.map((m) => (
                      <th key={m} scope="col" className={`px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap ${m === k ? 'text-primary' : 'text-muted'}`}>{t(`m.${m}`)}</th>
                    ))}
                    <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-muted">{t('monthsCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {e.cells.map((c, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="num px-3 py-2 font-bold whitespace-nowrap">{t('monthLabel', { m: i + 1 })}</td>
                      {ANNUAL_METRICS.map((m) => {
                        const v = empMonths(e, m)[i];
                        return <td key={m} className={`num px-3 py-2 text-right whitespace-nowrap ${!v ? 'text-faint' : ''} ${m === k ? 'bg-primary-tint' : ''}`}>{v === null ? '–' : unit(m, v)}</td>;
                      })}
                      <td className="px-3 py-2 text-right">{c ? (c.isClosed ? <Chip tone="ok">{t('closed')}</Chip> : <Chip tone="warn">{t('open')}</Chip>) : null}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface font-bold">
                    <td className="px-3 py-2">{t('total')}</td>
                    {ANNUAL_METRICS.map((m) => (
                      <td key={m} className="num px-3 py-2 text-right whitespace-nowrap">{unit(m, m === 'over52' ? e.overWeeks.length : metricValue(e.total, m))}</td>
                    ))}
                    <td className="num px-3 py-2 text-right">{t('closedOf', { c: e.closedMonths, n: e.months })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}
