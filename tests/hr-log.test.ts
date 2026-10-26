// 인사 기록 목록 줄 만들기 + 비고 자동 문구 (2026-10-25 의뢰인)
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { buildHrLogRows, type HrEvent } from '@/lib/hr-log';
import { statusNote } from '@/lib/staff-rules';

const P = (id: string, name: string, active: boolean) => ({ id, name, employee_no: `no-${id}`, group_id: null, joined_on: '2026-01-02', active });
const ev = (id: number, target: string, at: string, event: string | null, extra: Partial<HrEvent> = {}): HrEvent => ({
  id, actor_id: 'm', target_id: target, reason: null, created_at: at, action: 'update', before: null, after: event ? { event } : null, ...extra,
});

describe('인사 기록 목록', () => {
  it('퇴사 · 복직을 최근 순으로, 처리한 사람 이름과 사유를 붙여 보인다', () => {
    const rows = buildHrLogRows(
      [P('a', '김하나', true), P('b', '박둘', false), P('m', '관리자', true)],
      [
        ev(1, 'a', '2026-10-01T03:00:00Z', 'resign', { reason: '개인 사정' }),
        ev(2, 'a', '2026-10-20T03:00:00Z', 'reinstate', { reason: '재입사' }),
        ev(3, 'b', '2026-10-10T03:00:00Z', 'resign', { reason: '계약 만료' }),
      ],
    );
    expect(rows.map((r) => [r.name, r.kind, r.on, r.reason, r.actor])).toEqual([
      ['김하나', 'reinstate', '2026-10-20', '재입사', '관리자'],
      ['박둘', 'resign', '2026-10-10', '계약 만료', '관리자'],
      ['김하나', 'resign', '2026-10-01', '개인 사정', '관리자'],
    ]);
  });
  it('인사 기록(비고) 글도 한 목록에 들어가고, 퇴사 · 복직 때 자동으로 남은 줄은 겹쳐 나오지 않는다', () => {
    const rows = buildHrLogRows(
      [P('a', '김하나', false), P('m', '관리자', true)],
      [ev(1, 'a', '2026-10-10T03:00:00Z', 'resign', { reason: '계약 만료' })],
      [
        { id: 'n1', employee_id: 'a', body: '면담함', created_at: '2026-10-05T03:00:00Z', created_by: 'm' },
        { id: 'n2', employee_id: 'a', body: '[퇴사 처리] 아이디 no-a · 2026-10-10 · 사유: 계약 만료', created_at: '2026-10-10T03:00:01Z', created_by: 'm' },
      ],
    );
    expect(rows.map((r) => [r.kind, r.reason])).toEqual([['resign', '계약 만료'], ['note', '면담함']]);
  });
  it('권한 변경과 입사일 수정이 들어간다 — 권한은 event 줄과 수정 줄이 겹치면 한 번만', () => {
    const rows = buildHrLogRows(
      [P('a', '김하나', true), P('b', '박둘', true), P('m', '관리자', true)],
      [
        ev(1, 'a', '2026-10-10T03:00:00Z', 'role_changed', { reason: '승격', after: { event: 'role_changed', from: { grade: 'employee' }, to: { grade: 'manager' } } }),
        ev(2, 'a', '2026-10-10T03:00:01Z', null, { before: { role: 'employee', admin_level: null, joined_on: '2026-01-02' }, after: { role: 'manager', admin_level: null, joined_on: '2026-01-02' } }),
        ev(3, 'b', '2026-10-12T03:00:00Z', null, { before: { role: 'employee', joined_on: '2026-01-02' }, after: { role: 'admin', joined_on: '2026-01-05' } }),
      ],
    );
    expect(rows.map((r) => [r.name, r.kind, r.reason])).toEqual([
      ['박둘', 'role', '직원 → 관리자'],
      ['박둘', 'joined', '입사일 2026-01-02 → 2026-01-05'],
      ['김하나', 'role', '직원 → 지점관리자 (사유: 승격)'],
    ]);
  });
  it('엑셀 내려받기는 받은 사람 이름 줄로 들어간다', () => {
    const rows = buildHrLogRows([P('m', '관리자', true)], [], [], [{ id: 1, actor_id: 'm', kind: 'list_members', file_name: '직원목록_20261025.xlsx', purpose: null, created_at: '2026-10-25T03:00:00Z' }]);
    expect(rows.map((r) => [r.name, r.kind, r.reason, r.actor])).toEqual([['관리자', 'download', '직원목록_20261025.xlsx', '관리자']]);
  });
  it('처리 기록이 없는데 꺼져 있는 사람(옮겨 온 퇴사자)도 한 줄로 보인다', () => {
    const rows = buildHrLogRows([P('c', '최셋', false)], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: '최셋', kind: 'resign', on: null, reason: null });
  });
  it('비고 문구에 아이디 · 날짜 · 사유가 들어간다', () => {
    expect(statusNote('resign', 'kim01', '2026-10-25', '계약 만료')).toBe('[퇴사 처리] 아이디 kim01 · 2026-10-25 · 사유: 계약 만료');
    expect(statusNote('reinstate', 'kim01', '2026-11-01', '재입사')).toContain('[복직 처리]');
  });
});
