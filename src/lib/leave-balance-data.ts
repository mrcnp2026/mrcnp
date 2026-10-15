import 'server-only';
import { calcLeaveBalance, roundDays, type LeaveGrant, type LeaveRequest, type LeaveType } from '@/lib/leave';
import { ledgerFor } from '@/lib/leave-ledger-data';

/** 직원·관리자·승인 화면이 같은 원장/구 부여 기준을 사용한다. */
export async function leaveBalanceFor(args: { employeeId: string; asOf: string; practice: boolean; grants: LeaveGrant[]; requests: LeaveRequest[]; types: LeaveType[] }) {
  const old = calcLeaveBalance(args);
  const ledger = await ledgerFor(args.employeeId, args.asOf, args.practice);
  if (!ledger) return { ...old, ledger: false };
  const pending = roundDays(args.requests.filter((r) => r.status === 'pending' && (r.typeSnapshot?.deductsBalance ?? args.types.find((t) => t.code === r.typeCode)?.deductsBalance)).reduce((a, r) => a + r.days, 0));
  return { ...old, ledger: true, granted: ledger.grantedDays, used: ledger.usedDays, remaining: ledger.remainingDays, pending };
}
