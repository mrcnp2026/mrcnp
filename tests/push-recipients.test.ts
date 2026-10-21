// 관리자 폰 알림 받는 사람 (2026-10-21 의뢰인, 결정 사항 알림-9)
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/company', () => ({ companyProfile: async () => ({}), putCompanyProfile: async () => ({}) }));
import { OFFICE } from '@/config/office';
import { pushAdminRule, receivesStaffPush } from '@/lib/push-recipients';
import { planPunchAlerts } from '@/lib/punch-alerts';

const always = { id: 'a', role: 'admin', admin_level: 'super', employee_no: OFFICE.pushAlwaysEmployeeNo };
const ceo = { id: 'c', role: 'admin', admin_level: 'ceo', employee_no: 'M007' };
const other = { id: 'o', role: 'admin', admin_level: 'super', employee_no: 'M001' };
const system = { id: 's', role: 'admin', admin_level: 'system', employee_no: OFFICE.ownerEmployeeNo };
const manager = { id: 'm', role: 'manager', admin_level: null, employee_no: 'E1' };

describe('관리자 폰 알림 받는 사람', () => {
  it('이상준 최고관리자는 항상, 대표자는 받지 않음, 나머지 최고관리자는 기본 끔', () => {
    expect(pushAdminRule(always)).toBe('always');
    expect(pushAdminRule(ceo)).toBe('never');
    expect(pushAdminRule(other)).toBe('choice');
    expect(pushAdminRule(system)).toBe('choice');
    expect(receivesStaffPush(always, {})).toBe(true);
    expect(receivesStaffPush(ceo, {})).toBe(false);
    expect(receivesStaffPush(other, {})).toBe(false);
    expect(receivesStaffPush(system, {})).toBe(false);
  });
  it('통합설정에서 켠 최고관리자만 받는다 — 대표자는 켜 둔 값이 있어도 받지 않는다 · 이상준 최고관리자는 꺼 둔 값이 있어도 받는다', () => {
    expect(receivesStaffPush(other, { o: true })).toBe(true);
    expect(receivesStaffPush(ceo, { c: true })).toBe(false);
    expect(receivesStaffPush(always, { a: false })).toBe(true);
  });
  it('지점관리자 · 직원은 이 규칙을 타지 않는다', () => {
    expect(pushAdminRule(manager)).toBeNull();
    expect(receivesStaffPush(manager, {})).toBe(true);
  });
});

describe('어제 빠진 기록 알림은 정정 요청을 그 날짜 · 종류로 연다', () => {
  it('url에 날짜와 종류', () => {
    const plan = planPunchAlerts({
      people: [{ id: 'e', name: '김하늘', startTime: '09:00', endTime: '18:00', misses: [{ workDate: '2026-10-20', kind: 'out', hasPendingRequest: false }] }],
      today: '2026-10-21', yesterday: '2026-10-20', hour: 9, approversOf: () => ['a'],
    });
    expect(plan.find((x) => x.key.startsWith('self-prev'))?.payload.url).toBe('/punch/corrections?date=2026-10-20&kind=out');
  });
});

describe('거절 사유 (2026-10-21)', () => {
  it('거절일 때만, 앞뒤 공백을 빼고 200자까지 · 비었으면 null', async () => {
    const { rejectReasonOf } = await import('@/lib/reject-reason');
    expect(rejectReasonOf({ decision: 'rejected', reason: '  출장 신청으로 다시 내 주세요 ' })).toBe('출장 신청으로 다시 내 주세요');
    expect(rejectReasonOf({ decision: 'rejected', reason: '   ' })).toBeNull();
    expect(rejectReasonOf({ decision: 'rejected' })).toBeNull();
    expect(rejectReasonOf({ decision: 'approved', reason: '좋음' })).toBeNull();
    expect(rejectReasonOf({ decision: 'rejected', reason: '가'.repeat(300) })?.length).toBe(200);
  });
});
