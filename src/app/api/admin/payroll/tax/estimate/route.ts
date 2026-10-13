// 소득세 조회 (S06 계산기, PRD v1.3 17.5) — 승인된 간이세액표와 자녀 조정 규칙으로만 계산한다. 결과를 어디에도 저장하지 않는다.
import { api, ApiError, readJson } from '@/lib/api';
import { asChildRule, loadReferences, loadTaxRowsAt, requirePayroll } from '@/lib/payroll/data';
import { estimateTax, pickAt } from '@/lib/payroll/reference';
import { isDate } from '@/lib/payroll/settings';

export const POST = api('admin.payroll.tax.estimate', async (req) => {
  await requirePayroll();
  const b = await readJson(req);
  const wage = typeof b.wage === 'string' && /^\d{1,12}$/.test(b.wage) ? Number(b.wage) : null; // 빈 칸은 0이 아니다 — 계산하지 않는다
  const family = Number(b.family);
  if (wage === null || !isDate(b.payDate) || !Number.isInteger(family) || family < 1 || family > 11) throw new ApiError(400, 'invalid_input');
  const [tables, rules] = await Promise.all([loadReferences(['income-tax.table'], ['APPROVED']), loadReferences(['income-tax.child-adjust'], ['APPROVED'])]);
  const table = pickAt(tables, b.payDate);
  if (!table) throw new ApiError(422, 'payroll_reference_missing');
  const row = (await loadTaxRowsAt(table.id, wage)).find((r) => r.family === family);
  const rule = pickAt(rules, b.payDate);
  const r = estimateTax({ baseTax: row?.baseTax ?? null, children: Number(b.children), ratio: Number(b.ratio), rule: asChildRule(rule?.payload) });
  if (!r.ok) throw new ApiError(r.why === 'invalid_input' ? 400 : 422, r.why === 'no_row' ? 'payroll_tax_out_of_table' : r.why === 'no_child_rule' ? 'payroll_tax_no_child_rule' : 'invalid_input');
  return { ...r, band: row ? { from: row.wageFrom, to: row.wageTo } : null, tableFrom: table.validFrom, ruleFrom: rule?.validFrom ?? null, temporary: table.verification !== 'VERIFIED' || (!!rule && rule.verification !== 'VERIFIED') };
});
