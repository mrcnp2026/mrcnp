// 요청 통합 (2026-10-10): 네 표의 행을 같은 모양으로 · 대기중/완료 나누기 · 「2일 전」
import { describe, expect, it } from 'vitest';
import { ago, fromCorrection, fromLeave, fromOvertime, fromWork, splitRequests } from '@/lib/requests';

const common = { employee_id: 'e1', reason: null, approved_by: null, decided_at: null };

describe('행 → 요청', () => {
  it('정정', () => {
    const r = fromCorrection({ ...common, id: 'c1', work_date: '2026-10-05', correction_type: 'add_missing', kind: 'in', new_punched_at: '2026-10-05T00:00:00Z', status: 'pending', created_at: '2026-10-06T01:00:00Z' });
    expect(r).toMatchObject({ key: 'correction:c1', kind: 'correction', date: '2026-10-05', endDate: '2026-10-05', sub: 'add_missing', punchKind: 'in', newAt: '2026-10-05T00:00:00Z', status: 'pending' });
  });
  it('연장근로: 연장 + 휴일 분', () => {
    expect(fromOvertime({ ...common, id: 'o1', work_date: '2026-10-05', overtime_minutes: 90, holiday_minutes: 30, status: 'approved', created_at: null }).minutes).toBe(120);
  });
  it('휴가: 기간 · 일수 · 시각(초 자름)', () => {
    const r = fromLeave({ ...common, id: 'l1', type_code: 'c_x', start_date: '2026-10-12', end_date: '2026-10-12', days: '0.5', start_time: '10:00:00', end_time: '15:00:00', status: 'approved', created_at: 'a', approved_by: 'boss', decided_at: 'b', reason: '' });
    expect(r).toMatchObject({ sub: 'c_x', days: 0.5, startTime: '10:00', endTime: '15:00', decidedBy: 'boss', decidedAt: 'b', reason: null });
  });
  it('외근: 장소 · 시각 없음', () => {
    expect(fromWork({ ...common, id: 'w1', kind: 'outside', start_date: '2026-10-12', end_date: '2026-10-13', start_time: null, end_time: null, place: '고객사', status: 'rejected', created_at: 'a' })).toMatchObject({ sub: 'outside', place: '고객사', startTime: null, endDate: '2026-10-13' });
  });
});

describe('splitRequests', () => {
  const mk = (id: string, status: string, created_at: string, decided_at: string | null) => fromWork({ ...common, id, kind: 'remote', start_date: '2026-10-01', end_date: '2026-10-01', place: 'x', status, created_at, decided_at });
  it('대기중은 새로 낸 것이 위, 완료는 방금 처리된 것이 위', () => {
    const { pending, done } = splitRequests([mk('a', 'pending', '2026-10-01', null), mk('b', 'pending', '2026-10-03', null), mk('c', 'approved', '2026-10-01', '2026-10-02'), mk('d', 'rejected', '2026-09-01', '2026-10-05'), mk('e', 'cancelled', '2026-10-04', null)]);
    expect(pending.map((x) => x.id)).toEqual(['b', 'a']);
    expect(done.map((x) => x.id)).toEqual(['d', 'e', 'c']); // e는 처리 시각이 없어 낸 시각(10-04)으로
  });
});

describe('ago', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('분 · 시간 · 일', () => {
    expect(ago(now, '2026-10-10T11:59:40Z')).toEqual({ unit: 'now', n: 0 });
    expect(ago(now, '2026-10-10T11:15:00Z')).toEqual({ unit: 'min', n: 45 });
    expect(ago(now, '2026-10-10T07:00:00Z')).toEqual({ unit: 'hour', n: 5 });
    expect(ago(now, '2026-10-08T11:00:00Z')).toEqual({ unit: 'day', n: 2 });
  });
  it('앞날은 방금 · 값이 없거나 이상하면 null', () => {
    expect(ago(now, '2026-10-11T00:00:00Z')).toEqual({ unit: 'now', n: 0 });
    expect(ago(now, null)).toBe(null);
    expect(ago(now, 'x')).toBe(null);
  });
});
