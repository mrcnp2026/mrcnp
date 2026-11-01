// 이관 정리 규칙 (개발-63) — 기준일 · 상태에 맞는 것만 결정으로 바뀌는지
import { describe, expect, it } from 'vitest';
import { isMigrateTarget, planMigrate, type MigrateRow } from '@/lib/migrate-close-rules';

const row = (o: Partial<MigrateRow>): MigrateRow => ({ id: 'x', workDate: '2026-01-05', status: 'pending', needsReview: false, approvedMinutes: null, approvedNightMinutes: null, approvedHolidayMinutes: null, ...o });
const CUT = '2026-10-31';

describe('이관 정리', () => {
  it('대상: 기준일 이전의 대기 · 재확인만', () => {
    expect(isMigrateTarget(row({}), CUT)).toBe(true);
    expect(isMigrateTarget(row({ workDate: '2026-10-31' }), CUT)).toBe(true);
    expect(isMigrateTarget(row({ workDate: '2026-11-01' }), CUT)).toBe(false);
    expect(isMigrateTarget(row({ status: 'approved' }), CUT)).toBe(false);
    expect(isMigrateTarget(row({ status: 'approved', needsReview: true }), CUT)).toBe(true);
  });
  it('그대로 유지: 결정했던 상태 · 인정분을 그대로 (비어 있으면 비어 있는 그대로)', () => {
    const rows = [row({ id: 'a', status: 'approved', needsReview: true, approvedMinutes: 40, approvedNightMinutes: 0, approvedHolidayMinutes: 0 }), row({ id: 'b', status: 'approved', needsReview: true }), row({ id: 'c', status: 'rejected', needsReview: true })];
    const { ops, skipped } = planMigrate(rows, [{ id: 'a', action: 'keep' }, { id: 'b', action: 'keep' }, { id: 'c', action: 'keep' }], CUT);
    expect(skipped).toEqual([]);
    expect(ops).toEqual([
      { id: 'a', decision: 'approved', approvedMinutes: 40, approvedNightMinutes: 0, approvedHolidayMinutes: 0 },
      { id: 'b', decision: 'approved', approvedMinutes: null, approvedNightMinutes: null, approvedHolidayMinutes: null },
      { id: 'c', decision: 'rejected', approvedMinutes: null, approvedNightMinutes: null, approvedHolidayMinutes: null },
    ]);
  });
  it('대기: 인정은 계산된 시간 그대로, 불인정은 반려', () => {
    const { ops } = planMigrate([row({ id: 'a' }), row({ id: 'b' })], [{ id: 'a', action: 'approve' }, { id: 'b', action: 'reject' }], CUT);
    expect(ops.map((o) => o.decision)).toEqual(['approved', 'rejected']);
    expect(ops[0].approvedMinutes).toBeNull();
  });
  it('기준일 뒤 · 상태가 안 맞는 것 · 없는 것은 건너뛴다', () => {
    const rows = [row({ id: 'late', workDate: '2026-11-02' }), row({ id: 'p' }), row({ id: 'done', status: 'approved' })];
    const { ops, skipped } = planMigrate(rows, [{ id: 'late', action: 'reject' }, { id: 'p', action: 'keep' }, { id: 'done', action: 'approve' }, { id: 'gone', action: 'reject' }], CUT);
    expect(ops).toEqual([]);
    expect(skipped.map((s) => `${s.id}:${s.why}`)).toEqual(['late:after_cutoff', 'p:wrong_state', 'done:wrong_state', 'gone:not_found']);
  });
});
