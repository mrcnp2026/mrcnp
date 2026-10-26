// 사원별 급여 「세액감면 · 공제등록」 탭 (PRD v1.3 4.2 · 다우오피스 사원별 급여관리 셋째 탭, 2026-10-20 의뢰인: 만들어 줘).
// 전 직원의 소득세 비율 · 가족 · 감면(중소기업 · 두루누리 · 외국인 19%) · 학자금 · 개인 공제 항목을 한 표로 본다. 고치는 것은 직원 화면에서 한다(같은 판 관리 · 사유).
// 감면 칸은 회사 설정(사원급여 기본)에서 켠 것만 보인다 — 직원 화면 · 계산과 같다.
// 회사 기본값(4대보험 · 세무)을 정해 두었으면, 세무 판이 없는 직원은 「회사 기본」으로 보인다(소득세 비율은 대장 기본값, 가족 1명 · 자녀 0명, 학자금 · 감면 없음) — 계산과 같다 (2026-10-25).
import { getFormatter, getTranslations } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Chip } from '@/components/ui';
import type { TaxInput } from '@/lib/payroll/contract';
import { loadDefaultWithholdingRatio, loadItems, loadTaxDefaults, reliefSwitches } from '@/lib/payroll/data';
import { NO_RELIEFS, synthTax } from '@/lib/payroll/tax-defaults';
import type { StaffPayLine } from '@/lib/payroll/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

type Ded = { name: string; amount: number | null };

