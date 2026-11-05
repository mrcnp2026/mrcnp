// 칸별 판단 (2026-11-05 의뢰인: 지각 [무급] 하나가 그날 연장 칸까지 닫았다) — 판단한 칸만 닫고, 모두 닫혀야 처리 완료
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
const { dayFingerprint, partsFingerprint, reviewState } = await import('@/lib/attendance-check-reviews');
import type { DayCheck } from '@/lib/attendance-check';

const day: DayCheck = {
  workDate: '2026-10-06',
  state: 'decide',
  parts: [
    { kind: 'late_in', minutes: 173, covered: 0, state: 'decide' },
    { kind: 'after_end', minutes: 195, covered: 53, state: 'decide' },
  ],
};
const review = (fingerprint: string) => [{ id: 'r', employeeId: 'e', workDate: day.workDate, scope: 'day' as const, kind: 'day' as const, decision: 'confirmed' as const, note: null, fingerprint, decidedBy: 'm', createdAt: '' }];

describe('칸별 판단', () => {
  it('지각 칸만 판단하면 그날은 열린 채로, 지각 칸만 닫힌다', () => {
    const st = reviewState([day], [], review(partsFingerprint(day, ['late_in'])));
    expect(st.handled.has(day.workDate)).toBe(false);
    expect(st.changed.has(day.workDate)).toBe(false);
    expect([...(st.doneKinds.get(day.workDate) ?? [])]).toEqual(['late_in']);
  });
  it('연장 칸도 이어 붙여 판단하면 처리 완료', () => {
    const fp = partsFingerprint(day, ['after_end'], partsFingerprint(day, ['late_in']));
    expect(reviewState([day], [], review(fp)).handled.has(day.workDate)).toBe(true);
  });
  it('판단한 칸의 숫자가 바뀌면 다시 확인', () => {
    const fp = partsFingerprint(day, ['late_in']);
    const later: DayCheck = { ...day, parts: [{ ...day.parts[0], minutes: 180 }, day.parts[1]] };
    expect(reviewState([later], [], review(fp)).changed.has(day.workDate)).toBe(true);
  });
  it('예전 기록(하루 통째)은 그대로 처리 완료', () => {
    expect(reviewState([day], [], review(dayFingerprint(day))).handled.has(day.workDate)).toBe(true);
  });
});
