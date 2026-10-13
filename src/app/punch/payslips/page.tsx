// 내 명세서 — 관리자가 공개한 내 급여 명세서 목록 (PRD v1.3 E01). 본인 것만, 공개 중인 것만 보인다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadMySlips } from '@/lib/payroll/publish-data';
import { toKstDate } from '@/lib/time';

export default async function MyPayslipsPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, f] = await Promise.all([getTranslations('payslip'), getFormatter()]);
  const slips = await loadMySlips(me.id, OFFICE.practiceMode);
  const won = (v: number) => t('won', { n: f.number(v) });
  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="pt-1 text-sm text-faint">{t('intro')}</p>
      </div>
      <Link href="/punch/retirement" className="inline-flex min-h-11 items-center self-start rounded-button border border-border bg-bg px-4 text-sm font-bold text-primary">
        {t('toRetirement')}
      </Link>
      {slips.length === 0 ? (
        <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {slips.map((s) => (
            <li key={s.id}>
              <Link href={`/punch/payslips/${s.id}`} className="flex items-center justify-between gap-3 rounded-card border border-border bg-bg p-4">
                <span className="flex flex-col gap-1">
                  <span className="num flex flex-wrap items-center gap-2 text-lg font-bold">
                    {t('monthOf', { month: s.month })}
                    {s.revision > 1 && <Chip tone="warn">{t('corrected', { n: s.revision })}</Chip>}
                    {s.kind === 'BONUS' && <Chip tone="info">{t('bonus')}</Chip>}
                    {s.isTest && <Chip>{t('practice')}</Chip>}
                  </span>
                  <span className="num text-sm text-muted">{t('payDate', { date: s.payDate })} · {t('publishedOn', { date: toKstDate(new Date(s.publishedAt)) })}</span>
                </span>
                <span className="num flex flex-col items-end">
                  <span className="text-xs text-muted">{t('net')}</span>
                  <span className="text-lg font-bold">{won(s.net)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-faint">{t('note')}</p>
    </PageShell>
  );
}
