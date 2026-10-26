// 사원별 급여 상세 — 맨 위 요약(급여 · 통상시급 · 예상 실수령 · 상태) + 탭(계약 · 세무/보험 · 고정 수당/공제 · 지급 이력) (PRD v1.3 18.1, 2026-10-25 의뢰인: 한 화면이 너무 길다).
// 계약 · 세무/보험 · 고정 수당/공제 탭에는 예상 지급 · 공제를 같이 보여 준다 — 고치고 바로 결과를 본다. 최고관리자(관리자 전원)만.
// 계약 · 세무는 고치면 새 판이 쌓인다. 주민번호 · 계좌번호는 이 화면에 없다(암호화 저장 영역이 생긴 뒤).
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { INSURERS, referenceHourly, setupGaps, versionAt } from '@/lib/payroll/contract';
import { commonAppliesTo } from '@/lib/payroll/common-items';
import { loadCommonItems, ledgerAt, loadItems, loadTaxDefaults, reliefSwitches } from '@/lib/payroll/data';
import { exemptYtdForYear, loadPayHistory, previewPay } from '@/lib/payroll/run-data';
import { OFFICE } from '@/config/office';
import { AUTO_PAYMENT_CODES } from '@/lib/payroll/engine/reserved-items';
import { loadStaffPay } from '@/lib/payroll/staff-data';
import { loadForeignInfo } from '@/lib/staff-details';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { CancelVersionButton, ContractForm, ItemForms, NewItemCreate, TaxForm } from './StaffPayForms';

const TABS = ['contract', 'tax', 'items', 'history'] as const;
type Tab = (typeof TABS)[number];

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-card border border-border bg-bg px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      <b className={`num truncate text-lg ${tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : ''}`}>{value}</b>
      {sub && <span className="truncate text-xs text-faint">{sub}</span>}
    </div>
  );
}

