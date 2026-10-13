// 예상 퇴직금 (직원, PRD v1.3 E02) — 「오늘 그만둔다면」의 어림값. 본인 것만. 저장하지 않고 열 때마다 다시 계산한다.
// 자료가 모자라면 숫자 대신 무엇이 없는지 적는다(0원으로 보이지 않게). 나에게 공개된 명세서의 금액만 쓴다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { myEstimate } from '@/lib/payroll/retirement-data';
import { toKstDate } from '@/lib/time';

export default async function MyRetirementPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, f] = await Promise.all([getTranslations('retirementEstimate'), getFormatter()]);
  const e = await myEstimate(me.id, OFFICE.practiceMode, toKstDate(new Date()));
  const r = e.result;
  const won = (v: number | string) => t('won', { n: f.number(Number(v), { maximumFractionDigits: 0 }) });
  const rows: [string, string][] = [
    ['asOf', e.asOf],
    ['joined', e.periodFrom ?? t('unknown')],
    ['service', r.serviceDays === null ? t('unknown') : t('daysValue', { n: f.number(r.serviceDays) })],
    ['wage', e.input.wage3m === null ? t('unknown') : `${won(e.input.wage3m)} (${e.months.join(', ')})`],
    ['bonus', won(e.input.bonus1y)],
    ['average', r.averageDaily === null ? t('unknown') : won(r.averageDaily)],
  ];
  return (
    <PageShell>
      <Link href="/punch/payslips" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('back')}
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {t('title')}
          <Chip tone="warn">{t('estimateChip')}</Chip>
        </h1>
        <p className="pt-1 text-sm text-faint">{t('intro')}</p>
      </div>
      <Card className="flex items-center justify-between gap-3">
        <span className="font-bold">{t('amount')}</span>
        <span className="num text-2xl font-extrabold" data-estimate>{r.amount === null ? t('cannot') : won(r.amount)}</span>
      </Card>
      {r.missing.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
          {r.missing.map((m) => (
            <li key={m}>{t(`missing.${m}`)}</li>
          ))}
        </ul>
      )}
      <Card>
        <CardTitle>{t('basisTitle')}</CardTitle>
        <dl className="num flex flex-col divide-y divide-border pt-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2">
              <dt className="text-muted">{t(`row.${k}`)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <CardTitle>{t('excludedTitle')}</CardTitle>
        <ul className="list-disc pt-2 pl-5 text-sm text-muted">
          {(['x1', 'x2', 'x3', 'x4'] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-faint">{t('note')}</p>
    </PageShell>
  );
}
