// 근태 리포트의 최근 6개월 추이 (PRD 35.4 · 미구현 41번) — 화면 본문과 따로 늦게 채운다(Suspense, 2026-10-19 속도).
// 폰 · PC 두 곳에 같은 그래프가 있어 계산은 reportOnce로 한 번만 한다. 이번 달은 본문 표와 같은 계산을 다시 쓴다.
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { buildAttendanceDeptReport, type AttSum } from '@/lib/report-attendance';
import { createAdminClient } from '@/lib/supabase/admin';

/** 같은 조건의 리포트는 한 화면에서 한 번만 센다 */
export const reportOnce = cache((ym: string, practice: boolean, groupId: string | null, basis: 'at_month_end' | 'current') => buildAttendanceDeptReport({ ym, practice, groupId, basis }));

const trendOnce = cache(async (month: string, practice: boolean, groupId: string | null, basis: 'at_month_end' | 'current') => {
  const shiftYm = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const { data: firstRule } = await createAdminClient().from('work_rules').select('effective_from').eq('active', true).order('effective_from').limit(1);
  const ruleFrom = ((firstRule?.[0]?.effective_from as string | undefined) ?? '9999-12-31').slice(0, 7); // 근무 규칙이 시작한 달 — 그 전 달은 셀 수 없다
  return Promise.all(Array.from({ length: 6 }, (_, i) => shiftYm(month, i - 5)).map((m) => (m < ruleFrom ? Promise.resolve({ m, s: null as AttSum | null }) : reportOnce(m, practice, groupId, basis).then((x) => ({ m, s: x.total as AttSum | null }), () => ({ m, s: null as AttSum | null })))));
});

export async function TrendCharts({ month, practice, groupId, basis }: { month: string; practice: boolean; groupId: string | null; basis: 'at_month_end' | 'current' }) {
  const t = await getTranslations('admin.reports');
  const trend = await trendOnce(month, practice, groupId, basis);
  const METRICS = [
    { key: 'cNet', v: (x: AttSum) => Math.round((x.netMinutes / 60) * 10) / 10, unit: 'hUnit' },
    { key: 'cOvertime', v: (x: AttSum) => Math.round((x.overtimeMinutes / 60) * 10) / 10, unit: 'hUnit' },
    { key: 'cLate', v: (x: AttSum) => x.lateCount, unit: 'countUnit' },
    { key: 'cAbsent', v: (x: AttSum) => x.absentDays, unit: 'dayUnit' },
    { key: 'cPaidLeave', v: (x: AttSum) => Math.round(x.paidLeaveDays * 100) / 100, unit: 'dayUnit' },
  ] as const;

  // 최근 6개월 그래프 — 폰은 직원 목록 아래로 화면이 아주 길어져 접어 둔다(PC는 펼친 채) (2026-10-18 디자인)
  return (
    <>
      {/* 폰은 한 줄에 그래프 하나 — 두 칸이면 「4725.8」 같은 숫자가 막대보다 넓어 상자 밖으로 나갔다 (2026-10-17 의뢰인) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3 2xl:grid-cols-5" data-trend>
        {METRICS.map((mt) => {
          const vals = trend.map((x) => (x.s ? mt.v(x.s) : null));
          const max = Math.max(1, ...vals.map((v) => v ?? 0));
          // 막대 위 숫자는 짧게: 100 이상은 정수, 그 아래는 소수 한 자리
          const short = (v: number | null) => (v == null ? '–' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('ko-KR') : String(Math.round(v * 10) / 10));
          return (
            <section key={mt.key} className="min-w-0 overflow-hidden rounded-card border border-border bg-bg p-3">
              <h3 className="flex items-baseline justify-between gap-2 text-sm font-bold">
                {t(mt.key)}
                <span className="text-xs font-normal text-faint">{t(mt.unit)}</span>
              </h3>
              <div className="mt-2 flex h-24 items-stretch gap-1.5" role="img" aria-label={t('trendAria', { name: t(mt.key), values: trend.map((x, i) => `${x.m} ${vals[i] ?? '-'}`).join(', ') })}>
                {trend.map((x, i) => (
                  <div key={x.m} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 flex-col items-center justify-end gap-0.5">
                      <span className="num max-w-full truncate text-xs text-muted">{short(vals[i])}</span>
                      <div className={`w-full rounded-t-sm ${x.m === month ? 'bg-primary' : 'bg-primary-tint'}`} style={{ height: `${vals[i] ? Math.max(4, (vals[i]! / max) * 75) : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1.5">
                {trend.map((x) => (
                  <span key={x.m} className="num min-w-0 flex-1 text-center text-xs text-faint">{x.m.slice(5)}</span>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-faint">{t('trendNote')}</p>
    </>
  );
}
