// 근태 리포트의 최근 6개월 추이 (PRD 35.4 · 미구현 41번) — 화면 본문과 따로 늦게 채운다(Suspense, 2026-10-19 속도).
// 폰 · PC 두 곳에 같은 그래프가 있어 계산은 reportOnce로 한 번만 한다. 이번 달은 본문 표와 같은 계산을 다시 쓴다.
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { BarChart } from '@/components/charts/BarChart';
import { attendanceRate, buildAttendanceDeptReport, type AttSum } from '@/lib/report-attendance';
import { monthReport } from '@/lib/report-month-cache'; // 지난 달은 보관해 두고 다시 쓴다 (2026-10-28)
import { createAdminClient } from '@/lib/supabase/admin';

/** 같은 조건의 리포트는 한 화면에서 한 번만 센다 */
export const reportOnce = cache((ym: string, practice: boolean, groupId: string | null, basis: 'at_month_end' | 'current') => buildAttendanceDeptReport({ ym, practice, groupId, basis }));

export const trendOnce = cache(async (month: string, practice: boolean, groupId: string | null, basis: 'at_month_end' | 'current') => {
  const shiftYm = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const { data: firstRule } = await createAdminClient().from('work_rules').select('effective_from').eq('active', true).order('effective_from').limit(1);
  const ruleFrom = ((firstRule?.[0]?.effective_from as string | undefined) ?? '9999-12-31').slice(0, 7); // 근무 규칙이 시작한 달 — 그 전 달은 셀 수 없다
  return Promise.all(Array.from({ length: 6 }, (_, i) => shiftYm(month, i - 5)).map((m) => (m < ruleFrom ? Promise.resolve({ m, s: null as AttSum | null }) : (m === month ? reportOnce(m, practice, groupId, basis).then((x) => x.total) : monthReport({ ym: m, practice, groupId, basis }).then((x) => x.total)).then((x) => ({ m, s: x as AttSum | null }), () => ({ m, s: null as AttSum | null })))));
});

export async function TrendCharts({ month, practice, groupId, basis }: { month: string; practice: boolean; groupId: string | null; basis: 'at_month_end' | 'current' }) {
  const t = await getTranslations('admin.reports');
  const trend = await trendOnce(month, practice, groupId, basis);
  const METRICS = [
    { key: 'cRate', v: (x: AttSum) => attendanceRate(x), unit: 'pctUnit' },
    { key: 'cNet', v: (x: AttSum) => Math.round((x.netMinutes / 60) * 10) / 10, unit: 'hUnit' },
    { key: 'cOvertime', v: (x: AttSum) => Math.round((x.overtimeMinutes / 60) * 10) / 10, unit: 'hUnit' },
    { key: 'cLate', v: (x: AttSum) => x.lateCount, unit: 'countUnit' },
    { key: 'cAbsent', v: (x: AttSum) => x.absentDays, unit: 'dayUnit' },
    { key: 'cPaidLeave', v: (x: AttSum) => Math.round(x.paidLeaveDays * 100) / 100, unit: 'dayUnit' },
  ] as const;

  // 2026-10-27 의뢰인(「리포트가 어지럽다 · 그래프가 별로」): 관리자 첫 화면과 같은 막대(components/charts/BarChart)로.
  //   한 줄에 셋(PC) — 작은 상자 여섯 개에 숫자가 겹치던 것을 크게. 고른 달만 초록, 나머지는 베이지. 손을 대면 그달 값 · 평균과의 차이
  const f = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const focus = trend.findIndex((x) => x.m === month);
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-trend>
        {METRICS.map((mt) => {
          const vals = trend.map((x) => (x.s ? mt.v(x.s) : null));
          // 막대 위 숫자는 짧게: 100 이상은 정수, 그 아래는 소수 한 자리
          const short = (v: number | null) => (v == null ? '–' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('ko-KR') : String(Math.round(v * 10) / 10));
          return (
            <section key={mt.key} className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-bg p-5 shadow-card">
              <h3 className="flex items-baseline justify-between gap-2 text-base font-semibold">
                {t(mt.key)}
                <span className="text-xs font-normal text-muted">{t(mt.unit)}</span>
              </h3>
              <BarChart
                ariaLabel={t('trendAria', { name: t(mt.key), values: trend.map((x, i) => `${x.m} ${vals[i] ?? '-'}`).join(', ') })}
                focus={focus}
                vsAvg={t('trendVsAvg')}
                bars={trend.map((x, i) => ({ key: x.m, label: `${Number(x.m.slice(5))}${t('monthSuffix')}`, short: String(Number(x.m.slice(5))), n: vals[i] ?? 0, skip: vals[i] == null, text: short(vals[i]), tip: `${x.m} · ${vals[i] == null ? '–' : f(vals[i]!)}` }))}
              />
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted">{t('trendNote')}</p>
    </>
  );
}
