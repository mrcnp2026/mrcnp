// 출근율 일별 · 주별 추이 (2026-10-19 의뢰인, 「아직 안 만든 기능」 #41). 한 달 안에서 날(또는 주)마다 출근한 사람 ÷ 출근해야 했던 사람.
// 한 가지 값이라 한 가지 색(파랑) · 막대 끝은 둥글게 · 0 기준선 · 마우스를 올리면 그 날 숫자(title) · 아래에 표(접힘)로도 본다 — 색만으로 읽지 않게.
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { AttDay } from '@/lib/report-attendance';

const mondayOf = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};
const pct = (present: number, due: number) => (due > 0 ? Math.round((present / due) * 1000) / 10 : null);

export async function DailyRate({ daily, mode, hrefOf }: { daily: AttDay[]; mode: 'day' | 'week'; hrefOf: (mode: 'day' | 'week') => string }) {
  const t = await getTranslations('admin.reports.rate');
  const days = daily.filter((d) => d.due > 0);
  const points =
    mode === 'day'
      ? days.map((d) => ({ key: d.date, label: d.date.slice(8), long: d.date, ...d }))
      : [...days.reduce((m, d) => {
          const k = mondayOf(d.date);
          const x = m.get(k) ?? { date: k, due: 0, present: 0, late: 0 };
          x.due += d.due; x.present += d.present; x.late += d.late;
          return m.set(k, x);
        }, new Map<string, AttDay>()).values()].map((d) => ({ key: d.date, label: t('weekOf', { date: d.date.slice(5).replace('-', '/') }), long: t('weekOf', { date: d.date }), ...d }));
  const tab = (m: 'day' | 'week') => (
    <Link href={hrefOf(m)} scroll={false} aria-current={mode === m ? 'page' : undefined} className={`inline-flex h-8 items-center rounded-button px-3 text-sm font-bold ${mode === m ? 'bg-primary text-on-primary' : 'border border-border bg-bg text-muted'}`}>
      {t(m)}
    </Link>
  );
  return (
    <section className="flex flex-col gap-2 rounded-card border border-border bg-bg p-3" data-daily-rate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{t('title')}</h3>
        <span className="flex gap-1.5">
          {tab('day')}
          {tab('week')}
        </span>
      </div>
      {points.length === 0 ? (
        <p className="text-sm text-faint">{t('empty')}</p>
      ) : (
        <>
          {/* 세로 0 ~ 100%. 막대 사이 틈 · 끝 둥글게. 날마다 막대가 좁아도 누를 곳은 칸 전체 */}
          <div className="flex h-28 items-stretch gap-px border-b border-border sm:gap-0.5" role="img" aria-label={t('aria', { values: points.map((p) => `${p.long} ${pct(p.present, p.due) ?? '-'}%`).join(', ') })}>
            {points.map((p) => {
              const v = pct(p.present, p.due) ?? 0;
              return (
                <div key={p.key} className="group flex min-w-0 flex-1 flex-col justify-end" title={t('tip', { date: p.long, rate: v, present: p.present, due: p.due, late: p.late })}>
                  <div className="mx-auto w-full max-w-6 rounded-t bg-primary group-hover:opacity-80" style={{ height: `${Math.max(2, v)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex gap-px sm:gap-0.5">
            {points.map((p, i) => (
              <span key={p.key} className="num min-w-0 flex-1 text-center text-xs text-faint">{mode === 'week' || i % 5 === 0 || i === points.length - 1 ? p.label : ''}</span>
            ))}
          </div>
          <details className="text-sm">
            <summary className="flex min-h-9 cursor-pointer items-center text-muted">{t('table')}</summary>
            <ul className="num flex flex-col divide-y divide-border">
              {points.map((p) => (
                <li key={p.key} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span>{p.long}</span>
                  <span>{t('row', { rate: pct(p.present, p.due) ?? '-', present: p.present, due: p.due, late: p.late })}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      <p className="text-xs text-faint">{t('note')}</p>
    </section>
  );
}
