// 휴가 발생 규칙 — 칸 격자 (2026-10-22 의뢰인, 다우오피스 통합설정 「근속연수별 연차설정」처럼 · 결정 사항 개발-52).
// 고정 글자 대신 운영 중인 연차 정책 판(leave_policy_versions)에서 읽는다: 지금 적용 중인 판 · 앞으로 바뀌는 판 · 근속 연수별 일수.
// 값을 바꾸는 곳은 휴가 원장 › 정책 고치기다(여기는 보기만).
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, CardTitle, Chip, Explain, em } from '@/components/ui';
import { annualDays, DAY_MINUTES, type LeavePolicy } from '@/lib/leave-ledger';
import { loadDefaultPolicies, type PolicyRow } from '@/lib/leave-ledger-data';

/** 근속 1년부터 최대 일수에 처음 닿는 해까지 — 그 뒤는 「n년 이상」 한 칸 */
function cells(p: LeavePolicy): { years: number; days: number; plus: boolean }[] {
  const out: { years: number; days: number; plus: boolean }[] = [];
  for (let n = 1; n <= 60; n++) {
    const d = annualDays(p, n);
    if (d >= p.maxDays) {
      out.push({ years: n, days: d, plus: true });
      break;
    }
    out.push({ years: n, days: d, plus: false });
  }
  return out;
}

export async function AccrualGrid({ today }: { today: string }) {
  const [t, tl] = await Promise.all([getTranslations('admin.manage.accrualRule'), getTranslations('admin.leaveLedger')]);
  const rows = await loadDefaultPolicies();
  const now = rows.find((r) => today >= r.validFrom && (r.validTo === null || r.validTo > today)) ?? null;
  const next = rows.filter((r) => r.validFrom > today).sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0] ?? null;
  const shown = next ?? now; // 칸 격자는 앞으로 쓸 판 기준(일수 규칙은 판이 바뀌어도 대개 같다)
  const basisLine = (r: PolicyRow) => (r.policy.basis === 'hire_date' ? tl('basisHire') : tl('basisFiscal', { start: r.policy.fiscalStart }));
  const rounding = (p: LeavePolicy) => tl(p.rounding === 'ceil_day' ? 'optCeilDay' : p.rounding === 'ceil_half' ? 'optCeilHalf' : 'optNone');
  return (
    <>
      <Explain link={{ href: '/admin/leave/ledger', label: t('toLedger') }}>{t.rich('explain', { em })}</Explain>
      <Card>
        <CardTitle aside={now && <Chip tone={now.verification === 'VERIFIED' ? 'ok' : 'warn'}>{t(now.verification === 'VERIFIED' ? 'verified' : 'temporary')}</Chip>}>{t('basisTitle')}</CardTitle>
        {!now ? (
          <p className="pt-3 text-sm text-faint">{t('none')}</p>
        ) : (
          <dl className="mt-3 flex flex-col divide-y divide-border text-sm">
            {[now, ...(next ? [next] : [])].map((r) => (
              <div key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 lg:flex-row lg:gap-6">
                <dt className="num shrink-0 font-bold lg:w-56">
                  {r === now ? t('now') : t('from', { date: r.validFrom })}
                  <span className="ml-2 text-xs font-normal text-faint">{t('version', { n: r.version })}</span>
                </dt>
                <dd className="flex min-w-0 flex-col gap-1 text-muted">
                  <span className="text-text">{basisLine(r)}</span>
                  {r.policy.basis === 'hire_date' && r.policy.convertedOn && <span>{tl('ruleConverted', { date: r.policy.convertedOn })}</span>}
                  {r.policy.basis === 'fiscal_year' && <span>{t('roundingOf', { how: rounding(r.policy) })}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
      {shown && (
        <Card>
          <CardTitle>{t('gridTitle')}</CardTitle>
          <div className="mt-3 flex flex-col gap-3">
            <p className="rounded-button bg-surface px-4 py-3 text-sm">
              <b>{t('under1')}</b> <span className="text-muted">{t('under1Rule', { max: shown.policy.monthlyMax })}</span>
            </p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {cells(shown.policy).map((c) => (
                <li key={c.years} className={`flex flex-col items-center gap-0.5 rounded-button border px-2 py-3 ${c.plus ? 'border-primary/40 bg-primary-tint' : 'border-border bg-bg'}`}>
                  <span className="num text-xs text-faint">{c.plus ? t('yearsPlus', { n: c.years }) : t('years', { n: c.years })}</span>
                  <span className="num text-lg font-bold">{t('days', { n: c.days })}</span>
                </li>
              ))}
            </ul>
            <ul className="flex flex-col gap-1 text-sm text-muted">
              <li>{tl('ruleDay', { hours: shown.policy.dayMinutes / 60 || DAY_MINUTES / 60 })}</li>
              <li>{shown.policy.carryMaxDays > 0 ? tl('ruleCarry', { max: shown.policy.carryMaxDays, months: shown.policy.carryValidMonths }) : tl('ruleCarryNone')}</li>
              <li>{shown.policy.advanceMaxDays > 0 ? tl('ruleAdvance', { max: shown.policy.advanceMaxDays }) : tl('ruleAdvanceNone')}</li>
            </ul>
            <p className="text-xs text-faint">{t('caution')}</p>
          </div>
        </Card>
      )}
      <p className="text-sm text-faint">
        {t('editWhere')}{' '}
        <Link href="/admin/leave/ledger" className="font-bold text-primary">
          {t('toLedger')} ›
        </Link>
      </p>
    </>
  );
}
