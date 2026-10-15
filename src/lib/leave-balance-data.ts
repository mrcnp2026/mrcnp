import 'server-only';
import { calcLeaveBalance, roundDays, type LeaveGrant, type LeaveRequest, type LeaveType } from '@/lib/leave';
import { ledgerFor, ledgerForMany } from '@/lib/leave-ledger-data';

/** 직원·관리자·승인 화면이 같은 원장/구 부여 기준을 사용한다. */
type BalanceArgs = { employeeId: string; asOf: string; practice: boolean; grants: LeaveGrant[]; requests: LeaveRequest[]; types: LeaveType[] };
type LedgerSummary = NonNullable<Awaited<ReturnType<typeof ledgerFor>>>;
function merge(args: BalanceArgs, ledger: LedgerSummary | null | undefined) {
  const old = calcLeaveBalance(args);
  if (!ledger) return { ...old, ledger: false };
  const pending = roundDays(args.requests.filter((r) => r.status === 'pending' && (r.typeSnapshot?.deductsBalance ?? args.types.find((t) => t.code === r.typeCode)?.deductsBalance)).reduce((a, r) => a + r.days, 0));
  return { ...old, ledger: true, granted: ledger.grantedDays, used: ledger.usedDays, remaining: ledger.remainingDays, pending };
}

/** 여러 직원을 한 번에 (같은 기준일) — 관리자 휴가 화면 (검수 R21) */
export async function leaveBalancesFor(list: BalanceArgs[], asOf: string, practice: boolean) {
  const ledgers = await ledgerForMany(list.map((x) => x.employeeId), asOf, practice);
  return new Map(list.map((x) => [x.employeeId, merge(x, ledgers.get(x.employeeId))] as const));
}

export async function leaveBalanceFor(args: { employeeId: string; asOf: string; practice: boolean; grants: LeaveGrant[]; requests: LeaveRequest[]; types: LeaveType[] }) {
  const old = calcLeaveBalance(args);
  const ledger = await ledgerFor(args.employeeId, args.asOf, args.practice);
  if (!ledger) return { ...old, ledger: false };
  const pending = roundDays(args.requests.filter((r) => r.status === 'pending' && (r.typeSnapshot?.deductsBalance ?? args.types.find((t) => t.code === r.typeCode)?.deductsBalance)).reduce((a, r) => a + r.days, 0));
  return { ...old, ledger: true, granted: ledger.grantedDays, used: ledger.usedDays, remaining: ledger.remainingDays, pending };
}
