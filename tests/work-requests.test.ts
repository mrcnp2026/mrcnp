// 외근·출장·재택 (②-3 7-11)
import { describe, expect, it } from 'vitest';
import { summarizeMonth } from '@/lib/monthly';
import { computeEmployeeDays } from '@/lib/period';
import { kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';
import { workByDate, workStatusOn, type WorkRequest } from '@/lib/work-requests';

const w = (p: Partial<WorkRequest>): WorkRequest => ({ id: 'w', employeeId: 'e1', kind: 'outside', startDate: '2026-10-13', endDate: '2026-10-13', startTime: null, endTime: null, place: 'site', reason: null, status: 'approved', ...p });

describe('승인된 외근 날짜', () => {
  it('승인된 것만, 그 직원 것만, 겹치면 출장 > 외근 > 재택', () => {
    const reqs = [w({}), w({ kind: 'business_trip', startDate: '2026-10-13', endDate: '2026-10-15' }), w({ kind: 'remote', startDate: '2026-10-16', endDate: '2026-10-16', status: 'pending' }), w({ employeeId: 'e2', startDate: '2026-10-16', endDate: '2026-10-16' })];
    expect(workStatusOn('2026-10-13', 'e1', reqs)).toBe('business_trip');
    expect(workStatusOn('2026-10-16', 'e1', reqs)).toBeNull();
    expect([...workByDate(reqs, 'e1', '2026-10-01', '2026-10-31').keys()]).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
  });
});

describe('월간 집계 — 기록 없는 승인 외근일은 결근이 아니다 (요점 3)', () => {
  const RULE: WorkRule = { startTime: '09:00', endTime: '18:00', lateGraceMin: 10, breakStart: '12:00', breakEnd: '13:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7 };
  it('출장일은 결근에서 빠지고 warn:외근·출장일 시간 미반영', () => {
    const days = computeEmployeeDays({ events: [], approvedCorrections: [], rule: RULE, holidays: [], from: '2026-10-01', to: '2026-10-31' });
    const base = { employeeNo: 'A', name: 'N', yearMonth: '2026-10', days, requests: [], pendingCorrections: 0, rule: RULE, joinedOn: '2026-10-12', now: kstDateTime('2026-11-01', '12:00'), today: '2026-11-01', thresholdMinutes: 30, leave: new Map() };
    const without = summarizeMonth(base);
    const r = summarizeMonth({ ...base, work: workByDate([w({ kind: 'business_trip', startDate: '2026-10-13', endDate: '2026-10-14' })], 'e1', '2026-10-01', '2026-10-31') });
    expect(Number(r.row.absent_days)).toBe(Number(without.row.absent_days) - 2);
    expect(r.workDates).toEqual(['2026-10-13', '2026-10-14']);
    expect(String(r.row.flags)).toContain('warn:외근·출장일 시간 미반영');
    expect(r.netMinutes).toBe(0); // 근로시간을 지어내지 않는다 (간주는 노무 확인 후)
  });
});
