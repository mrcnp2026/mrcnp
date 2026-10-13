// 소득세 조회 (S06 계산기, PRD v1.3 17.5) — 승인된 간이세액표와 자녀 공제 규칙으로만 계산한다. 결과를 어디에도 저장하지 않는다.
// 표 범위를 넘는 급여 · 가족 11명 초과는 세액표 원문에서 읽어 둔 규칙으로 계산하고, 규칙이 없으면 계산하지 않는다.
import { api, ApiError, readJson } from '@/lib/api';
import { loadBandTaxes, loadReferences, requirePayroll } from '@/lib/payroll/data';
import { asChildRule, asTaxRules, estimateTax, pickAt } from '@/lib/payroll/reference';
import { isDate } from '@/lib/payroll/settings';

const WHY = { no_row: 'payroll_tax_out_of_table', no_high_rule: 'payroll_tax_out_of_table', no_family_rule: 'payroll_tax_no_family_rule', no_child_rule: 'payroll_tax_no_child_rule', invalid_input: 'invalid_input' } as const;

export const POST = api('admin.payroll.tax.estimate', async (req) => {
  await requirePayroll();
  const b = await readJson(req);
  const wage = typeof b.wage === 'string' && /^\d{1,12}$/.test(b.wage) ? Number(b.wage) : null; // 빈 칸은 0이 아니다 — 계산하지 않는다
  const family = Number(b.family);
  if (wage === null || !isDate(b.payDate) || !Number.isInteger(family)) throw new ApiError(400, 'invalid_input');
  const [tables, rules] = await Promise.all([loadReferences(['income-tax.table'], ['APPROVED']), loadReferences(['income-tax.child-adjust'], ['APPROVED'])]);
  const table = pickAt(tables, b.payDate);
  const tr = asTaxRules(table?.payload);
  if (!table || !tr) throw new ApiError(422, 'payroll_reference_missing');
  const band = wage >= tr.wageMin && wage < tr.wageMaxExclusive ? await loadBandTaxes(table.id, wage) : null;
  const rule = pickAt(rules, b.payDate);
  const r = estimateTax({ wage, family, children: Number(b.children), ratio: Number(b.ratio), bandTaxes: band?.taxes ?? null, rules: tr, childRule: asChildRule(rule?.payload) });
  if (!r.ok) throw new ApiError(r.why === 'invalid_input' ? 400 : 422, WHY[r.why]);
  return { ...r, band: band ? { from: band.from, to: band.to } : null, tableFrom: table.validFrom, ruleFrom: rule?.validFrom ?? null, temporary: table.verification !== 'VERIFIED' || (!!rule && rule.verification !== 'VERIFIED') };
});
