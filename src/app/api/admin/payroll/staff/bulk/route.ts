// 사원별 급여 — 고른 직원 여러 명에게 한 번에 적용 (2026-10-25 의뢰인). 급여 담당 관리자만.
// action: contract(금액 · 시간 기준 · 월 환산 시간) / insurance(4대보험 가입 여부) / item(고정 수당 · 공제 붙이기).
// 직원마다 화면에서 하나씩 고치는 것과 같은 길(saveContract · saveTax · addStaffItem)로 새 판을 쌓는다 — 한 명이 막혀도 나머지는 저장하고, 줄마다 결과를 돌려준다.
// ★ 검사 계정은 검사 계정만, 실제 관리자는 실제 직원만 다룬다(서로의 줄은 「모르는 직원」).
import { api, ApiError, readJson } from '@/lib/api';
import { assertStaffTarget } from '@/lib/staff-data';
import { validateItemAssign, versionAt } from '@/lib/payroll/contract';
import { applyContractEdit, applyInsuranceEdit, BULK_MAX, cleanContractEdit, cleanInsuranceEdit } from '@/lib/payroll/bulk-staff';
import { requirePayroll } from '@/lib/payroll/data';
import { cleanText, isDate } from '@/lib/payroll/settings';
import { addStaffItem, loadStaffPay, saveContract, saveTax } from '@/lib/payroll/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTestNo } from '@/lib/work-messages';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Line = { id: string; ok: boolean; code?: string };

export const POST = api('admin.payroll.staff.bulk', async (req, ctx) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids)] : [];
  if (ids.length === 0 || ids.length > BULK_MAX || ids.some((x) => typeof x !== 'string' || !UUID.test(x))) throw new ApiError(400, 'invalid_input');
  if (b.action !== 'contract' && b.action !== 'insurance' && b.action !== 'item') throw new ApiError(400, 'invalid_input');
  if (!isDate(b.validFrom)) throw new ApiError(400, 'invalid_input');
  const validFrom = b.validFrom;
  const reason = cleanText(b.reason, 500) ?? null;
  if (b.action !== 'item' && (!reason || reason.length < 2)) throw new ApiError(400, 'reason_required'); // 고치는 일에는 사유가 있어야 한다(하나씩 고칠 때와 같다)
  const contractEdit = b.action === 'contract' ? cleanContractEdit(b) : null;
  const insuranceEdit = b.action === 'insurance' ? cleanInsuranceEdit(b.insurance) : null;
  const item = b.action === 'item' ? validateItemAssign(b) : null;
  if ((b.action === 'contract' && !contractEdit) || (b.action === 'insurance' && !insuranceEdit) || (item && !item.ok)) throw new ApiError(400, 'invalid_input');

  const { data: people } = await createAdminClient().from('profiles').select('id, employee_no').in('id', ids as string[]);
  const known = new Set((people ?? []).filter((p) => isTestNo(p.employee_no as string | null) === isTestNo(me.employeeNo)).map((p) => p.id as string));

  const lines: Line[] = [];
  for (const id of ids as string[]) {
    try {
      if (!known.has(id)) throw new ApiError(404, 'not_found');
      await assertStaffTarget(me.id, id, 'edit'); // 등급 보호 — 최고관리자 · 대표자의 것은 그 등급만
      const pay = await loadStaffPay(id);
      if (b.action === 'contract') {
        const cur = versionAt(pay.contracts, validFrom) ?? pay.contracts[0] ?? null;
        if (!cur) throw new ApiError(422, 'no_contract'); // 계약이 없는 직원은 새로 만들지 않는다(어떤 금액인지 모른다)
        const next = applyContractEdit(cur, contractEdit!);
        if (!next) throw new ApiError(422, 'contract_amount');
        await saveContract({ employeeId: id, input: next, validFrom, reason, expectedVersion: pay.contracts[0]?.version ?? 0, me, requestId: ctx.requestId });
      } else if (b.action === 'insurance') {
        const cur = versionAt(pay.taxes, validFrom) ?? pay.taxes[0] ?? null;
        await saveTax({ employeeId: id, input: applyInsuranceEdit(cur, insuranceEdit!), validFrom, reason, expectedVersion: pay.taxes[0]?.version ?? 0, me, requestId: ctx.requestId });
      } else {
        await addStaffItem({ employeeId: id, input: (item as { ok: true; value: { itemCode: string; amount: number | null; note: string | null } }).value, validFrom, me, requestId: ctx.requestId });
      }
      lines.push({ id, ok: true });
    } catch (e) {
      lines.push({ id, ok: false, code: e instanceof ApiError ? e.code : 'generic' });
    }
  }
  return { done: lines.filter((l) => l.ok).length, failed: lines.filter((l) => !l.ok), total: lines.length };
});
