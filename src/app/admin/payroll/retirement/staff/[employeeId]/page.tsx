// 퇴직급여 › 직원 한 명의 예상 퇴직금 (2026-10-25 의뢰인: 직원이 스스로 보지 않고, 관리자가 직원 목록에서 눌러 본다).
// 「오늘 그만둔다면」의 참고값 — 저장하지 않고 열 때마다 다시 계산한다. 근거(입사일 · 3개월 임금의 출처 · 평균임금)와 부족한 자료를 그대로 보여 준다.
// 실제로 정산하려면 아래 버튼으로 기록을 만든다(작성 중 → 확정). 급여 담당 관리자만.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HelpTip } from '@/components/Help';
import { WarnLine } from '@/components/listframe';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadCases } from '@/lib/payroll/retirement-data';
import { estimateOf } from '@/lib/payroll/retirement-roster';
import { toKstDate } from '@/lib/time';

export default async function StaffRetirementPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const [t, f, me, { employeeId }] = await Promise.all([getTranslations('admin.retirement'), getFormatter(), getMe(), params]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId)) notFound();
  const practice = OFFICE.practiceMode;
  const today = toKstDate(new Date());
  const e = await estimateOf(employeeId, today, practice);
  if (!e) notFound();
  const cases = (await loadCases({ practice, testViewer: !!me.employeeNo?.startsWith('e2e-') })).filter((k) => k.employeeId === employeeId);
  const r = e.result;
  const won = (v: number | string) => t('won', { n: f.number(Number(v), { maximumFractionDigits: 0 }) });
  const rows: [string, string][] = [
    ['asOf', today],
    ['joined', e.periodFrom ?? t('blank')],
    ['service', r.serviceDays === null ? t('blank') : t('daysValue', { n: f.number(r.serviceDays) })],
    ['wage', e.input.wage3m === null ? t('blank') : `${won(e.input.wage3m)}${e.basis === 'actual' ? ` (${e.months.join(', ')})` : ''}`],
    ['days3m', e.input.days3m === null ? t('blank') : t('daysValue', { n: e.input.days3m })],
    ['bonus', won(e.input.bonus1y)],
    ['average', r.averageDaily === null ? t('blank') : won(r.averageDaily)],
  ];
  const makeHref = (kind: 'FINAL' | 'INTERIM') => `/admin/payroll/retirement?emp=${employeeId}&kind=${kind}&to=${today}#new`;
  return (
    <PageShell>
      <Link href="/admin/payroll/retirement" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">‹ {t('title')}</Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-2 text-2xl font-bold">
          {t('staffTitle', { name: e.name })}
          <Chip tone="warn">{t('estimateChip')}</Chip>
          {!e.active && <Chip>{t('inactive')}</Chip>}
          <HelpTip>{t('staffIntro')}</HelpTip>
        </h1>
        <p className="num pt-1 text-sm text-faint">{e.employeeNo}</p>
      </div>
      <Card className="flex items-center justify-between gap-3">
        <span className="font-bold">{t('estAmount')}</span>
        <span className="num text-2xl font-extrabold" data-estimate>{r.amount === null ? t('cannot') : won(r.amount)}</span>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={e.basis === 'actual' ? 'ok' : e.basis === 'contract' ? 'warn' : 'neutral'}>{t(`basis.${e.basis}`)}</Chip>
        <span className="text-sm text-muted">{t(`basisNote.${e.basis}`)}</span>
      </div>
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
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="flex flex-col gap-2">
        <CardTitle>{t('makeTitle')}</CardTitle>
        <p className="text-sm text-muted">{t('makeSub')}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={makeHref('FINAL')} className="inline-flex min-h-11 items-center rounded-button bg-primary px-4 text-sm font-bold text-on-primary lg:min-h-9">{t('makeFinal')}</Link>
          <Link href={makeHref('INTERIM')} className="inline-flex min-h-11 items-center rounded-button border border-border bg-bg px-4 text-sm font-bold text-primary lg:min-h-9">{t('makeInterim')}</Link>
        </div>
      </Card>
      {cases.length > 0 && (
        <Card>
          <CardTitle>{t('staffCases')}</CardTitle>
          <ul className="flex flex-col divide-y divide-border pt-2">
            {cases.map((k) => (
              <li key={k.id}>
                <Link href={`/admin/payroll/retirement/${k.id}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm hover:bg-surface">
                  <span className="font-bold">{t(`kind.${k.kind}`)}</span>
                  <span className="num text-muted">{k.periodFrom} ~ {k.periodTo}</span>
                  <Chip tone={k.state === 'FINALIZED' ? 'ok' : 'neutral'}>{t(`state.${k.state}`)}</Chip>
                  <span className="num ml-auto font-bold">{k.amount === null ? t('noAmountShort') : won(k.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <WarnLine short={t('legalShort')}>{t('legal')}</WarnLine>
    </PageShell>
  );
}
