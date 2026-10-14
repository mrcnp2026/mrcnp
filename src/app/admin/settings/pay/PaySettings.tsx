// 회사 설정 › 급여 — 9개 화면 (PRD v1.3 4.1 · 16 · 17장, 참고 화면 `스샷/스샷2/`의 설정 화면들).
//   사원급여 · 급여대장 · 지급항목 · 공제항목 · 사회보험 요율표 · 근로소득 간이세액표 · 법정수당 산정 · 주민등록번호 마스킹 · 근로시간설정
// 급여 담당 관리자(관리자 + 급여 열람 권한)만 본다. 값은 「임시」로 들어가고 경영지원실의 검증을 받으면 「검증됨」으로 바꾼다.
// 공식 기준 자료는 「검토 대기」를 거쳐 관리자가 「확인 후 반영」한 것만 쓰인다 — 자동으로 반영되지 않는다.
import { CircleMinus, CirclePlus, ClipboardList, Clock, EyeOff, Scale, ShieldCheck, TableProperties, Users, type LucideIcon } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Chip } from '@/components/ui';
import { loadActiveRule } from '@/lib/attendance-data';
import { getMe } from '@/lib/auth';
import { loadItems, loadPolicies, loadReferences, loadRuns, loadSettingHistory, loadTaxPage, type ReferenceRow } from '@/lib/payroll/data';
import { pickAt, RATE_KINDS, rateToPct, type ReferenceKind } from '@/lib/payroll/reference';
import { ALLOWANCE_KINDS, PAY_SECTIONS, payDateFor, type AllowancePolicy, type AnnualLeavePolicy, type Ledger, type PaySection, type SettingSection } from '@/lib/payroll/settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { Download } from 'lucide-react';
import { AllowanceForm, ImportForm, ItemForm, ManualForm, RefreshButton, ReviewForm, SeedButton, SettingForm, TaxCalc, UseToggle, VerifyButton } from './PayForms';

const ICONS: Record<PaySection, LucideIcon> = { 'employee-defaults': Users, ledger: ClipboardList, 'payment-items': CirclePlus, 'deduction-items': CircleMinus, 'insurance-rates': ShieldCheck, 'income-tax': TableProperties, allowances: Scale, masking: EyeOff, 'working-time': Clock };
const TAX_KINDS: ReferenceKind[] = ['income-tax.table', 'income-tax.child-adjust'];
const PCT_FIELDS = new Set(['employeeRate', 'employerRate', 'totalRate', 'incomeRate', 'healthRate', 'rate', 'stabilityUnder150', 'stabilityPriority150', 'stability150to1000', 'stabilityOver1000']);
const KRW_FIELDS = new Set(['lower', 'upper', 'hourly', 'monthly209', 'monthlyLimit', 'child1', 'child2', 'perExtraChild', 'wageMin', 'wageMaxExclusive', 'premiumUpper', 'premiumUpperEmployee', 'premiumLower', 'incomePremiumUpper']);
type SP = { section?: string; v?: string; year?: string; from?: string; edit?: string; add?: string };

function Band({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 lg:px-6">
      <h2 className="text-sm font-bold text-muted">{children}</h2>
      {aside}
    </div>
  );
}

