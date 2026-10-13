// 지점관리자 — 열 수 있는 화면 · 맡은 지점의 범위 · 등급 변경 규칙
import { describe, expect, it } from 'vitest';
import { expandGroups, managerCanOpen, scopeIds } from '@/lib/manager-rules';
import { checkRoleChange, type Staff } from '@/lib/staff-rules';

const ID = '11111111-2222-3333-4444-555555555555';

describe('지점관리자가 열 수 있는 화면', () => {
  it('요청 · 기록 · 근무일정 · 휴가 보기만 연다', () => {
    for (const p of ['/admin/inbox', '/admin/records', '/admin/records/list', '/admin/records/calendar', `/admin/records/${ID}`, `/admin/records/${ID}/2026-10-13`, '/admin/schedule', `/admin/schedule/${ID}/2026-10-13`, '/admin/leave', `/admin/leave/req/${ID}`, `/admin/leave/emp/${ID}`, '/admin/missing', '/admin/inbox/']) {
      expect(managerCanOpen(p), p).toBe(true);
    }
  });
  it('그 밖의 관리 화면은 전부 막는다 (새 화면도 기본은 거부)', () => {
    for (const p of ['/admin', '/admin/members', `/admin/members/${ID}`, '/admin/settings', '/admin/payroll', '/admin/closing', '/admin/leave/ledger', '/admin/leave/types', '/admin/shifts', '/admin/notices', '/admin/manage/report-snapshots', '/admin/branches', '/admin/places', '/admin/jobs', '/admin/diag', '/admin/records/list/x', '/admin/inbox2', '/admin/records/not-a-uuid', '/admin/something-new', '']) {
      expect(managerCanOpen(p), p).toBe(false);
    }
  });
});

describe('맡은 지점의 범위', () => {
  const groups = [
    { id: 'seoul', parentId: null },
    { id: 'seoul-a', parentId: 'seoul' },
    { id: 'busan', parentId: null },
    { id: 'busan-a', parentId: 'busan' },
  ];
  const people = [
    { id: 'm', groupId: 'busan' },
    { id: 's1', groupId: 'seoul' },
    { id: 's2', groupId: 'seoul-a' },
    { id: 'b1', groupId: 'busan-a' },
    { id: 'none', groupId: null },
  ];
  it('부서를 맡으면 그 밑의 팀까지', () => {
    expect([...expandGroups(groups, ['seoul'])].sort()).toEqual(['seoul', 'seoul-a']);
    expect([...expandGroups(groups, ['seoul-a'])]).toEqual(['seoul-a']);
  });
  it('맡은 지점의 직원과 자기 자신만 — 자기 소속 지점이라고 저절로 보이지 않는다', () => {
    expect([...scopeIds({ managerId: 'm', people, groups, managed: ['seoul'] })].sort()).toEqual(['m', 's1', 's2']);
  });
  it('맡은 지점이 없으면 자기 자신만, 지점 없는 직원은 누구에게도 안 보인다', () => {
    expect([...scopeIds({ managerId: 'm', people, groups, managed: [] })]).toEqual(['m']);
    expect(scopeIds({ managerId: 'm', people, groups, managed: ['seoul', 'busan'] }).has('none')).toBe(false);
  });
});

describe('등급 변경', () => {
  const st = (id: string, role: Staff['role'], canViewPayroll = false): Staff => ({ id, role, active: true, canViewPayroll });
  const all = [st('a1', 'admin', true), st('a2', 'admin'), st('e', 'employee'), st('m', 'manager')];
  it('직원 → 지점관리자, 지점관리자 → 직원 · 관리자', () => {
    expect(checkRoleChange({ actor: all[0], target: all[2], all, role: 'manager' })).toMatchObject({ next: { role: 'manager', canViewPayroll: false } });
    expect(checkRoleChange({ actor: all[0], target: all[3], all, role: 'employee' })).toMatchObject({ next: { role: 'employee' } });
    expect(checkRoleChange({ actor: all[0], target: all[3], all, role: 'admin' })).toMatchObject({ next: { role: 'admin' } });
  });
  it('관리자를 지점관리자로 내리면 급여 담당도 내려오고, 관리자 2명 하한을 지킨다', () => {
    expect(checkRoleChange({ actor: all[0], target: all[1], all, role: 'manager' })).toEqual({ code: 'min_admins' });
    const three = [...all, st('a3', 'admin', true)];
    expect(checkRoleChange({ actor: three[0], target: three[4], all: three, role: 'manager' })).toMatchObject({ next: { role: 'manager', canViewPayroll: false } });
  });
  it('지점관리자에게 급여 담당을 줄 수 없다', () => {
    expect(checkRoleChange({ actor: all[0], target: all[3], all, canViewPayroll: true })).toEqual({ code: 'payroll_needs_admin' });
  });
});
