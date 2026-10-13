// 근태 이상자 판정 · 정책
import { describe, expect, it } from 'vitest';
import { anomalyPolicyOf, dayAnomalies, DEFAULT_ANOMALY_POLICY, summarizeAnomalies, validateAnomalyPolicy } from '@/lib/anomaly';
import { FLAG } from '@/lib/flags';

const at = (hm: string, d = '2026-10-12') => new Date(`${d}T${hm}:00+09:00`);
const plan = { startTime: '09:00', endTime: '18:00', graceMin: 5 };
const base = { workDate: '2026-10-12', flags: [] as string[], plan, deemed: false, excused: false, missing: null as 'in' | 'out' | null, unverified: 0 };

describe('하루의 이상 유형', () => {
  it('정시 출퇴근은 아무것도 없다', () => {
    expect(dayAnomalies({ ...base, pairs: [{ in: at('08:55'), out: at('18:02') }] })).toEqual([]);
    expect(dayAnomalies({ ...base, pairs: [{ in: at('09:05'), out: at('18:00') }] })).toEqual([]);
  });
  it('지각 · 조퇴', () => {
    expect(dayAnomalies({ ...base, pairs: [{ in: at('09:06'), out: at('17:30') }] })).toEqual(['late', 'early']);
  });
  it('근무 중(퇴근 전)은 조퇴가 아니다', () => {
    expect(dayAnomalies({ ...base, pairs: [{ in: at('08:55'), out: null }] })).toEqual([]);
  });
  it('누락 · 짝 없는 퇴근 · 중복', () => {
    expect(dayAnomalies({ ...base, pairs: [], missing: 'in' })).toEqual(['missing_in']);
    expect(dayAnomalies({ ...base, pairs: [{ in: at('08:55'), out: null }], missing: 'out' })).toEqual(['missing_out']);
    expect(dayAnomalies({ ...base, pairs: [{ in: at('08:55'), out: at('18:00') }], flags: [FLAG.ORPHAN_OUT, FLAG.DUPLICATE_IN] })).toEqual(['orphan_out', 'duplicate']);
  });
  it('겹치거나 뒤집힌 시각', () => {
    expect(dayAnomalies({ ...base, pairs: [{ in: at('08:55'), out: at('13:00') }, { in: at('12:30'), out: at('18:00') }] })).toEqual(['overlap']);
    expect(dayAnomalies({ ...base, pairs: [{ in: at('18:00'), out: at('08:55') }] })).toContain('overlap');
  });
  it('일정 없는 날의 근무 · 휴가일의 기록 · 확인 안 된 근무지', () => {
    expect(dayAnomalies({ ...base, plan: null, pairs: [{ in: at('10:00'), out: at('12:00') }] })).toEqual(['no_plan_work']);
    expect(dayAnomalies({ ...base, excused: true, pairs: [{ in: at('10:00'), out: at('12:00') }] })).toEqual(['leave_day_punch']);
    expect(dayAnomalies({ ...base, pairs: [{ in: at('08:55'), out: at('18:00') }], unverified: 1 })).toEqual(['unverified_place']);
  });
  it('간주 근무일은 따지지 않는다', () => {
    expect(dayAnomalies({ ...base, deemed: true, pairs: [{ in: at('11:00'), out: at('12:00') }], missing: 'out', unverified: 2 })).toEqual([]);
  });
});

describe('정책', () => {
  const items = [
    { employeeId: 'a', workDate: '2026-10-01', types: ['late' as const] },
    { employeeId: 'a', workDate: '2026-10-02', types: ['missing_out' as const, 'late' as const] },
    { employeeId: 'b', workDate: '2026-10-02', types: ['early' as const] },
  ];
  it('기본: 퇴근 누락은 마감을 막고 지각은 확인만', () => {
    const s = summarizeAnomalies(items, DEFAULT_ANOMALY_POLICY);
    expect(Object.fromEntries(s.byEmployee)).toEqual({ a: { block: 1, check: 1 }, b: { block: 0, check: 1 } });
    expect(s.shown.map((x) => x.block)).toEqual([false, true, false]);
  });
  it('끈 유형은 목록에서 빠지지만 건수는 센다', () => {
    const s = summarizeAnomalies(items, { ...DEFAULT_ANOMALY_POLICY, late: 'off', early: 'off' });
    expect(s.shown.map((x) => [x.employeeId, x.types])).toEqual([['a', ['missing_out']]]);
    expect(s.byType.late).toBe(2);
  });
  it('검사 · 빠진 값 채우기', () => {
    expect(validateAnomalyPolicy(DEFAULT_ANOMALY_POLICY)).toEqual(DEFAULT_ANOMALY_POLICY);
    expect(validateAnomalyPolicy({ ...DEFAULT_ANOMALY_POLICY, late: 'x' })).toBeNull();
    expect(anomalyPolicyOf({ late: 'block' })).toEqual({ ...DEFAULT_ANOMALY_POLICY, late: 'block' });
  });
});
