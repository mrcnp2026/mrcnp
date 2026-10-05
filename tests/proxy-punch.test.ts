// 관리자 대리 등록 (②-3 7-6) + 직원별 날짜 기록 (기록 탭 › 직원)
import { describe, expect, it } from 'vitest';
import { buildDayDetails, isProxyCorrection } from '@/lib/day-detail';
import { applyCorrections } from '@/lib/pairs';
import { computeEmployeeDays } from '@/lib/period';
import { planProxyPunch } from '@/lib/proxy-punch';
import { kstDateTime } from '@/lib/time';
import type { PunchCorrection, PunchEvent, WorkRule } from '@/lib/types';

const RULE: WorkRule = { startTime: '09:00', endTime: '18:00', lateGraceMin: 10, breakStart: '12:00', breakEnd: '13:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7 };
const NOW = kstDateTime('2026-10-14', '12:00'); // 수요일
const base = { workDate: '2026-10-13', kind: 'out', time: '18:05', nextDay: false, reason: '폰 배터리 방전', now: NOW, effective: [], pendingSameKind: false };

describe('대리 등록 — 넣어도 되는지', () => {
  it('사유가 비거나 한 글자면 차단한다 ← 4-2', () => {
    expect(planProxyPunch({ ...base, reason: '' })).toEqual({ ok: false, code: 'reason_required' });
    expect(planProxyPunch({ ...base, reason: '.' })).toEqual({ ok: false, code: 'reason_required' });
    expect(planProxyPunch({ ...base, reason: 'x'.repeat(201) })).toEqual({ ok: false, code: 'reason_required' });
  });

  it('미래 날짜·미래 시각은 넣을 수 없다', () => {
    expect(planProxyPunch({ ...base, workDate: '2026-10-15' })).toEqual({ ok: false, code: 'future_time' });
    expect(planProxyPunch({ ...base, workDate: '2026-10-14', time: '12:01' })).toEqual({ ok: false, code: 'future_time' });
    expect(planProxyPunch({ ...base, workDate: '2026-10-14', kind: 'in', time: '09:00' }).ok).toBe(true);
  });

  it('모양이 틀린 값은 받지 않는다', () => {
    for (const bad of [{ workDate: '2026-13-01' }, { workDate: '10/13' }, { kind: 'break' }, { time: '25:00' }, { time: '9:00' }, { kind: 'in', nextDay: true }]) {
      expect(planProxyPunch({ ...base, ...bad })).toEqual({ ok: false, code: 'invalid_input' });
    }
  });

  it('자정 넘긴 퇴근은 근무일 다음 날 시각으로 계산한다', () => {
    const r = planProxyPunch({ ...base, time: '01:30', nextDay: true });
    expect(r).toEqual({ ok: true, workDate: '2026-10-13', kind: 'out', at: kstDateTime('2026-10-14', '01:30') });
  });

  it('같은 날 같은 종류 기록이 이미 있으면 넣지 않는다 (원본이든 승인된 정정이든)', () => {
    const effective = [{ kind: 'out' as const, at: kstDateTime('2026-10-13', '18:00') }];
    expect(planProxyPunch({ ...base, effective })).toEqual({ ok: false, code: 'already_exists' });
    expect(planProxyPunch({ ...base, kind: 'in', time: '09:00', effective }).ok).toBe(true);
  });

  it('직원이 보낸 대기 중 요청이 있으면 요청함에서 처리하게 한다', () => {
    expect(planProxyPunch({ ...base, pendingSameKind: true })).toEqual({ ok: false, code: 'pending_exists' });
  });

  it('퇴근이 출근보다 앞서거나 출근이 퇴근보다 뒤면 막는다', () => {
    expect(planProxyPunch({ ...base, time: '08:00', effective: [{ kind: 'in', at: kstDateTime('2026-10-13', '09:00') }] })).toEqual({ ok: false, code: 'time_order' });
    expect(planProxyPunch({ ...base, kind: 'in', time: '19:00', effective: [{ kind: 'out', at: kstDateTime('2026-10-13', '18:00') }] })).toEqual({ ok: false, code: 'time_order' });
  });
});

describe('직원별 날짜 기록', () => {
  const ev = (id: string, kind: 'in' | 'out', date: string, time: string, ipVerified = true) => ({ id, employeeId: 'e1', kind, punchedAt: kstDateTime(date, time), workDate: date, ipVerified });
  const events = [ev('a', 'in', '2026-10-12', '09:00'), ev('b', 'out', '2026-10-12', '18:00'), ev('c', 'in', '2026-10-13', '09:20', false)];
  const proxy: PunchCorrection & { requestedBy: string } = { id: 'p', correctionType: 'add_missing', targetId: null, employeeId: 'e1', workDate: '2026-10-13', kind: 'out', newPunchedAt: kstDateTime('2026-10-13', '18:05'), status: 'approved', requestedBy: 'admin1' };
  const build = (corrections: (PunchCorrection & { requestedBy: string })[], today = '2026-10-14') =>
    buildDayDetails({
      days: computeEmployeeDays({ events: events as PunchEvent[], approvedCorrections: corrections.filter((c) => c.status === 'approved'), rule: RULE, holidays: [], from: '2026-10-01', to: '2026-10-31' }),
      events, corrections, leave: new Map(), work: new Map(), ruleAt: () => RULE, today, startsOn: '2026-10-12',
    });

  it('입사 전·주말·미래는 줄이 없고, 근무일은 기록이 없어도 줄이 있다', () => {
    const d = build([]).map((x) => x.workDate);
    expect(d).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });

  it('퇴근 미기록·지각·사무실 밖을 표시하고, 넣을 수 있는 종류를 알려 준다', () => {
    const [mon, tue, wed] = build([]);
    expect(mon).toMatchObject({ missing: null, open: false, lateMinutes: 0, outside: false, canAdd: [] });
    expect(tue).toMatchObject({ missing: 'out', open: true, lateMinutes: 10, outside: true, canAdd: ['out'] });
    // 오늘: 아직 출근 전 — 결근으로 세지 않고, 출근만 넣을 수 있다 (퇴근은 본인이 찍는다)
    expect(wed).toMatchObject({ missing: null, firstIn: null, canAdd: ['in'] });
  });

  it('지난 근무일에 기록이 없으면 "기록 없음" — 출근·퇴근 둘 다 넣을 수 있다', () => {
    const d = build([], '2026-10-16').find((x) => x.workDate === '2026-10-15')!;
    expect(d).toMatchObject({ missing: 'in', canAdd: ['in', 'out'] });
  });

  it('관리자가 넣은 퇴근이 집계에 들어가고 「관리자 등록」으로 표시된다 (직원 요청 정정과 구분)', () => {
    const tue = build([proxy])[1];
    expect(tue).toMatchObject({ missing: null, open: false, proxy: true, corrected: false, canAdd: [] });
    expect(tue.lastOut).toEqual(kstDateTime('2026-10-13', '18:05'));
    expect(tue.netMinutes).toBeGreaterThan(0);
    expect(isProxyCorrection({ ...proxy, requestedBy: 'e1' })).toBe(false);
    expect(isProxyCorrection({ ...proxy, status: 'pending' })).toBe(false);
  });

  it('대리 등록은 원본 기록을 만들지 않는다 — 유효 기록에만 끼워진다 ← 4-1', () => {
    const eff = applyCorrections(events as PunchEvent[], [proxy]);
    expect(eff.length).toBe(events.length + 1);
    expect(events.length).toBe(3);
  });
});
