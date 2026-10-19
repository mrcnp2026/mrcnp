// 이상 기록 담당자 · 처리 기한 · 기한 지남 (2026-10-19)
import { describe, expect, it } from 'vitest';
import { DEFAULT_TASK_POLICY, taskOf, validateTaskPolicy } from '@/lib/anomaly';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const p = { ...DEFAULT_TASK_POLICY, startsOn: '2026-10-20', dueDays: 3 };

describe('taskOf', () => {
  it('기본: 요청 승인자가 담당, 기한 = 발생일 + 3일, 그날까지는 지나지 않음', () => {
    const t = taskOf({ workDate: '2026-10-21', open: true, today: '2026-10-24', policy: p, approvers: [A, B] });
    expect(t).toMatchObject({ assignees: [A, B], due: '2026-10-24', overdueDays: 0, custom: false });
    expect(taskOf({ workDate: '2026-10-21', open: true, today: '2026-10-26', policy: p, approvers: [A] }).overdueDays).toBe(2);
  });
  it('처리한 건은 기한이 지나도 0일', () => {
    expect(taskOf({ workDate: '2026-10-21', open: false, today: '2026-11-30', policy: p, approvers: [A] }).overdueDays).toBe(0);
  });
  it('시작일 전 기록(옮겨 온 옛 기록)은 기한이 없다', () => {
    expect(taskOf({ workDate: '2026-09-01', open: true, today: '2026-10-25', policy: p, approvers: [A] })).toMatchObject({ due: null, overdueDays: 0 });
  });
  it('끄면 기한 · 알림이 없다', () => {
    expect(taskOf({ workDate: '2026-10-21', open: true, today: '2026-11-30', policy: { ...p, enabled: false }, approvers: [A] }).overdueDays).toBe(0);
  });
  it('한 건만 바꾼 담당 · 기한이 기본보다 먼저', () => {
    const t = taskOf({ workDate: '2026-10-21', open: true, today: '2026-10-30', policy: p, approvers: [A], override: { assigneeId: B, dueOn: '2026-10-28', note: '본인 확인 중', setBy: A, setAt: '' } });
    expect(t).toMatchObject({ assignees: [B], due: '2026-10-28', overdueDays: 2, custom: true, note: '본인 확인 중' });
  });
  it('정해 둔 한 사람이 기본 담당일 때', () => {
    expect(taskOf({ workDate: '2026-10-21', open: true, today: '2026-10-21', policy: { ...p, assignee: B }, approvers: [A] }).assignees).toEqual([B]);
  });
});

describe('validateTaskPolicy', () => {
  it('받는 값', () => {
    expect(validateTaskPolicy({ enabled: true, assignee: 'approvers', dueDays: 3 })).toMatchObject({ dueDays: 3, startsOn: '2026-10-20' });
    expect(validateTaskPolicy({ enabled: false, assignee: A, dueDays: 0, startsOn: '2026-11-01' })?.startsOn).toBe('2026-11-01');
  });
  it('막는 값', () => {
    expect(validateTaskPolicy({ enabled: true, assignee: 'x', dueDays: 3 })).toBeNull();
    expect(validateTaskPolicy({ enabled: true, assignee: 'approvers', dueDays: 40 })).toBeNull();
    expect(validateTaskPolicy({ enabled: true, assignee: 'approvers', dueDays: 1.5 })).toBeNull();
    expect(validateTaskPolicy({ assignee: 'approvers', dueDays: 3 })).toBeNull();
  });
});