export async function PaySettings({ sp }: { sp: SP }) {
  const [t, f, me] = await Promise.all([getTranslations('admin.paySettings'), getFormatter(), getMe()]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p>;
  const section: PaySection = (PAY_SECTIONS as readonly string[]).includes(sp.section ?? '') ? (sp.section as PaySection) : 'employee-defaults';
  const today = toKstDate(new Date());
  const href = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ tab: 'pay', section });
    for (const [k, v] of Object.entries(o)) if (v) q.set(k, v);
    return `/admin/settings?${q}`;
  };
  const won = (n: number | null | undefined) => (n === null || n === undefined ? t('unset') : t('won', { n: f.number(n) }));
  const tempChip = (v: string) => (v === 'VERIFIED' ? <Chip tone="ok">{t('verified')}</Chip> : <Chip tone="warn">{t('temporary')}</Chip>);
  const names = async (ids: (string | null)[]) => {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    if (!list.length) return new Map<string, string>();
    const { data } = await createAdminClient().from('profiles').select('id, name').in('id', list);
    return new Map((data ?? []).map((p) => [p.id as string, p.name as string]));
  };
  /** 기준 자료의 값들을 「이름: 값」으로 */
  const payloadLines = (r: ReferenceRow) =>
    Object.entries(r.payload)
      .filter(([k, v]) => t.has(`refField.${k}`) && (v === null || typeof v === 'string' || typeof v === 'number'))
      .map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="text-muted">{t(`refField.${k}`)}</dt>
          <dd className="num font-bold">{v === null ? t('unset') : PCT_FIELDS.has(k) ? `${rateToPct(v as string)}%` : KRW_FIELDS.has(k) ? won(Number(v)) : String(v)}</dd>
        </div>
      ));
  const period = (a: string | null, b: string | null) => (a ? `${a} ~ ${b ? toKstDate(new Date(Date.parse(`${b}T00:00:00+09:00`) - 864e5)) : t('open')}` : t('review.fromMissing'));

  let body: ReactNode;

  if (section === 'employee-defaults' || section === 'ledger' || section === 'masking' || section === 'working-time') {
    const history = await loadSettingHistory(section as SettingSection);
    const cur = history[0] ?? null;
    const who = await names(history.map((h) => h.createdBy));
    const ledger = section === 'ledger' ? (cur?.payload as Ledger | undefined) : undefined;
    const rule = section === 'working-time' ? await loadActiveRule() : null;
    body = (
      <>
        {section === 'ledger' && ledger && (
          <p className="num border-b border-border bg-primary-tint px-4 py-3 text-sm text-primary lg:px-6">{t('s02.example', { month: today.slice(0, 7), date: payDateFor(today.slice(0, 7), ledger) })}</p>
        )}
        {section === 'ledger' && !cur && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warn-tint px-4 py-3 text-sm text-warn lg:px-6">
            <p>{t('s02.missing')}</p>
            <SeedButton path="/api/admin/payroll/settings/ledger" label={t('s02.seed')} />
          </div>
        )}
        {section === 'masking' && <p className="border-b border-border px-4 py-3 text-sm text-muted lg:px-6">{t('s08.intro')}</p>}
        {section === 'working-time' && (
          <div className="flex flex-col gap-1 border-b border-border px-4 py-3 text-sm lg:px-6">
            <p className="font-bold">{t('s09.ruleTitle')}</p>
            <p className="num text-muted">{rule ? t('s09.rule', { start: rule.startTime.slice(0, 5), end: rule.endTime.slice(0, 5), step: rule.roundStepMin ?? 0 }) : t('s09.ruleNone')}</p>
            <Link href="/admin/settings?tab=work" className="self-start font-bold text-primary">
              {t('s09.toRule')} ›
            </Link>
          </div>
        )}
        <div className="px-4 py-4 lg:px-6">
          <SettingForm key={cur?.version ?? 0} section={section as SettingSection} current={cur?.payload ?? null} version={cur?.version ?? 0} today={today} />
        </div>
        <Band>{t('history')}</Band>
        {history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-faint lg:px-6">{t('historyNone')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={h.id} className="flex flex-col gap-1 px-4 py-3 text-sm lg:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="num">{t('versionN', { n: h.version })}</b>
                  <span className="num text-muted">{period(h.validFrom, h.validTo)}</span>
                  {tempChip(h.verification)}
                  <span className="text-xs text-faint">{who.get(h.createdBy) ?? ''}</span>
                </div>
                {h.reason && <p className="text-muted">{h.reason}</p>}
                {h.verificationNote && <p className="text-xs text-ok">{h.verificationNote}</p>}
                <VerifyButton target="setting" id={h.id} verified={h.verification === 'VERIFIED'} />
              </li>
            ))}
          </ul>
        )}
      </>
    );
  } else if (section === 'payment-items' || section === 'deduction-items') {
    const kind = section === 'payment-items' ? 'PAYMENT' : 'DEDUCTION';
    const items = await loadItems(kind);
    const editing = items.find((x) => x.code === sp.edit);
    body = (
      <>
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-4 py-3 lg:px-6">
          <SeedButton path="/api/admin/payroll/items" label={t('item.seed')} />
          <Link href={href({ add: '1' })} className="inline-flex h-8 items-center rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
            + {t('add')}
          </Link>
        </div>
        {(sp.add === '1' || editing) && (
          <div className="border-b border-border bg-surface px-4 py-4 lg:px-6">
            <p className="pb-3 font-bold">{editing ? t('item.editTitle', { name: editing.koName }) : t('item.addTitle')}</p>
            <ItemForm key={editing?.id ?? 'new'} kind={kind} item={editing} today={today} />
            <Link href={href({})} className="inline-flex min-h-9 items-center text-sm text-muted">
              {t('cancel')}
            </Link>
          </div>
        )}
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-faint lg:px-6">{t('item.none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {['item.colName', 'item.colCalc', ...(kind === 'PAYMENT' ? ['item.colFixed', 'item.colTax', 'item.colOrdinary'] : []), 'item.colAmount', 'item.colState', 'item.colUse'].map((k) => (
                    <th key={k} scope="col" className="px-4 py-2 whitespace-nowrap">
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className={`border-b border-border ${it.inUse ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-2">
                      <Link href={href({ edit: it.code })} className="font-bold text-primary underline">
                        {it.koName}
                      </Link>
                      <span className="num block text-xs text-faint">
                        {it.code} · {it.enName}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{t(`calcKind.${it.calcKind}`)}</td>
                    {kind === 'PAYMENT' && (
                      <>
                        <td className="px-4 py-2">{it.fixedAllowance ? t('item.fixedYes') : ''}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {t(`tax.${it.taxTreatment}`)}
                          {it.taxExemptLimit !== null && <span className="num block text-xs text-faint">{t('item.limitOf', { amount: won(it.taxExemptLimit) })}</span>}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">{t(`ordinary.${it.ordinaryWage}`)}</td>
                      </>
                    )}
                    <td className="num px-4 py-2 text-right whitespace-nowrap">{won(it.defaultAmount)}</td>
                    <td className="px-4 py-2">
                      <span className="flex flex-col items-start gap-1">
                        {tempChip(it.verification)}
                        <VerifyButton target="item" id={it.id} verified={it.verification === 'VERIFIED'} />
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <UseToggle path="/api/admin/payroll/items" id={it.id} on={it.inUse} label={t('item.useOf', { name: it.koName })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 py-3 text-xs text-faint lg:px-6">{t('item.note')}</p>
      </>
    );
  } else if (section === 'insurance-rates' || section === 'income-tax') {
    const kinds = section === 'insurance-rates' ? RATE_KINDS : TAX_KINDS;
    const view = sp.v === 'pending' || sp.v === 'history' || sp.v === 'add' ? sp.v : 'current';
    const year = sp.year && /^\d{4}$/.test(sp.year) ? sp.year : today.slice(0, 4);
    const [approved, pending] = await Promise.all([loadReferences(kinds, ['APPROVED']), loadReferences(kinds, ['PENDING_ADMIN_REVIEW'])]);
    const tabs = (
      <nav className="flex flex-wrap gap-1 border-b border-border px-4 pt-3 lg:px-6" aria-label={t('ref.tabs')}>
        {(['current', 'pending', 'history', 'add'] as const).map((k) => (
          <Link key={k} href={href({ v: k === 'current' ? undefined : k })} aria-current={view === k ? 'page' : undefined} className={`inline-flex min-h-9 items-center gap-1 border-b-2 px-3 text-sm font-bold ${view === k ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>
            {t(`ref.tab.${k}`)}
            {k === 'pending' && pending.length > 0 && <span className="num rounded-chip bg-warn px-1.5 text-xs text-on-primary">{pending.length}</span>}
          </Link>
        ))}
      </nav>
    );
    let inner: ReactNode;
    if (view === 'current') {
      // 그 해에 걸쳐 있는 승인본만 — 없는 해에 다른 해의 표를 대신 보이지 않는다
      const inYear = approved.filter((r) => (r.validFrom ?? '') <= `${year}-12-31` && (r.validTo === null || r.validTo > `${year}-01-01`));
      const table = section === 'income-tax' ? pickAt(approved.filter((r) => r.kind === 'income-tax.table'), year === today.slice(0, 4) ? today : `${year}-12-31`) : null;
      const from = sp.from && /^\d{1,12}$/.test(sp.from) ? Number(sp.from) : 0;
      const page = table ? await loadTaxPage(table.id, from, 25) : [];
      inner = (
        <>
          <form action="/admin/settings" className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 lg:px-6">
            <input type="hidden" name="tab" value="pay" />
            <input type="hidden" name="section" value={section} />
            <label className="flex items-center gap-2 text-sm font-bold">
              {t('ref.year')}
              <input type="number" name="year" min={2000} max={2100} defaultValue={year} className="num h-9 w-24 rounded-button border border-border bg-bg px-2 text-sm" />
            </label>
            {section === 'income-tax' && (
              <label className="flex items-center gap-2 text-sm font-bold">
                {t('tax.searchWage')}
                <input type="number" name="from" min={0} step={1000} defaultValue={from || ''} className="num h-9 w-36 rounded-button border border-border bg-bg px-2 text-sm" />
              </label>
            )}
            <button type="submit" className="inline-flex h-9 items-center rounded-button border border-nav bg-bg px-4 text-sm font-bold text-nav">
              {t('ref.lookup')}
            </button>
            <span className="num text-xs text-faint">{t('ref.lookupNote', { year })}</span>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {['ref.colKind', 'ref.colValue', 'ref.colPeriod', 'ref.colSource', 'ref.colState'].map((k) => (
                    <th key={k} scope="col" className="px-4 py-2 whitespace-nowrap">
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kinds.flatMap((k) => {
                  const rows = inYear.filter((r) => r.kind === k).sort((a, b) => (a.validFrom! < b.validFrom! ? -1 : 1));
                  if (rows.length === 0)
                    return [
                      <tr key={k} className="border-b border-border">
                        <td className="px-4 py-3 font-bold">{t(`ref.${k.replace('.', '_')}`)}</td>
                        <td colSpan={4} className="px-4 py-3 text-faint">
                          {t('ref.notAcquired', { year })}
                        </td>
                      </tr>,
                    ];
                  return rows.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top">
                      <td className="px-4 py-3 font-bold">{t(`ref.${k.replace('.', '_')}`)}</td>
                      <td className="px-4 py-3">
                        <dl className="flex min-w-48 flex-col gap-0.5">{payloadLines(r)}</dl>
                      </td>
                      <td className="num px-4 py-3 whitespace-nowrap">{period(r.validFrom, r.validTo)}</td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {r.source?.authority}
                        <span className="block">{t(`ref.origin.${r.origin}`)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-col items-start gap-1">
                          {tempChip(r.verification)}
                          <VerifyButton target="reference" id={r.id} verified={r.verification === 'VERIFIED'} />
                        </span>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
          {section === 'income-tax' && (
            <>
              <Band>{t('calc.title')}</Band>
              <div className="px-4 py-4 lg:px-6">
                <TaxCalc today={today} />
                <p className="pt-2 text-xs text-faint">{t('calc.note')}</p>
              </div>
              <Band>{t('tax.tableTitle')}</Band>
              {!table ? (
                <p className="px-4 py-8 text-center text-sm text-faint lg:px-6">{t('ref.notAcquired', { year })}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="num w-full text-right text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className="sticky left-0 bg-bg px-3 py-2 text-left whitespace-nowrap">
                          {t('tax.colWage')}
                        </th>
                        {[...Array(11)].map((_, i) => (
                          <th key={i} scope="col" className="px-3 py-2">
                            {i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {page.map((b) => (
                        <tr key={b.wageFrom} className="border-b border-border">
                          <th scope="row" className="sticky left-0 bg-bg px-3 py-1.5 text-left font-normal whitespace-nowrap">
                            {f.number(b.wageFrom)} ~ {b.wageTo === null ? '' : f.number(b.wageTo)}
                          </th>
                          {b.taxes.map((x, i) => (
                            <td key={i} className="px-3 py-1.5">
                              {x === 0 ? '-' : f.number(x)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {page.length === 25 && (
                    <Link href={href({ year, from: String(page.at(-1)!.wageTo ?? '') })} className="inline-flex min-h-9 items-center px-4 text-sm font-bold text-primary">
                      {t('tax.next')} ›
                    </Link>
                  )}
                  {page.length === 0 && <p className="px-4 py-6 text-center text-sm text-faint">{t('tax.outOfTable')}</p>}
                </div>
              )}
            </>
          )}
        </>
      );
    } else if (view === 'pending') {
      inner =
        pending.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-faint lg:px-6">{t('ref.pendingNone')}</p>
        ) : (
          <ul className="flex flex-col gap-3 px-4 py-4 lg:px-6">
            {pending.map((r) => {
              const now = pickAt(approved.filter((a) => a.kind === r.kind), r.validFrom ?? today);
              const y = typeof r.payload.documentYear === 'number' ? `${r.payload.documentYear}-01-01` : null;
              return (
                <li key={r.id} className="flex flex-col gap-3 rounded-card border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{t(`ref.${r.kind.replace('.', '_')}`)}</b>
                    <Chip tone="info">{t(`ref.origin.${r.origin}`)}</Chip>
                    <span className="num text-sm text-muted">{period(r.validFrom, r.validTo)}</span>
                  </div>
                  <div className="grid gap-4 text-sm lg:grid-cols-2">
                    <div>
                      <p className="pb-1 text-xs font-bold text-muted">{t('review.newValue')}</p>
                      <dl className="flex flex-col gap-0.5">{payloadLines(r)}</dl>
                    </div>
                    <div>
                      <p className="pb-1 text-xs font-bold text-muted">{t('review.currentValue')}</p>
                      {now ? <dl className="flex flex-col gap-0.5">{payloadLines(now)}</dl> : <p className="text-faint">{t('review.currentNone')}</p>}
                    </div>
                  </div>
                  <p className="text-xs break-all text-muted">
                    {t('review.source')}: {r.source?.authority} {r.source?.url ?? ''}
                  </p>
                  {r.warnings.length > 0 && (
                    <ul className="flex flex-col gap-1 rounded-button bg-warn-tint p-3 text-xs text-warn">
                      {r.warnings.map((w) => (
                        <li key={w}>{t.has(`warn.${w}`) ? t(`warn.${w}`) : w}</li>
                      ))}
                    </ul>
                  )}
                  <ReviewForm id={r.id} payloadHash={r.payloadHash} validFrom={r.validFrom} validTo={r.validTo} suggestFrom={y} />
                </li>
              );
            })}
          </ul>
        );
    } else if (view === 'history') {
      const [all, runs] = await Promise.all([loadReferences(kinds, ['PENDING_ADMIN_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN']), loadRuns(5)]);
      const who = await names(all.map((r) => r.approvedBy));
      const collected = runs.filter((r) => r.trigger === 'manual' || r.trigger === 'scheduled');
      inner = (
        <>
          <Band>{t('refresh.runsTitle')}</Band>
          {collected.filter((r) => r.results.some((x) => 'ok' in x)).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-faint lg:px-6">{t('refresh.runsNone')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {collected
                .filter((r) => r.results.some((x) => 'ok' in x))
                .map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm lg:px-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="num">{f.dateTime(new Date(r.startedAt), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' })}</b>
                      <Chip tone={r.status === 'done' ? 'ok' : r.status === 'partial' ? 'warn' : 'neutral'}>{t(`refresh.status.${r.status}`)}</Chip>
                      <span className="text-xs text-faint">{t(`refresh.trigger.${r.trigger}`)}</span>
                    </div>
                    <ul className="grid gap-x-6 gap-y-0.5 text-xs lg:grid-cols-2">
                      {r.results.map((x) => (
                        <li key={x.source} className="flex justify-between gap-2">
                          <span>{t.has(`refresh.source.${x.source}`) ? t(`refresh.source.${x.source}`) : x.source}</span>
                          <span className={x.ok ? 'num text-muted' : 'text-warn'}>{x.ok ? t('refresh.okLine', { staged: x.staged ?? 0, unchanged: x.unchanged ?? 0 }) : t('refresh.failLine', { why: x.error ?? '' })}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
          )}
          <Band>{t('refresh.dataTitle')}</Band>
          {all.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-faint lg:px-6">{t('historyNone')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {all.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm lg:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{t(`ref.${r.kind.replace('.', '_')}`)}</b>
                  <Chip tone={r.state === 'APPROVED' ? 'ok' : r.state === 'PENDING_ADMIN_REVIEW' ? 'warn' : 'neutral'}>{t(`ref.state.${r.state}`)}</Chip>
                  <span className="num text-muted">{period(r.validFrom, r.validTo)}</span>
                  <span className="num text-xs text-faint">{toKstDate(new Date(r.createdAt))}</span>
                </div>
                {r.reviewReason && (
                  <p className="text-muted">
                    {r.approvedBy ? `${who.get(r.approvedBy) ?? ''} · ` : ''}
                    {r.reviewReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
          )}
        </>
      );
    } else {
      inner = (
        <>
          <Band>{t('import.title')}</Band>
          <div className="px-4 py-4 lg:px-6">
            <p className="pb-3 text-sm text-muted">{t('import.intro')}</p>
            <ImportForm />
          </div>
          <Band>{t('manual.title')}</Band>
          <div className="px-4 py-4 lg:px-6">
            <p className="pb-3 text-sm text-muted">{t('manual.intro')}</p>
            <ManualForm kinds={kinds} />
          </div>
        </>
      );
    }
    body = (
      <>
        <p className="border-b border-border bg-primary-tint px-4 py-3 text-sm text-primary lg:px-6">{t('ref.principle')}</p>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
          <RefreshButton />
          <a href="/api/admin/payroll/confirm-sheet" className="inline-flex h-9 items-center gap-1 rounded-button border border-nav bg-bg px-4 text-sm font-bold whitespace-nowrap text-nav">
            <Download aria-hidden size={16} />
            {t('confirm.download')}
          </a>
        </div>
        {tabs}
        {inner}
      </>
    );
  } else {
    const [policies, leave] = await Promise.all([loadPolicies('allowance.'), loadPolicies('leave.')]);
    const annual = leave.find((p) => p.kind === 'leave.annual-accrual');
    const a = annual?.payload as AnnualLeavePolicy | undefined;
    body = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 lg:px-6">
          <p className="text-sm text-muted">{t('s07.intro')}</p>
          <span className="flex flex-wrap items-center gap-2">
            <a href="/api/admin/payroll/confirm-sheet" className="inline-flex h-9 items-center gap-1 rounded-button border border-nav bg-bg px-4 text-sm font-bold whitespace-nowrap text-nav">
              <Download aria-hidden size={16} />
              {t('confirm.download')}
            </a>
            <SeedButton path="/api/admin/payroll/policies" label={t('s07.seed')} />
          </span>
        </div>
        <ul className="divide-y divide-border">
          {ALLOWANCE_KINDS.map((k) => {
            const p = policies.find((x) => x.kind === `allowance.${k}`);
            const v = (p?.payload ?? null) as AllowancePolicy | null;
            return (
              <li key={k} className="flex flex-col gap-2 px-4 py-4 text-sm lg:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-base">{t(`s07.kind.${k}`)}</b>
                  {p && tempChip(p.verification)}
                  {p && (
                    <span className="ml-auto">
                      <UseToggle path="/api/admin/payroll/policies" id={p.id} on={p.inUse} label={t(`s07.kind.${k}`)} />
                    </span>
                  )}
                </div>
                <p className="text-muted">{t(`s07.when.${k}`)}</p>
                <p>
                  <span className="font-bold">{t('s07.legal')}</span> {t(`s07.legalOf.${k}`)}
                </p>
                <p className="num">
                  <span className="font-bold">{t('s07.company')}</span>{' '}
                  {!p ? t('unset') : v?.premium ? t(k === 'shutdown' ? 's07.shareOf' : 's07.premiumOf', { pct: rateToPct(v.premium) }) + (v.premiumOver8h ? ` · ${t('s07.over8hOf', { pct: rateToPct(v.premiumOver8h) })}` : '') : t('s07.noPremium')}
                  {v?.note ? ` · ${v.note}` : ''}
                </p>
                {p?.verificationNote && <p className="text-xs text-ok">{p.verificationNote}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={href({ edit: k })} className="text-sm font-bold text-primary underline">
                    {t('s07.edit')}
                  </Link>
                  {p && <VerifyButton target="policy" id={p.id} verified={p.verification === 'VERIFIED'} />}
                </div>
                {sp.edit === k && (
                  <div className="rounded-card bg-surface p-4">
                    <AllowanceForm key={p?.version ?? 0} kind={k} current={v} version={p?.version ?? 0} today={today} />
                    <Link href={href({})} className="inline-flex min-h-9 items-center text-sm text-muted">
                      {t('cancel')}
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <Band aside={annual && tempChip(annual.verification)}>{t('s07.annualTitle')}</Band>
        <div className="flex flex-col gap-2 px-4 py-4 text-sm lg:px-6">
          {a ? (
            <>
              <p>{t(`s07.annualBasis.${a.basis}`)}</p>
              <p className="num text-muted">{t('s07.annualRule', { monthly: a.firstYearMonthly, max1: a.firstYearMax, base: a.baseDays, every: a.extraEveryYears, from: a.extraFromYear, max: a.maxDays, att: rateToPct(a.minAttendance) })}</p>
              <p className="text-xs text-faint">{t('s07.annualNote')}</p>
              {annual && <VerifyButton target="policy" id={annual.id} verified={annual.verification === 'VERIFIED'} />}
            </>
          ) : (
            <p className="text-faint">{t('s07.annualNone')}</p>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="grid gap-4">
      {/* PC에서는 통합설정의 메뉴 판(App 관리 › 급여)이 같은 목록을 보여 준다 — 폰에서만 이 줄을 쓴다 (2026-10-14) */}
      <nav aria-label={t('menu')} className="flex gap-1 overflow-x-auto border border-border bg-bg p-1 lg:hidden">
        {PAY_SECTIONS.map((s) => {
          const Icon = ICONS[s];
          const on = s === section;
          return (
            <Link key={s} href={`/admin/settings?tab=pay&section=${s}`} aria-current={on ? 'page' : undefined} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-button px-3 text-sm whitespace-nowrap lg:min-h-9 ${on ? 'bg-primary-tint font-bold text-primary' : 'text-muted hover:bg-surface hover:text-text'}`}>
              <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
              {t(`section.${s}`)}
            </Link>
          );
        })}
      </nav>
      <section className="min-w-0 overflow-hidden border border-border bg-bg lg:rounded-card">
        <div className="border-b border-border px-4 py-4 lg:px-6">
          <h2 className="text-xl font-bold">{t(`section.${section}`)}</h2>
          <p className="pt-1 text-sm text-faint">{t(`intro.${section}`)}</p>
        </div>
        {body}
      </section>
    </div>
  );
}
