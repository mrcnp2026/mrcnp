// 내 휴가 달별 사용 표 (lib/leave.ts monthlyLeaveUse)
import { describe, expect, it } from 'vitest';
import { monthlyLeaveUse, type LeaveRequest, type LeaveType } from '@/lib/leave';

const types = [
  { code: 'annual', deductsBalance: true },
  { code: 'sick', deductsBalance: false },
] as unknown as LeaveType[];
const req = (over: Partial<LeaveRequest>): LeaveRequest => ({ id: 'x', employeeId: 'e', typeCode: 'annual', startDate: '2026-03-02', endDate: '2026-03-02', days: 1, reason: null, status: 'approved', ...over }) as LeaveRequest;

describe('달별 휴가 사용', () => {
  it('승인된 연차 · 그 밖의 휴가 · 대기를 달마다 나눠 센다', () => {
    const m = monthlyLeaveUse(
      [req({}), req({ days: 0.5 }), req({ typeCode: 'sick', startDate: '2026-03-10', endDate: '2026-03-10' }), req({ status: 'pending', startDate: '2026-05-01', endDate: '2026-05-01' }), req({ status: 'rejected' })],
      types,
      '2026',
    );
    expect(m).toHaveLength(12);
    expect(m[2]).toEqual({ month: 3, deducted: 1.5, other: 1, pending: 0 });
    expect(m[4]).toEqual({ month: 5, deducted: 0, other: 0, pending: 1 });
  });
  it('다른 해 · 거절된 신청은 세지 않고, 여러 날 신청은 시작한 달에 센다', () => {
    const m = monthlyLeaveUse([req({ startDate: '2025-12-31', endDate: '2026-01-02', days: 3 }), req({ startDate: '2026-01-30', endDate: '2026-02-02', days: 2 })], types, '2026');
    expect(m[0].deducted).toBe(2);
    expect(m[1].deducted).toBe(0);
  });
});
