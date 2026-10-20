// 남은 연차 수당 — 계약 · 매달 수당을 한꺼번에 읽어 사람마다 계산한다 (2026-10-20). 서버 전용.
// 휴가 원장 「잔여 연차 현황」(전 직원)과 퇴사 정산이 같이 쓴다.
// 통합설정 › 휴가 「연차수당에 통상임금 수당 포함」(leave.payoutAllowances)을 끄면 계약 시급만으로 계산한다.
import 'server-only';
import { leavePayout, type LeavePayout, type PayoutContract, type PayoutItem } from '@/lib/leave-payout';
import { versionAt } from '@/lib/payroll/contract';
import { loadItems } from '@/lib/payroll/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { switchOn } from '@/lib/switches';

type Row = Record<string, unknown>;

/** 그 날 기준 사람마다 계약 · 매달 수당 (없으면 계약 null) */
export async function payoutInputs(employeeIds: readonly string[], date: string): Promise<Map<string, { contract: PayoutContract | null; items: PayoutItem[] }>> {
  const out = new Map<string, { contract: PayoutContract | null; items: PayoutItem[] }>();
  if (!employeeIds.length) return out;
  const c = createAdminClient();
  const [{ data: cons }, { data: assigns }, items, withAllowances] = await Promise.all([
    c.from('payroll_contract_versions').select('employee_id, pay_type, amount, monthly_hours, annual_divisor, valid_from, valid_to').in('employee_id', [...employeeIds]).eq('status', 'active'),
    c.from('payroll_employee_items').select('employee_id, item_code, amount, valid_from, valid_to').in('employee_id', [...employeeIds]).eq('active', true),
    loadItems('PAYMENT', date),
    switchOn('leave.payoutAllowances'),
  ]);
  for (const id of employeeIds) {
    const mine = ((cons ?? []) as Row[]).filter((r) => r.employee_id === id).map((r) => ({ validFrom: r.valid_from as string, validTo: r.valid_to as string | null, r }));
    const con = versionAt(mine, date);
    const contract: PayoutContract | null = con ? { payType: con.r.pay_type as PayoutContract['payType'], amount: Number(con.r.amount), monthlyHours: con.r.monthly_hours === null ? null : Number(con.r.monthly_hours), annualDivisor: con.r.annual_divisor === null ? null : Number(con.r.annual_divisor) } : null;
    const list: PayoutItem[] = !withAllowances ? [] : ((assigns ?? []) as Row[])
      .filter((a) => a.employee_id === id && (a.valid_from as string) <= date && (a.valid_to === null || date < (a.valid_to as string)))
      .flatMap((a) => {
        const it = items.find((x) => x.code === a.item_code);
        const amount = a.amount === null ? (it?.defaultAmount ?? null) : Number(a.amount);
        return it && amount !== null ? [{ code: it.code, label: it.koName, amount, ordinaryWage: it.ordinaryWage }] : [];
      });
    out.set(id, { contract, items: list });
  }
  return out;
}

/** 사람마다 남은 연차 수당. minutes: 남은 분 */
export async function payoutsFor(rows: readonly { employeeId: string; minutes: number }[], date: string, dayMinutes: number): Promise<Map<string, LeavePayout>> {
  const inputs = await payoutInputs(rows.map((r) => r.employeeId), date);
  return new Map(rows.map((r) => [r.employeeId, leavePayout({ ...(inputs.get(r.employeeId) ?? { contract: null, items: [] }), unusedMinutes: Math.max(0, r.minutes), dayMinutes })]));
}
