// 내 명세서 한 장 — 지급 · 공제 항목과 계산 방법(시간 × 단가 × 계수), 실지급액 (PRD v1.3 E01). 본인 것 · 공개 중인 것만.
// 내 것이 아니거나 공개가 회수됐으면 「없는 화면」으로 보인다(있는지 없는지도 알려 주지 않는다). 사업주 부담 항목은 보이지 않는다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { loadMySlip } from '@/lib/payroll/publish-data';

export default async function MyPayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, f, { id }] = await Promise.all([getTranslations('payslip'), getFormatter(), params]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await loadMySlip(me.id, id, OFFICE.practiceMode);
  if (!found) notFound();
  const { slip, lines, previous, replacedBy } = found;
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

  return (
    <PageShell>
      <Link href="/punch/payslips" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('title')}
      </Link>
      <div>
        <h1 className="num flex flex-wrap items-center gap-2 text-2xl font-bold">
          {t('monthOf', { month: slip.month })}
          {slip.revision > 1 && <Chip tone="warn">{t('corrected', { n: slip.revision })}</Chip>}
          {slip.isTest && <Chip>{t('practice')}</Chip>}
        </h1>
        <p className="num pt-1 text-sm text-faint">{me.name} · {t('payDate', { date: slip.payDate })}</p>
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
            <Link href={`/punch/payslips/${previous.id}`} className="font-bold text-primary underline">
              {t('toPrevious')}
            </Link>
          )}
        </p>
      )}
      <Card className="flex items-center justify-between gap-3">
        <span className="font-bold">{t('net')}</span>
        <span className="num text-2xl font-extrabold">{won(slip.net)}</span>
      </Card>
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
        </Card>
      ))}
      <p className="text-xs text-faint">{t('detailNote')}</p>
    </PageShell>
  );
}
