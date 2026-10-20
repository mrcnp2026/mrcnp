// 퇴직급여 한 건 — 넣은 값 · 검산 · 세액 · 확정/거두기 (PRD v1.3 18.6 W08). 급여 담당 관리자만.
// 초안은 고칠 수 있고, 확정본은 그대로 남는다(잘못됐으면 사유를 적어 거두고 새 판을 만든다).
import { getFormatter, getTranslations } from 'next-intl/server';
import { WarnLine } from '@/components/listframe';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadCase } from '@/lib/payroll/retirement-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { CaseActions, CaseForm } from '../RetirementForms';

export default async function RetirementCasePage({ params }: { params: Promise<{ id: string }> }) {
  const [t, f, me, { id }] = await Promise.all([getTranslations('admin.retirement'), getFormatter(), getMe(), params]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const k = await loadCase(id);
  if (!k) notFound();
  const { data: p } = await createAdminClient().from('profiles').select('name, employee_no').eq('id', k.employeeId).maybeSingle();
  // 검사 계정의 건은 검사 계정에게만, 실제 직원의 건은 실제 관리자에게만
  if (!p || !!(p.employee_no as string | null)?.startsWith('e2e-') !== !!me.employeeNo?.startsWith('e2e-')) notFound();
  // 퇴직연금 가입자면 화면 위에 알린다 (2026-10-20 노프로 비교) — DC 가입 기간은 매달 부담금으로 이미 적립된다
  const { data: plan } = await createAdminClient().from('payroll_pension_members').select('plan_kind, joined_on').eq('employee_id', k.employeeId).eq('is_test', k.isTest).order('joined_on', { ascending: false }).limit(1).maybeSingle();
  const { data: paid } = plan?.plan_kind === 'DC' ? await createAdminClient().from('payroll_pension_contributions').select('amount, paid_on').eq('employee_id', k.employeeId).eq('is_test', k.isTest) : { data: null };
  const paidSum = (paid ?? []).reduce((a, c) => a + (c.paid_on ? Number(c.amount) : 0), 0);
  const unpaidSum = (paid ?? []).reduce((a, c) => a + (c.paid_on ? 0 : Number(c.amount)), 0);
  const won = (v: number | string | null) => (v === null ? t('blank') : t('won', { n: f.number(Number(v), { maximumFractionDigits: 2 }) }));
  const r = k.result, i = k.input;
  const ready = k.amount !== null && r.missing.length === 0;
  const rows: [string, string][] = [
    ['f.periodFrom', k.periodFrom], ['f.periodTo', k.periodTo], ['f.excludedDays', t('daysValue', { n: f.number(i.excludedDays) })], ['cService', r.serviceDays === null ? t('blank') : t('daysValue', { n: f.number(r.serviceDays) })],
    ['f.wage3m', won(i.wage3m)], ['f.days3m', i.days3m === null ? t('blank') : t('daysValue', { n: i.days3m })], ['f.bonus1y', won(i.bonus1y)], ['f.leavePay1y', won(i.leavePay1y)],
    ['cAverage', won(r.averageDaily)], ['f.ordinaryDaily', won(i.ordinaryDaily)], ['cUsed', r.dailyUsed === null ? t('blank') : `${won(r.dailyUsed)} (${t(r.usedOrdinary ? 'usedOrdinary' : 'usedAverage')})`], ['cAmount', k.amount === null ? t('noAmount') : won(k.amount)],
    ...(i.departureInsurance != null ? ([['f.departureInsurance', won(i.departureInsurance)], ['cCompanyPays', r.companyPays == null ? t('noAmount') : won(r.companyPays)]] as [string, string][]) : []),
    ['f.taxAmount', k.taxAmount === null ? t('blank') : won(k.taxAmount)], ['f.taxBasis', k.taxBasis ?? t('blank')],
  ];

  return (
    <PageShell wide>
      <Link href="/admin/payroll/retirement" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('title')}
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {p.name as string} · {t(`kind.${k.kind}`)}
          <Chip tone={k.state === 'FINALIZED' ? 'ok' : 'neutral'}>{t(`state.${k.state}`)}</Chip>
          {k.revision > 1 && <Chip tone="warn">{t('rev', { n: k.revision })}</Chip>}
          {k.isTest && <Chip>{t('practice')}</Chip>}
        </h1>
        <p className="num pt-1 text-sm text-faint">
          {p.employee_no as string} · {t('madeOn', { date: toKstDate(new Date(k.createdAt)) })}
          {k.finalizedAt && ` · ${t('finalizedOn', { date: toKstDate(new Date(k.finalizedAt)) })}`}
        </p>
      </div>
      <WarnLine short={t('legalShort')}>{t('legal')}</WarnLine>
      {plan && (
        <p className="rounded-card bg-primary-tint p-3 text-sm" data-pension>
          {t(plan.plan_kind === 'DC' ? 'pensionDc' : 'pensionDb', { from: plan.joined_on as string })}
          {plan.plan_kind === 'DC' && ` ${t('pensionPaid', { paid: f.number(paidSum), unpaid: f.number(unpaidSum) })}`}{' '}
          <Link href="/admin/payroll/pension" className="font-bold text-primary hover:underline">{t('pensionLink')}</Link>
        </p>
      )}
      {k.state === 'WITHDRAWN' && <p className="rounded-card border border-border bg-surface p-3 text-sm">{t('withdrawnNote', { reason: k.reason ?? '' })}</p>}
      {k.supersedesId && (
        <p className="text-sm">
          <Link href={`/admin/payroll/retirement/${k.supersedesId}`} className="font-bold text-primary hover:underline">{t('toPrevious')}</Link>
        </p>
      )}
      {k.state === 'DRAFT' ? (
        <Card className="flex flex-col gap-3">
          <CardTitle>{t('editTitle')}</CardTitle>
          <CaseForm mode="update" id={k.id} initial={i} tax={{ amount: k.taxAmount, basis: k.taxBasis }} />
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <CardTitle>{t('checkTitle')}</CardTitle>
          <dl className="num grid gap-x-8 gap-y-1 text-sm md:grid-cols-2" data-check>
            {rows.map(([key, v]) => (
              <div key={key} className="flex justify-between gap-3 border-b border-border py-1">
                <dt className="text-muted">{t(key)}</dt>
                <dd className={key === 'cAmount' ? 'font-extrabold' : ''}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-faint">{t('formula')}</p>
        </Card>
      )}
      {k.state === 'DRAFT' && <p className="text-xs text-faint">{t('formula')}</p>}
      <CaseActions id={k.id} state={k.state} kind={k.kind} ready={ready} />
    </PageShell>
  );
}
