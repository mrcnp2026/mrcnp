// 내 명세서 한 장 — 지급 · 공제 항목과 계산 방법(시간 × 단가 × 계수), 실지급액 (PRD v1.3 E01). 본인 것 · 공개 중인 것만.
// 내 것이 아니거나 공개가 회수됐으면 「없는 화면」으로 보인다(있는지 없는지도 알려 주지 않는다). 사업주 부담 항목은 보이지 않는다.
import { CountUp } from '@/components/CountUp';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { companyName } from '@/lib/company'; // 통합설정 › 회사 기본설정의 회사명 (2026-10-18)
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadMySlip } from '@/lib/payroll/publish-data';
import { asSlipTime } from '@/lib/payroll/slip-pdf-response';
import { createAdminClient } from '@/lib/supabase/admin';
import { PrintButton } from '@/app/admin/payroll/runs/RunForms';

export default async function MyPayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, f, { id }] = await Promise.all([getTranslations('payslip'), getFormatter(), params]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const found = await loadMySlip(me.id, id, OFFICE.practiceMode);
  if (!found) notFound();
  const { slip, lines, previous, replacedBy } = found;
  const tm = asSlipTime(found.time); // 근로 내역 — 계산 명세서(정기)만, 올린 명세서 · 상여에는 없다
  const [{ data: mine }, groups] = await Promise.all([createAdminClient().from('profiles').select('group_id').eq('id', me.id).maybeSingle(), loadOrgGroups()]);
  const won = (v: number) => t('won', { n: f.number(v) });
  const num = (v: string | null) => (v === null ? null : f.number(Number(v), { maximumFractionDigits: 4 }));
  const name = (code: string, fallback: string) => (t.has(`line.${code}`) ? t(`line.${code}`) : fallback);
  // 계산 방법: 시간 수당은 「시간 × 시간당 금액 × 계수」, 요율 공제는 「기준 금액 × 요율」
  const how = (l: (typeof lines)[number]) => {
    if (l.quantity === null) return null;
    if (l.unitPrice !== null) return l.factor !== null ? t('howHours', { h: num(l.quantity) ?? '', rate: num(l.unitPrice) ?? '', factor: l.factor }) : t('howHoursPlain', { h: num(l.quantity) ?? '', rate: num(l.unitPrice) ?? '' });
    return l.factor !== null ? t('howRate', { base: num(l.quantity) ?? '', rate: l.factor }) : null;
  };
  const part = (kind: 'PAYMENT' | 'DEDUCTION') => lines.filter((l) => l.kind === kind);
  const hrs = (m: number) => t('hours', { h: f.number(Math.round((m / 60) * 100) / 100) });

  return (
    <PageShell>
      <Link href="/punch/payslips" data-noprint className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('title')}
      </Link>
      <div>
        <h1 className="num flex flex-wrap items-center gap-2 text-2xl font-bold">
          {t('monthOf', { month: slip.month })}
          {slip.revision > 1 && <Chip tone="warn">{t('corrected', { n: slip.revision })}</Chip>}
          {slip.kind === 'BONUS' && <Chip tone="info">{t('bonus')}</Chip>}
          {slip.isTest && <Chip>{t('practice')}</Chip>}
        </h1>
        <dl className="num grid gap-x-6 gap-y-1 pt-2 text-sm md:grid-cols-2">
          {([['hCompany', await companyName()], ['hNo', slip.no], ['hName', `${me.name} (${me.employeeNo ?? ''})`], ['hGroup', groupPath(groups, mine?.group_id) ?? ''], ['hPeriod', `${slip.periodFrom} ~ ${slip.periodTo}`], ['hPayDate', slip.payDate]] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{t(k)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div data-noprint className="flex flex-wrap gap-2">
        <a href={`/api/payslips/${slip.id}/pdf`} className="inline-flex h-9 items-center gap-1.5 rounded-button bg-primary px-3.5 text-sm font-semibold text-on-primary">
          <Download aria-hidden size={16} />
          {t('pdf')}
        </a>
        <PrintButton label={t('print')} />
      </div>
      {replacedBy && (
        <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
          {t('oldVersion')}{' '}
          <Link href={`/punch/payslips/${replacedBy.id}`} className="font-bold underline">
            {t('toCurrent')}
          </Link>
        </p>
      )}
      {slip.revision > 1 && slip.current && (
        <p className="rounded-card border border-border bg-surface p-3 text-sm">
          {t('correctedNote', { reason: slip.correctionReason ?? '' })}{' '}
          {previous && (
            <Link href={`/punch/payslips/${previous.id}`} className="font-bold text-primary hover:underline">
              {t('toPrevious')}
            </Link>
          )}
        </p>
      )}
      <Card className="flex items-center justify-between gap-3">
        <span className="font-bold">{t('net')}</span>
        <CountUp value={won(slip.net)} className="num text-2xl font-extrabold" />
      </Card>
      {tm && (
        <Card>
          <CardTitle>{t('workTitle')}</CardTitle>
          <dl className="num grid grid-cols-2 gap-x-6 gap-y-1 pt-2 text-sm md:grid-cols-3">
            {([
              ['workDays', tm.workDays === undefined ? '—' : t('days', { n: tm.workDays })],
              ['workTotal', hrs(tm.workedMinutes)],
              ['workRegular', hrs(Math.max(0, tm.workedMinutes - tm.overtimeMinutes - tm.holidayMinutes))],
              ['workOvertime', hrs(tm.overtimeMinutes)],
              ['workNight', hrs(tm.nightMinutes)],
              ['workHoliday', hrs(tm.holidayMinutes)],
              ...(tm.paidLeaveMinutes ? [['workPaidLeave', hrs(tm.paidLeaveMinutes)] as const] : []),
              ...(tm.weeklyRestMinutes ? [['workWeeklyRest', hrs(tm.weeklyRestMinutes)] as const] : []),
              ...(tm.paidHolidayMinutes ? [['workPaidHoliday', hrs(tm.paidHolidayMinutes)] as const] : []),
            ] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{t(k)}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      {(['PAYMENT', 'DEDUCTION'] as const).map((kind) => (
        <Card key={kind}>
          <CardTitle aside={<span className="num font-bold">{won(kind === 'PAYMENT' ? slip.pay : slip.deduction)}</span>}>{t(kind === 'PAYMENT' ? 'pay' : 'deduction')}</CardTitle>
          <ul className="flex flex-col divide-y divide-border pt-2">
            {part(kind).map((l, i) => (
              <li key={`${l.code}${i}`} className="flex items-start justify-between gap-3 py-2">
                <span className="flex flex-col">
                  <span>{name(l.code, l.label)}</span>
                  {how(l) && <span className="num text-xs text-muted">{how(l)}</span>}
                </span>
                <span className="num font-bold whitespace-nowrap">{won(l.amount)}</span>
              </li>
            ))}
            {part(kind).length === 0 && <li className="py-2 text-sm text-faint">{t('none')}</li>}
          </ul>
          {/* 지급 가운데 세금을 매긴 몫과 비과세 몫 (2026-10-22 의뢰인 ②) */}
          {kind === 'PAYMENT' && found.tax && (
            <dl className="num mt-1 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
              <div className="flex flex-col rounded-button bg-surface px-3 py-2"><dt className="text-xs text-muted">{t('taxableTotal')}</dt><dd className="font-bold">{won(found.tax.taxable)}</dd></div>
              <div className="flex flex-col rounded-button bg-primary-tint px-3 py-2"><dt className="text-xs text-primary">{t('exemptTotal')}</dt><dd className="font-bold text-primary">{won(found.tax.exempt)}</dd></div>
            </dl>
          )}
        </Card>
      ))}
      <p className="text-xs text-faint">{t('detailNote')}</p>
    </PageShell>
  );
}
