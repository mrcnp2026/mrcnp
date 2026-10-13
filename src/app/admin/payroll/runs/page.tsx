// 급여대장 목록 — 달마다 정규 대장을 만들고 상태(초안 → 계산됨 → 검토됨 → 확정)를 본다 (PRD v1.3 18.3 W04). 급여 담당 관리자만.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadRuns } from '@/lib/payroll/run-data';
import { toKstDate } from '@/lib/time';
import { RunCreate } from './RunForms';

const TONE = { DRAFT: 'neutral', CALCULATED: 'info', REVIEWED: 'warn', FINALIZED: 'ok' } as const;

export default async function PayRunsPage({ searchParams }: { searchParams: Promise<{ live?: string }> }) {
  const [t, f, me, sp] = await Promise.all([getTranslations('admin.payRuns'), getFormatter(), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const runs = await loadRuns(practice);
  const today = toKstDate(new Date());
  // 만들 수 있는 달: 이번 달부터 거꾸로 12달 가운데 아직 대장이 없는 달
  const have = new Set(runs.filter((r) => r.kind === 'REGULAR').map((r) => r.periodFrom.slice(0, 7)));
  const months = [...Array(12)].map((_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1)).toISOString().slice(0, 7)).filter((m) => !have.has(m));
  const won = (v: unknown) => t('won', { n: f.number(Number(v ?? 0)) });

  return (
    <PageShell wide>
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="pt-1 text-sm text-faint">{t('intro')}</p>
      </div>
      {practice && <p className="rounded-card border border-border bg-surface p-3 text-sm text-muted">{t('practice')}</p>}
      <Card>
        <CardTitle>{t('createTitle')}</CardTitle>
        <p className="pt-1 pb-3 text-sm text-faint">{t('createIntro')}</p>
        {months.length > 0 ? <RunCreate months={months} live={sp.live === '1'} /> : <p className="text-sm text-faint">{t('createNone')}</p>}
      </Card>
      <div className="overflow-x-auto border border-border bg-bg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {['colMonth', 'colPayDate', 'colStatus', 'colMembers', 'colPay', 'colDeduction', 'colNet', 'colEmployer'].map((k) => (
                <th key={k} scope="col" className="px-3 py-2 whitespace-nowrap">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="num px-3 py-3 whitespace-nowrap">
                  <Link href={`/admin/payroll/runs/${r.id}`} className="font-bold text-primary underline">
                    {r.periodFrom.slice(0, 7)}
                  </Link>
                  {r.revision > 1 && <span className="ml-2 text-xs text-faint">{t('revision', { n: r.revision })}</span>}
                  {runs.some((x) => x.kind === r.kind && x.periodFrom === r.periodFrom && x.sequence === r.sequence && x.revision > r.revision) && <span className="ml-2 text-xs text-faint">{t('older')}</span>}
                </td>
                <td className="num px-3 py-3 whitespace-nowrap">{r.payDate}</td>
                <td className="px-3 py-3">
                  <Chip tone={TONE[r.status]}>{t(`status.${r.status}`)}</Chip>
                </td>
                <td className="num px-3 py-3">{r.generationId ? t('membersValue', { ok: Number(r.totals.ok ?? 0), blocked: Number(r.totals.blocked ?? 0) }) : ''}</td>
                <td className="num px-3 py-3 whitespace-nowrap">{r.generationId ? won(r.totals.pay) : ''}</td>
                <td className="num px-3 py-3 whitespace-nowrap">{r.generationId ? won(r.totals.deduction) : ''}</td>
                <td className="num px-3 py-3 font-bold whitespace-nowrap">{r.generationId ? won(r.totals.net) : ''}</td>
                <td className="num px-3 py-3 whitespace-nowrap">{r.generationId ? won(r.totals.employer) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <p className="p-4 text-sm text-faint">{t('empty')}</p>}
      </div>
    </PageShell>
  );
}
