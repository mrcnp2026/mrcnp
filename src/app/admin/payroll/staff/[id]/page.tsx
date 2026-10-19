// 사원별 급여 상세 — 계약 · 세무/보험 · 개인 지급/공제 항목과 그 이력 (PRD v1.3 18.1), 달별 지급 이력. 최고관리자(관리자 전원)만.
// 계약 · 세무는 고치면 새 판이 쌓인다. 주민번호 · 계좌번호는 이 화면에 없다(암호화 저장 영역이 생긴 뒤).
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { INSURERS, referenceHourly, setupGaps, versionAt } from '@/lib/payroll/contract';
import { loadItems, reliefSwitches } from '@/lib/payroll/data';
import { exemptYtdForYear, loadPayHistory, previewPay } from '@/lib/payroll/run-data';
import { OFFICE } from '@/config/office';
import { loadStaffPay } from '@/lib/payroll/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { ContractForm, ItemForms, TaxForm } from './StaffPayForms';

export default async function StaffPayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, f, me, { id }] = await Promise.all([getTranslations('admin.staffPay'), getFormatter(), getMe(), params]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const db = createAdminClient();
  const [{ data: p }, pay, groups, items, { data: staff }, reliefOn] = await Promise.all([
    db.from('profiles').select('id, name, employee_no, group_id, joined_on, active').eq('id', id).maybeSingle(),
    loadStaffPay(id),
    loadOrgGroups(),
    loadItems(),
    db.from('profiles').select('id, name'),
    reliefSwitches(toKstDate(new Date())),
  ]);
  if (!p) notFound();
  const today = toKstDate(new Date());
  const contract = versionAt(pay.contracts, today);
  const tax = versionAt(pay.taxes, today);
  const gaps = setupGaps({ contract, tax, joinedOn: p.joined_on as string | null });
  const nameOf = new Map((staff ?? []).map((x) => [x.id as string, x.name as string]));
  const won = (v: number) => t('won', { n: f.number(v) });
  const day = (iso: string) => toKstDate(new Date(iso));
  const usable = items.filter((x) => x.inUse && (x.validTo === null || x.validTo > today));
  const itemName = (code: string) => items.find((x) => x.code === code)?.koName ?? code;
  const hourly = contract ? referenceHourly(contract) : null;
  // 예상 지급 · 공제 — 계약만으로 한 달 치를 계산해 본 값. 대장을 만들지 않는다
  const [preview, tr, history, ytd] = await Promise.all([previewPay(id, today), getTranslations('admin.payRuns'), loadPayHistory(id, OFFICE.practiceMode), exemptYtdForYear(id, today.slice(0, 4), OFFICE.practiceMode)]);
  // 올해 비과세 누적 (2026-10-19): 비과세 · 일부 비과세 항목과 올해 확정한 급여에서 이미 비과세로 뺀 합계 · 연간 한도 · 남은 한도
  const exemptItems = items.filter((x) => x.kind === 'PAYMENT' && (x.taxTreatment === 'EXEMPT' || x.taxTreatment === 'PARTIAL') && (x.inUse || ytd[x.code]));
  const exemptRows = [...exemptItems.map((x) => ({ code: x.code, name: x.koName, used: ytd[x.code] ?? 0, monthly: x.taxExemptLimit, annual: x.taxExemptAnnualLimit ?? null })), ...Object.keys(ytd).filter((c) => !exemptItems.some((x) => x.code === c)).map((c) => ({ code: c, name: itemName(c), used: ytd[c], monthly: null, annual: null }))];
  const dk = (d: string) => d.replace(/[.-]/g, '_');
  const whyNot = (b: { code: string; detail?: string }) => (tr.has(`blocker.${b.code}`) ? tr(`blocker.${b.code}`, { detail: b.detail ? (tr.has(`detail.${dk(b.detail)}`) ? tr(`detail.${dk(b.detail)}`) : b.detail) : '' }) : b.code);
  const lineName = (code: string, fallback: string) => (tr.has(`line.${code}`) ? tr(`line.${code}`) : (items.find((x) => x.code === code)?.koName ?? fallback));

  return (
    <PageShell wide>
      <Link href="/admin/payroll/staff" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('back')}
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {p.name}
          {gaps.length === 0 ? <Chip tone="ok">{t('stateReady')}</Chip> : <Chip tone="warn">{t('stateGap', { n: gaps.length })}</Chip>}
        </h1>
        <p className="num pt-1 text-sm text-faint">{[p.employee_no, groupPath(groups, p.group_id), p.joined_on ? t('joined', { date: p.joined_on }) : t('gap.no_joined_on')].filter(Boolean).join(' · ')}</p>
        {gaps.length > 0 && (
          <ul className="pt-2 text-sm text-warn">
            {gaps.map((g) => (
              <li key={g}>{t(`gap.${g}`)}</li>
            ))}
          </ul>
        )}
      </div>

      <Card>
        <CardTitle>{t('contractTitle')}</CardTitle>
        {contract ? (
          <dl className="num grid gap-x-6 gap-y-1 pt-3 text-sm md:grid-cols-2">
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('colType')}</dt><dd className="font-bold">{t(`payType.${contract.payType}`)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('colAmount')}</dt><dd className="font-bold">{won(contract.amount)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('fTimeBasis')}</dt><dd>{t(`timeBasis.${contract.timeBasis}`)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('colHours')}</dt><dd>{contract.monthlyHours ?? t('notSet')}</dd></div>
            {contract.payType === 'ANNUAL' && <div className="flex justify-between gap-3"><dt className="text-muted">{t('fDivisor')}</dt><dd>{contract.annualDivisor ?? t('notSet')}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('colHourly')}</dt><dd>{hourly === null ? t('notSet') : won(hourly)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('fIncluded')}</dt><dd>{t('includedValue', { ot: contract.included.overtimeHours ?? 0, hol: contract.included.holidayHours ?? 0 })}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('colFrom')}</dt><dd>{t('versionFrom', { n: contract.version, from: contract.validFrom })}</dd></div>
          </dl>
        ) : (
          <p className="pt-3 text-sm text-warn">{t('gap.no_contract')}</p>
        )}
        <ContractForm employeeId={id} today={today} version={pay.contracts[0]?.version ?? 0} last={pay.contracts[0] ?? null} />
        {pay.contracts.length > 0 && (
          <ul className="num mt-4 flex flex-col gap-1 border-t border-border pt-3 text-xs text-faint">
            {pay.contracts.map((c) => (
              <li key={c.id}>{t('contractHistory', { n: c.version, from: c.validFrom, to: c.validTo ?? '', type: t(`payType.${c.payType}`), amount: won(c.amount), who: nameOf.get(c.createdBy) ?? '', at: day(c.createdAt), reason: c.reason ?? '' })}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>{t('taxTitle')}</CardTitle>
        {tax ? (
          <dl className="num grid gap-x-6 gap-y-1 pt-3 text-sm md:grid-cols-2">
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('fRatio')}</dt><dd className="font-bold">{t('pct', { n: tax.withholdingRatio })}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('fFamily')}</dt><dd>{t('familyValue', { n: tax.familyCount, c: tax.childCount })}</dd></div>
            {INSURERS.map((k) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{t(`insurer.${k}`)}</dt>
                <dd>
                  <span className={tax.insurance[k].state === 'UNKNOWN' ? 'font-bold text-warn' : ''}>{t(`tri.${tax.insurance[k].state}`)}</span>
                  {tax.insurance[k].reportedWage !== null && ` · ${won(tax.insurance[k].reportedWage!)}`}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('fLoan')}</dt><dd>{t(`tri.${tax.studentLoan.state}`)}{tax.studentLoan.monthlyAmount !== null && ` · ${won(tax.studentLoan.monthlyAmount)}`}{tax.studentLoan.from && ` · ${tax.studentLoan.to ? t('period', { from: tax.studentLoan.from, to: tax.studentLoan.to }) : t('periodOpen', { from: tax.studentLoan.from })}`}</dd></div>
            {reliefOn.sme && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('smeTitle')}</dt>
                <dd>
                  <span className={tax.reliefs.sme.state === 'UNKNOWN' ? 'font-bold text-warn' : ''}>{t(`tri.${tax.reliefs.sme.state}`)}</span>
                  {tax.reliefs.sme.state === 'YES' && ` · ${t('pct', { n: tax.reliefs.sme.rate ?? 0 })} · ${tax.reliefs.sme.to ? t('period', { from: tax.reliefs.sme.from ?? '', to: tax.reliefs.sme.to }) : t('periodOpen', { from: tax.reliefs.sme.from ?? '' })}`}
                </dd>
              </div>
            )}
            {reliefOn.durunuri && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('durunuriTitle')}</dt>
                <dd>
                  <span className={tax.reliefs.durunuri.state === 'UNKNOWN' ? 'font-bold text-warn' : ''}>{t(`tri.${tax.reliefs.durunuri.state}`)}</span>
                  {tax.reliefs.durunuri.state === 'YES' && ` · ${t('insurer.pension')} ${t('pct', { n: tax.reliefs.durunuri.pensionRate ?? 0 })} · ${t('insurer.employment')} ${t('pct', { n: tax.reliefs.durunuri.employmentRate ?? 0 })} · ${tax.reliefs.durunuri.to ? t('period', { from: tax.reliefs.durunuri.from ?? '', to: tax.reliefs.durunuri.to }) : t('periodOpen', { from: tax.reliefs.durunuri.from ?? '' })}`}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('colFrom')}</dt><dd>{t('versionFrom', { n: tax.version, from: tax.validFrom })}</dd></div>
          </dl>
        ) : (
          <p className="pt-3 text-sm text-warn">{t('gap.no_tax')}</p>
        )}
        {!reliefOn.sme && !reliefOn.durunuri && <p className="pt-2 text-xs text-faint">{t('reliefOff')}</p>}
        <TaxForm employeeId={id} today={today} version={pay.taxes[0]?.version ?? 0} last={pay.taxes[0] ?? null} reliefOn={reliefOn} />
        {pay.taxes.length > 0 && (
          <ul className="num mt-4 flex flex-col gap-1 border-t border-border pt-3 text-xs text-faint">
            {pay.taxes.map((x) => (
              <li key={x.id}>{t('taxHistory', { n: x.version, from: x.validFrom, to: x.validTo ?? '', who: nameOf.get(x.createdBy) ?? '', at: day(x.createdAt), reason: x.reason ?? '' })}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle aside={<Chip tone="info">{t('previewChip')}</Chip>}>{t('previewTitle')}</CardTitle>
        <p className="pt-1 text-sm text-faint">{t('previewIntro')}</p>
        {preview.state === 'OK' ? (
          <div className="grid gap-4 pt-3 text-sm md:grid-cols-2">
            {(['PAYMENT', 'DEDUCTION'] as const).map((kind) => (
              <dl key={kind} className="num flex flex-col gap-1">
                <dt className="font-bold">{t(kind === 'PAYMENT' ? 'kindPay' : 'kindDeduct')}</dt>
                {preview.lines.filter((l) => l.kind === kind).map((l, i) => (
                  <div key={`${l.code}${i}`} className="flex justify-between gap-3">
                    <dt className="text-muted">{lineName(l.code, l.label)}</dt>
                    <dd>{won(l.amount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t border-border pt-1 font-bold">
                  <dt>{t('previewSum')}</dt>
                  <dd>{won(kind === 'PAYMENT' ? preview.totals.pay : preview.totals.deduction)}</dd>
                </div>
              </dl>
            ))}
            <p className="num flex justify-between gap-3 rounded-button bg-surface p-3 text-base font-bold md:col-span-2">
              <span>{t('previewNet')}</span>
              <span>{won(preview.totals.net)}</span>
            </p>
            {preview.warnings.map((w, i) => (
              <p key={i} className="text-xs text-muted md:col-span-2">{whyNot(w)}</p>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-1 pt-3 text-sm text-warn">
            <li className="font-bold">{t('previewBlocked')}</li>
            {preview.blockers.map((b, i) => (
              <li key={i}>{whyNot(b)}</li>
            ))}
          </ul>
        )}
      </Card>

      {/* 지급 이력 — 확정된 대장의 달별 지급 · 공제 · 실수령. 누르면 그 달 명세 */}
      <Card>
        <CardTitle>{t('historyTitle')}</CardTitle>
        {history.length === 0 ? (
          <p className="pt-2 text-sm text-faint">{t('historyNone')}</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {history.map((h) => (
              <li key={h.runId}>
                <Link href={`/admin/payroll/runs/${h.runId}/${id}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 py-2 hover:bg-surface">
                  <span className="num font-bold">{t('historyMonth', { ym: h.periodFrom.slice(0, 7) })}</span>
                  <span className="text-xs text-muted">{[h.kind === 'BONUS' ? t('historyBonus') : null, h.title, h.revision > 0 ? t('historyRevision', { n: h.revision }) : null, t('historyPayDate', { date: h.payDate })].filter(Boolean).join(' · ')}</span>
                  <span className="num ml-auto text-right">
                    <span className="font-bold">{won(h.net)}</span>
                    <span className="block text-xs text-faint">{t('historySums', { pay: won(h.pay), deduction: won(h.deduction) })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>{t('exemptTitle', { year: today.slice(0, 4) })}</CardTitle>
        <p className="pt-1 text-sm text-faint">{t('exemptIntro')}</p>
        {exemptRows.length === 0 ? (
          <p className="pt-2 text-sm text-faint">{t('exemptNone')}</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border" data-exempt-ytd>
            {exemptRows.map((r) => {
              const left = r.annual === null ? null : Math.max(0, r.annual - r.used);
              return (
                <li key={r.code} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-xs text-muted">{[r.monthly !== null ? t('exemptMonthly', { amount: won(r.monthly) }) : null, r.annual !== null ? t('exemptAnnual', { amount: won(r.annual) }) : t('exemptNoAnnual')].filter(Boolean).join(' · ')}</span>
                  <span className="num ml-auto text-right">
                    <span className="font-bold">{t('exemptUsed', { amount: won(r.used) })}</span>
                    {left !== null && <span className={`block text-xs ${left === 0 ? 'text-warn' : 'text-faint'}`}>{left === 0 ? t('exemptFull') : t('exemptLeft', { amount: won(left) })}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>{t('itemsTitle')}</CardTitle>
        <p className="pt-1 text-sm text-faint">{t('itemsIntro')}</p>
        <ItemForms
          employeeId={id}
          today={today}
          options={usable.map((x) => ({ code: x.code, label: `${x.koName} (${t(x.kind === 'PAYMENT' ? 'kindPay' : 'kindDeduct')})`, defaultAmount: x.defaultAmount }))}
          rows={pay.items.map((x) => ({ id: x.id, name: itemName(x.itemCode), amount: x.amount === null ? null : won(x.amount), note: x.note, validFrom: x.validFrom, validTo: x.validTo }))}
        />
      </Card>
      <p className="text-xs text-faint">{t('sensitiveNote')}</p>
    </PageShell>
  );
}
