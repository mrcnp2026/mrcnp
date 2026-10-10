// 근무일정 틀 (2026-10-10) — 직원별 시작·끝 시각, 간주 근무
import { describe, expect, it } from 'vitest';
import { judgeLateness } from '@/lib/lateness';
import { computeEmployeeDays } from '@/lib/period';
import { applyTemplate, deemedPair, planDay, spanMinutes, validateShift, validateTemplate, type DayShift, type ShiftTemplate } from '@/lib/shifts';
import { kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';

const RULE: WorkRule = { startTime: '09:00', endTime: '18:00', lateGraceMin: 0, breakStart: '12:00', breakEnd: '13:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7 };
const EARLY = { startTime: '07:30', endTime: '17:00' };

describe('틀 끼우기', () => {
  it('시작·끝 시각만 바뀌고 나머지 규칙은 그대로', () => {
    expect(applyTemplate(RULE, EARLY)).toEqual({ ...RULE, startTime: '07:30', endTime: '17:00' });
    expect(applyTemplate(RULE, null)).toBe(RULE);
    expect(applyTemplate(null, EARLY)).toBeNull();
  });
  it('지각은 그 직원의 틀 시작 시각으로 판정한다 (07:30 틀인데 07:45 출근 = 15분 지각, 회사 규칙으로는 지각 아님)', () => {
    const at = kstDateTime('2026-10-12', '07:45');
    const mine = judgeLateness({ punchedAt: at, workDate: '2026-10-12', rule: applyTemplate(RULE, EARLY)!, isHoliday: false });
    expect(mine.verdict).toBe('late');
    expect(mine.verdict === 'late' && mine.lateMinutes).toBe(15);
    expect(judgeLateness({ punchedAt: at, workDate: '2026-10-12', rule: RULE, isHoliday: false }).verdict).not.toBe('late');
  });
});

describe('간주 근무', () => {
  const T = { startTime: '08:00', endTime: '17:00' };
  it('지난 날은 시작~끝 전부, 오늘은 시작 뒤에 생기고 끝 전에는 근무 중, 앞날은 없다', () => {
    const p = deemedPair(T, '2026-10-08', kstDateTime('2026-10-09', '10:00'))!;
    expect(p.in).toEqual(kstDateTime('2026-10-08', '08:00'));
    expect(p.out).toEqual(kstDateTime('2026-10-08', '17:00'));
    expect(deemedPair(T, '2026-10-09', kstDateTime('2026-10-09', '07:59'))).toBeNull();
    expect(deemedPair(T, '2026-10-09', kstDateTime('2026-10-09', '10:00'))).toEqual({ in: kstDateTime('2026-10-09', '08:00'), out: null });
    expect(deemedPair(T, '2026-10-10', kstDateTime('2026-10-09', '10:00'))).toBeNull();
  });
  it('찍지 않은 근무일만 근무로 잡힌다 — 휴일에는 생기지 않고, 찍은 날은 기록이 먼저', () => {
    const now = kstDateTime('2026-10-20', '12:00');
    const rule = applyTemplate(RULE, T)!;
    const punched = [
      { id: 'a', employeeId: 'e', kind: 'in' as const, punchedAt: kstDateTime('2026-10-13', '10:00'), workDate: '2026-10-13' },
      { id: 'b', employeeId: 'e', kind: 'out' as const, punchedAt: kstDateTime('2026-10-13', '15:00'), workDate: '2026-10-13' },
    ];
    const days = computeEmployeeDays({ events: punched, approvedCorrections: [], rule, holidays: [], from: '2026-10-12', to: '2026-10-18', deemed: (d, dayType) => (dayType === 'workday' ? deemedPair(T, d, now) : null) });
    const of = (d: string) => days.find((x) => x.workDate === d)!;
    expect(of('2026-10-12').pairs).toHaveLength(1); // 월: 간주
    expect(of('2026-10-12').netMinutes).toBe(8 * 60); // 08–17에서 휴게 1시간
    expect(of('2026-10-13').pairs[0].in).toEqual(kstDateTime('2026-10-13', '10:00')); // 화: 찍은 기록 그대로
    expect(of('2026-10-13').netMinutes).toBe(4 * 60);
    expect(of('2026-10-17').pairs).toHaveLength(0); // 토: 근무일 아님
    expect(of('2026-10-18').pairs).toHaveLength(0); // 일
    // 간주가 없으면 찍지 않은 날은 빈 날
    const plain = computeEmployeeDays({ events: punched, approvedCorrections: [], rule, holidays: [], from: '2026-10-12', to: '2026-10-18' });
    expect(plain.find((x) => x.workDate === '2026-10-12')!.pairs).toHaveLength(0);
  });
});

describe('틀 입력값', () => {
  const ok = { name: ' 조기 07:30 ', startTime: '07:30', endTime: '17:00', kind: 'none', color: 'ok', memo: '' };
  it('다듬어서 받는다', () => {
    expect(validateTemplate(ok)).toEqual({ ok: true, value: { name: '조기 07:30', startTime: '07:30', endTime: '17:00', kind: 'none', color: 'ok', memo: null } });
    expect(spanMinutes(ok)).toBe(570);
  });
  it('틀린 값은 거절한다', () => {
    expect(validateTemplate({ ...ok, name: '' })).toEqual({ ok: false, code: 'invalid_template_name' });
    expect(validateTemplate({ ...ok, startTime: '17:00', endTime: '07:30' })).toEqual({ ok: false, code: 'invalid_time' });
    expect(validateTemplate({ ...ok, endTime: '25:00' })).toEqual({ ok: false, code: 'invalid_time' });
    expect(validateTemplate({ ...ok, kind: 'x' })).toEqual({ ok: false, code: 'invalid_input' });
    expect(validateTemplate({ ...ok, color: '#fff' })).toEqual({ ok: false, code: 'invalid_input' });
    expect(validateTemplate({ ...ok, memo: '가'.repeat(201) })).toEqual({ ok: false, code: 'invalid_input' });
  });
});

describe('하루 일정 정하기 (날짜별 일정 → 평소 틀 → 회사 규칙)', () => {
  const TPL: ShiftTemplate = { id: 't', name: '조기 07:30', startTime: '07:30', endTime: '17:00', kind: 'none', color: 'ok', memo: null, active: true };
  const sh = (o: Partial<DayShift>): DayShift => ({ id: 'x', employeeId: 'e', workDate: '2026-10-12', startTime: '08:00', endTime: '17:00', kind: 'none', templateId: null, note: null, ...o });
  it('일정이 없는 근무일: 평소 틀, 틀도 없으면 회사 규칙', () => {
    const a = planDay({ rule: RULE, tpl: TPL, shifts: [], isWorkday: true });
    expect([a.rule!.startTime, a.rule!.endTime]).toEqual(['07:30', '17:00']);
    expect(a.items).toMatchObject([{ source: 'template', name: '조기 07:30' }]);
    const b = planDay({ rule: RULE, tpl: null, shifts: [], isWorkday: true });
    expect(b.items).toMatchObject([{ source: 'rule', startTime: '09:00', endTime: '18:00' }]);
    expect(b.rule).toEqual(RULE);
  });
  it('일정이 없는 휴일: 보일 일정이 없다', () => {
    expect(planDay({ rule: RULE, tpl: TPL, shifts: [], isWorkday: false }).items).toEqual([]);
  });
  it('그날 넣은 일정이 평소 틀을 대신한다', () => {
    const p = planDay({ rule: RULE, tpl: TPL, shifts: [sh({ startTime: '10:00', endTime: '15:00' })], isWorkday: true });
    expect([p.rule!.startTime, p.rule!.endTime]).toEqual(['10:00', '15:00']);
    expect(p.items).toHaveLength(1);
    expect(p.items[0].source).toBe('shift');
  });
  it('잔업은 평소 일정을 그대로 두고 끝 시각만 늘린다', () => {
    const p = planDay({ rule: RULE, tpl: TPL, shifts: [sh({ id: 'ot', kind: 'extra', startTime: '17:30', endTime: '20:30' })], isWorkday: true });
    expect([p.rule!.startTime, p.rule!.endTime]).toEqual(['07:30', '20:30']);
    expect(p.items.map((i) => i.source)).toEqual(['template', 'shift']);
  });
  it('휴일의 특근 일정: 그날 시각이 일정대로 (휴일 여부는 그대로 따로 판정한다)', () => {
    const p = planDay({ rule: RULE, tpl: TPL, shifts: [sh({ kind: 'holiday' })], isWorkday: false });
    expect([p.rule!.startTime, p.rule!.endTime]).toEqual(['08:00', '17:00']);
    expect(p.deemed).toBeNull();
  });
  it('간주 근무: 평소 틀이 간주면 근무일에, 그날 일정이 간주면 그날에', () => {
    const deemedTpl = { ...TPL, kind: 'deemed' as const };
    expect(planDay({ rule: RULE, tpl: deemedTpl, shifts: [], isWorkday: true }).deemed).toEqual({ startTime: '07:30', endTime: '17:00' });
    expect(planDay({ rule: RULE, tpl: deemedTpl, shifts: [], isWorkday: false }).deemed).toBeNull();
    expect(planDay({ rule: RULE, tpl: null, shifts: [sh({ kind: 'deemed' })], isWorkday: false }).deemed).toEqual({ startTime: '08:00', endTime: '17:00' });
    // 간주 틀인 사람도 그날 다른 일정을 넣으면 그날은 간주가 아니다
    expect(planDay({ rule: RULE, tpl: deemedTpl, shifts: [sh({ kind: 'outside' })], isWorkday: true }).deemed).toBeNull();
  });
  it('일정 입력값 검사', () => {
    const ok = { date: '2026-10-17', startTime: '08:00', endTime: '17:00', kind: 'holiday', templateId: '', note: ' 특근 ', employeeIds: ['11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'] };
    expect(validateShift(ok)).toEqual({ ok: true, value: { date: '2026-10-17', startTime: '08:00', endTime: '17:00', kind: 'holiday', templateId: null, note: '특근', employeeIds: ['11111111-1111-1111-1111-111111111111'] } });
    expect(validateShift({ ...ok, date: '2026-13-40' })).toEqual({ ok: false, code: 'invalid_date' });
    expect(validateShift({ ...ok, endTime: '07:00' })).toEqual({ ok: false, code: 'invalid_time' });
    expect(validateShift({ ...ok, employeeIds: [] })).toEqual({ ok: false, code: 'no_people' });
    expect(validateShift({ ...ok, employeeIds: ['x'] })).toEqual({ ok: false, code: 'invalid_input' });
  });
});