export default async function StaffPayDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [t, tp, f, me, { id }, sp] = await Promise.all([getTranslations('admin.staffPay'), getTranslations('admin.paySettings'), getFormatter(), getMe(), params, searchParams]);
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'contract';
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
  const foreign = await loadForeignInfo(id); // 외국인 직원이면 세무에 단일세율 19% 칸을 보인다 (묶음 31)
  const today = toKstDate(new Date());
  const contract = versionAt(pay.contracts, today);
  const tax = versionAt(pay.taxes, today);
  const taxDefaults = (await loadTaxDefaults(today))?.defaults ?? null; // 4대보험 회사 기본값
  // 보험마다 「신고 보수」를 기준으로 쓰는가 — 아니면 입력한 신고 보수는 계산에 쓰이지 않는다(말없이 무시되지 않게 화면에서 알린다)
  const ledger = await ledgerAt(today);
  const reportedUsed = Object.fromEntries(INSURERS.map((k) => [k, (k === 'accident' ? ledger?.insuranceBasis : (ledger?.insuranceBasisOf?.[k] ?? ledger?.insuranceBasis)) === 'REPORTED_BASE'])) as Record<(typeof INSURERS)[number], boolean>;
  const gaps = setupGaps({ contract, tax, joinedOn: p.joined_on as string | null, taxDefaults: !!taxDefaults });
  const nameOf = new Map((staff ?? []).map((x) => [x.id as string, x.name as string]));
  const won = (v: number) => t('won', { n: f.number(v) });
  const day = (iso: string) => toKstDate(new Date(iso));
  // 개인 항목에는 사람이 정하는 것(식대 · 상여 · 학자금 등)만 — 기본급 · 연장 · 야간 · 휴일 · 보험 · 세금은 계약 · 근태 · 세무 설정에서 자동으로 계산된다 (2026-10-25 의뢰인)
  const usable = items.filter((x) => x.inUse && (x.validTo === null || x.validTo > today) && !AUTO_PAYMENT_CODES.has(x.code) && x.calcKind !== 'TIME' && x.calcKind !== 'RULE');
  const itemName = (code: string) => items.find((x) => x.code === code)?.koName ?? code;
  const hourly = contract ? referenceHourly(contract) : null;
  // 예상 지급 · 공제 — 계약만으로 한 달 치를 계산해 본 값. 대장을 만들지 않는다
  const common = await loadCommonItems(today); // 회사 공통 고정 수당 · 공제
  const [preview, tr, history, ytd] = await Promise.all([previewPay(id, today), getTranslations('admin.payRuns'), loadPayHistory(id, OFFICE.practiceMode), exemptYtdForYear(id, today.slice(0, 4), OFFICE.practiceMode)]);
  // 올해 비과세 누적 (2026-10-19): 비과세 · 일부 비과세 항목과 올해 확정한 급여에서 이미 비과세로 뺀 합계 · 연간 한도 · 남은 한도
  const exemptItems = items.filter((x) => x.kind === 'PAYMENT' && (x.taxTreatment === 'EXEMPT' || x.taxTreatment === 'PARTIAL') && (x.inUse || ytd[x.code]));
  const exemptRows = [...exemptItems.map((x) => ({ code: x.code, name: x.koName, used: ytd[x.code] ?? 0, monthly: x.taxExemptLimit, annual: x.taxExemptAnnualLimit ?? null })), ...Object.keys(ytd).filter((c) => !exemptItems.some((x) => x.code === c)).map((c) => ({ code: c, name: itemName(c), used: ytd[c], monthly: null, annual: null }))];
  const dk = (d: string) => d.replace(/[.-]/g, '_');
  const whyNot = (b: { code: string; detail?: string }) => (tr.has(`blocker.${b.code}`) ? tr(`blocker.${b.code}`, { detail: b.detail ? (tr.has(`detail.${dk(b.detail)}`) ? tr(`detail.${dk(b.detail)}`) : b.detail) : '' }) : b.code);
  const lineName = (code: string, fallback: string) => (tr.has(`line.${code}`) ? tr(`line.${code}`) : (items.find((x) => x.code === code)?.koName ?? fallback));

  const previewCard = (
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
  );

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


      {/* 요약 — 급여 · 통상시급 · 예상 실수령 · 상태 (2026-10-25) */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label={t('sumPay')} value={contract ? `${t(`payType.${contract.payType}`)} ${won(contract.amount)}` : t('notSet')} sub={contract ? t('versionFrom', { n: contract.version, from: contract.validFrom }) : undefined} tone={contract ? undefined : 'warn'} />
        <Tile label={t('colHourly')} value={hourly === null ? t('notSet') : won(hourly)} tone={hourly === null ? 'warn' : undefined} />
        <Tile label={t('previewNet')} value={preview.state === 'OK' ? won(preview.totals.net) : t('previewBlockedShort')} sub={preview.state === 'OK' ? t('sumPaySub', { pay: won(preview.totals.pay), deduction: won(preview.totals.deduction) }) : undefined} tone={preview.state === 'OK' ? 'ok' : 'warn'} />
        <Tile label={t('colState')} value={gaps.length === 0 ? t('stateReady') : t('stateGap', { n: gaps.length })} tone={gaps.length === 0 ? 'ok' : 'warn'} />
      </div>

      <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border" aria-label={t('tabsLabel')}>
        {TABS.map((k) => (
          <Link key={k} href={k === 'contract' ? `/admin/payroll/staff/${id}` : `/admin/payroll/staff/${id}?tab=${k}`} aria-current={tab === k ? 'page' : undefined} className={`flex min-h-11 shrink-0 items-center rounded-t-card border border-b-0 px-4 text-sm font-bold whitespace-nowrap lg:min-h-10 ${tab === k ? 'relative -mb-px border-border bg-bg text-primary' : 'border-transparent bg-surface text-muted hover:bg-primary-tint hover:text-primary'}`}>
            {t(`tab.${k}`)}
          </Link>
        ))}
      </nav>

      {tab === 'contract' && (
        <>
      <Card id="contract" className="scroll-mt-24">
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
        {pay.contracts[0] && pay.contracts[0].validFrom > today && <p className="mt-3 rounded-card bg-primary-tint p-3 text-sm text-primary">{t('scheduledNote', { from: pay.contracts[0].validFrom })}</p>}
        <ContractForm employeeId={id} today={today} version={pay.contracts[0]?.version ?? 0} last={pay.contracts[0] ?? null} />
        {pay.contracts.length > 0 && (
          <ul className="num mt-4 flex flex-col gap-1 border-t border-border pt-3 text-xs text-faint">
            {pay.contracts.map((c, i) => (
              <li key={c.id}>
                {t('contractHistory', { from: c.validFrom, range: c.validTo ? ` ~ ${c.validTo}` : '', extra: c.reason ? ` · ${c.reason}` : '', type: t(`payType.${c.payType}`), amount: won(c.amount), who: nameOf.get(c.createdBy) ?? '', at: day(c.createdAt) })}
                {c.validFrom > today && (
                  <>
                    {' '}
                    <Chip tone="info">{t('scheduled')}</Chip>
                    {i === 0 && <CancelVersionButton employeeId={id} kind="contract" id={c.id} />}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
          {previewCard}
        </>
      )}
      {tab === 'tax' && (
        <>
      <Card id="tax" className="scroll-mt-24">
        <CardTitle>{t('taxTitle')}</CardTitle>
        {tax ? (
          <dl className="num grid gap-x-6 gap-y-1 pt-3 text-sm md:grid-cols-2">
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('fRatio')}</dt><dd className="font-bold">{t('pct', { n: tax.withholdingRatio })}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('fFamily')}</dt><dd>{t('familyValue', { n: tax.familyCount, c: tax.childCount })}</dd></div>
            {INSURERS.map((k) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{t(`insurer.${k}`)}</dt>
                <dd>
                  {tax.insurance[k].state === 'UNKNOWN' && taxDefaults ? <span>{t(`tri.${taxDefaults.insurance[k]}`)} <span className="text-xs text-faint">({t('taxDefaultTag')})</span></span> : <span className={tax.insurance[k].state === 'UNKNOWN' ? 'font-bold text-warn' : ''}>{t(`tri.${tax.insurance[k].state}`)}</span>}
                  {tax.insurance[k].reportedWage !== null && ` · ${won(tax.insurance[k].reportedWage!)}`}
                  {tax.insurance[k].reportedWage !== null && k !== 'accident' && !reportedUsed[k] && <span className="text-xs text-faint"> ({t('reportedUnused')})</span>}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('fLoan')}</dt><dd>{t(`tri.${tax.studentLoan.state}`)}{tax.studentLoan.monthlyAmount !== null && ` · ${won(tax.studentLoan.monthlyAmount)}`}{tax.studentLoan.from && ` · ${tax.studentLoan.to ? t('period', { from: tax.studentLoan.from, to: tax.studentLoan.to }) : t('periodOpen', { from: tax.studentLoan.from })}`}</dd></div>
            {tax.reliefs.flat19?.state === 'YES' && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('flat19Title')}</dt>
                <dd>{t('flat19Line', { from: tax.reliefs.flat19.from ?? '' })}</dd>
              </div>
            )}
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
          taxDefaults ? (
            <div className="pt-3 text-sm">
              <p className="font-bold">{t('taxDefaultOn')}</p>
              <ul className="num grid gap-x-6 gap-y-1 pt-2 md:grid-cols-2">
                {INSURERS.map((k) => (
                  <li key={k} className="flex justify-between gap-3"><span className="text-muted">{t(`insurer.${k}`)}</span><span>{t(`tri.${taxDefaults.insurance[k]}`)}</span></li>
                ))}
              </ul>
              <p className="pt-2 text-xs text-muted">{t('taxDefaultNote')}</p>
            </div>
          ) : (
            <p className="pt-3 text-sm text-warn">{t('gap.no_tax')}</p>
          )
        )}
        {!reliefOn.sme && <p className="pt-2 text-xs text-faint">{t('reliefOff')}</p>}
        {pay.taxes[0] && pay.taxes[0].validFrom > today && <p className="mt-3 rounded-card bg-primary-tint p-3 text-sm text-primary">{t('scheduledNote', { from: pay.taxes[0].validFrom })}</p>}
        <TaxForm reportedUsed={reportedUsed} employeeId={id} today={today} version={pay.taxes[0]?.version ?? 0} last={pay.taxes[0] ?? null} reliefOn={reliefOn} foreign={!!foreign.nationality} />
        {pay.taxes.length > 0 && (
          <ul className="num mt-4 flex flex-col gap-1 border-t border-border pt-3 text-xs text-faint">
            {pay.taxes.map((x, i) => (
              <li key={x.id}>
                {t('taxHistory', { from: x.validFrom, range: x.validTo ? ` ~ ${x.validTo}` : '', extra: x.reason ? ` · ${x.reason}` : '', who: nameOf.get(x.createdBy) ?? '', at: day(x.createdAt) })}
                {x.validFrom > today && (
                  <>
                    {' '}
                    <Chip tone="info">{t('scheduled')}</Chip>
                    {i === 0 && <CancelVersionButton employeeId={id} kind="tax" id={x.id} />}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
          {previewCard}
        </>
      )}
      {tab === 'items' && (
        <>
      {common.length > 0 && (
        <Card>
          <CardTitle aside={<Link href="/admin/settings?tab=pay" className="text-sm font-semibold text-primary">{t('commonEdit')} ›</Link>}>{t('commonTitle')}</CardTitle>
          <p className="pt-1 text-sm text-faint">{t('commonIntro')}</p>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {common.map((c) => {
              const state = c.exceptIds.includes(id) ? 'except' : !commonAppliesTo(c, contract?.payType) ? 'type' : pay.items.some((x) => x.itemCode === c.code && x.validFrom <= today && (x.validTo === null || x.validTo > today)) ? 'personal' : 'on';
              return (
                <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                  <span className="font-semibold">{itemName(c.code)}</span>
                  <span className="num">{won(c.amount)}</span>
                  <span className={`ml-auto text-xs ${state === 'on' ? 'text-ok' : 'text-muted'}`}>{t(`commonState.${state}`)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>{t('itemsTitle')}</CardTitle>
        <p className="pt-1 text-sm text-faint">{t('itemsIntro')}</p>
        <ItemForms
          employeeId={id}
          today={today}
          options={usable.map((x) => ({ code: x.code, label: `${x.koName} (${t(x.kind === 'PAYMENT' ? 'kindPay' : 'kindDeduct')}${x.kind === 'PAYMENT' ? ` · ${tp(`tax.${x.taxTreatment}`)}${x.taxExemptLimit !== null && x.taxTreatment !== 'TAXABLE' ? ` ${won(x.taxExemptLimit)}` : ''}` : ''})`, defaultAmount: x.defaultAmount }))}
          rows={pay.items.map((x) => ({ id: x.id, name: itemName(x.itemCode), amount: x.amount === null ? null : won(x.amount), note: x.note, validFrom: x.validFrom, validTo: x.validTo }))}
        />
        {/* 새 항목 만들기는 드물게 쓴다 — 항목 추가 아래에 접어 둔다 (2026-10-26 의뢰인) */}
        <details className="group pt-3">
          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-bold text-primary">{t('itemsCreateTitle')}</summary>
          <div className="pt-2"><NewItemCreate today={today} /></div>
        </details>
      </Card>
          {previewCard}
        </>
      )}
      {tab === 'history' && (
        <>
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
        </>
      )}
      <p className="text-xs text-faint">{t('sensitiveNote')}</p>
    </PageShell>
  );
}