export async function TaxBoard({ lines, today }: { lines: StaffPayLine[]; today: string }) {
  const [t, f, on, items, { data: assigned }, taxDefaults, defaultRatio] = await Promise.all([
    getTranslations('admin.staffPay'),
    getFormatter(),
    reliefSwitches(today),
    loadItems('DEDUCTION'),
    createAdminClient().from('payroll_employee_items').select('employee_id, item_code, amount, valid_from, valid_to').eq('active', true),
    loadTaxDefaults(today),
    loadDefaultWithholdingRatio(today),
  ]);
  // 세무 판이 없는 직원: 회사 기본값이 있으면 그 값으로 보인다
  const fallback = taxDefaults ? ({ ...synthTax(taxDefaults.defaults, defaultRatio), reliefs: NO_RELIEFS } as unknown as TaxInput) : null;
  const eff = (l: StaffPayLine): TaxInput | null => l.tax ?? fallback;
  const won = (v: number) => t('won', { n: f.number(v) });
  const itemOf = new Map(items.map((i) => [i.code, i]));
  const deds = new Map<string, Ded[]>();
  for (const a of assigned ?? []) {
    const item = itemOf.get(a.item_code as string);
    if (!item || (a.valid_from as string) > today || (a.valid_to !== null && today >= (a.valid_to as string))) continue; // 공제 항목만 · 오늘 걸린 것만
    deds.set(a.employee_id as string, [...(deds.get(a.employee_id as string) ?? []), { name: item.koName, amount: a.amount === null ? item.defaultAmount : Number(a.amount) }]);
  }
  const ded = (d: Ded) => (d.amount === null ? d.name : `${d.name} ${won(d.amount)}`);

  // 칸마다 글자 하나 — 「모름」은 경고색으로 (모름을 아니오로 보지 않는다)
  type Cell = { text: string; warn?: boolean } | null;
  const sme = (x: TaxInput): Cell => (x.reliefs.sme.state === 'UNKNOWN' ? { text: t('tri.UNKNOWN'), warn: true } : x.reliefs.sme.state === 'YES' ? { text: x.reliefs.sme.to ? t('board.sme', { rate: x.reliefs.sme.rate ?? 0, to: x.reliefs.sme.to }) : t('pct', { n: x.reliefs.sme.rate ?? 0 }) } : null);
  const duru = (x: TaxInput): Cell => (x.reliefs.durunuri.state === 'UNKNOWN' ? { text: t('tri.UNKNOWN'), warn: true } : x.reliefs.durunuri.state === 'YES' ? { text: t('board.durunuri', { p: x.reliefs.durunuri.pensionRate ?? 0, e: x.reliefs.durunuri.employmentRate ?? 0 }) } : null);
  const flat = (x: TaxInput): Cell => (x.reliefs.flat19?.state === 'YES' ? { text: t('board.flat19') } : null);
  const loan = (x: TaxInput): Cell => (x.studentLoan.state === 'UNKNOWN' ? { text: t('tri.UNKNOWN'), warn: true } : x.studentLoan.state === 'YES' ? { text: x.studentLoan.monthlyAmount === null ? t('board.loanOn') : won(x.studentLoan.monthlyAmount) } : null);
  const cols: { key: string; label: string; cell: (x: TaxInput) => Cell }[] = [
    { key: 'ratio', label: t('board.ratio'), cell: (x) => ({ text: t('pct', { n: x.withholdingRatio }) }) },
    { key: 'family', label: t('board.family'), cell: (x) => ({ text: t('board.familyValue', { n: x.familyCount, c: x.childCount }) }) },
    ...(on.sme ? [{ key: 'sme', label: t('board.smeCol'), cell: sme }] : []),
    ...(on.durunuri ? [{ key: 'durunuri', label: t('board.durunuriCol'), cell: duru }] : []),
    { key: 'flat19', label: t('board.flat19Col'), cell: flat },
    { key: 'loan', label: t('fLoan'), cell: loan },
  ];
  const count = (fn: (x: TaxInput) => Cell, warn = false) => lines.filter((l) => { const x = eff(l); return x && fn(x) && !!fn(x)?.warn === warn; }).length;
  const unknown = lines.filter((l) => { const x = eff(l); return !x || cols.some((c) => c.cell(x)?.warn); }).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" data-tax-sums>
        {on.sme && <Chip tone="info">{t('board.sumSme', { n: count(sme) })}</Chip>}
        {on.durunuri && <Chip tone="info">{t('board.sumDurunuri', { n: count(duru) })}</Chip>}
        <Chip tone="info">{t('board.sumFlat19', { n: count(flat) })}</Chip>
        <Chip tone="info">{t('board.sumLoan', { n: count(loan) })}</Chip>
        <Chip tone="info">{t('board.sumDed', { n: lines.filter((l) => deds.has(l.employeeId)).length })}</Chip>
        <Chip tone={unknown ? 'warn' : 'neutral'}>{t('board.sumUnknown', { n: unknown })}</Chip>
      </div>
      {!on.sme ? <p className="text-xs text-faint">{t('board.offNote')}</p> : null}

      {/* 폰: 사람마다 짧은 줄 — 적용 중인 것만 글로 */}
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg lg:hidden" data-phone-tax>
        {lines.map((l) => {
          const x = eff(l);
          const byDefault = !l.tax && !!x;
          const bits = x ? cols.slice(2).flatMap((c) => { const v = c.cell(x); return v ? [`${c.label} ${v.text}`] : []; }) : [];
          return (
            <li key={l.employeeId}>
              <Link href={`/admin/payroll/staff/${l.employeeId}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-surface">
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate">{l.name}</b>
                  <span className="num truncate text-xs text-muted">
                    {x ? [...(byDefault ? [t('taxDefaultTag')] : []), t('pct', { n: x.withholdingRatio }), t('board.familyValue', { n: x.familyCount, c: x.childCount }), ...bits, ...(deds.get(l.employeeId) ?? []).map(ded)].join(' · ') : t('gap.no_tax')}
                  </span>
                </span>
                {!x || cols.some((c) => c.cell(x)?.warn) ? <Chip tone="warn">{t('board.check')}</Chip> : null}
                <ChevronRight aria-hidden size={18} className="shrink-0 text-faint" />
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto table-ruled lg:block">
        <table className="w-full text-sm" data-tax-board>
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              {[t('colName'), ...cols.map((c) => c.label), t('board.dedCol')].map((h) => (
                <th key={h} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.employeeId} className="border-b border-border align-top">
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={`/admin/payroll/staff/${l.employeeId}`} className="font-bold text-primary hover:underline">{l.name}</Link>
                  {!l.active && <span className="ml-2 text-xs text-faint">{t('inactive')}</span>}
                  {!l.tax && fallback && <span className="ml-2 text-xs text-faint">{t('taxDefaultTag')}</span>}
                </td>
                {eff(l) ? (
                  cols.map((c) => {
                    const v = c.cell(eff(l)!);
                    return <td key={c.key} className={`num px-3 py-3 whitespace-nowrap ${v?.warn ? 'text-warn' : ''}`}>{v?.text ?? ''}</td>;
                  })
                ) : (
                  <td colSpan={cols.length} className="px-3 py-3 text-warn">{t('gap.no_tax')}</td>
                )}
                <td className="px-3 py-3">
                  {(deds.get(l.employeeId) ?? []).map((d, i) => (
                    <span key={i} className="num block whitespace-nowrap">{ded(d)}</span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-faint">{t('board.note')}</p>
    </>
  );
}
