// 잔업 일정대로 인정 (급여-76, 2026-11-05) — 시프티 「잔여 근무(잔업 17:30~20:30) · 잔업 3H」. 일정 안에서 퇴근해도 일정 끝까지, 넘기면 15분 단위로 더한다
import { expect, it } from 'vitest';
import { planDay } from '@/lib/shifts';
import { kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';
import { calcWorkMinutes } from '@/lib/worktime';

const BASE: WorkRule = { startTime: '08:00', endTime: '17:00', lateGraceMin: 0, breakStart: '12:00', breakEnd: '13:00', extraBreaks: [{ start: '17:00', end: '17:30' }], roundStepMin: 15, clipBeforeStart: true, workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7 };
const day = '2026-11-05';
const at = (hm: string) => kstDateTime(day, hm);
const ctx = { workDate: day, dayType: 'workday' as const, weekRegularMinutesSoFar: 0, weekTotalMinutesSoFar: 0 };
const shift = (startTime: string, endTime: string, kind: 'normal' | 'extra') => ({ id: kind, employeeId: 'e', workDate: day, startTime, endTime, kind, templateId: null, note: null });
const withExtra = planDay({ rule: BASE, tpl: null, shifts: [shift('08:00', '17:00', 'normal'), shift('17:30', '20:30', 'extra')], isWorkday: true }).rule!;
const ot = (rule: WorkRule, inHm: string, outHm: string) => calcWorkMinutes([{ in: at(inHm), out: at(outHm) }], rule, ctx).overtimeMinutes;

it('잔업 일정 · 20:20 퇴근 → 일정대로 3시간', () => expect(ot(withExtra, '07:50', '20:20')).toBe(180));
it('잔업 일정 · 20:55 퇴근 → 20:30 넘긴 15분 더해 3시간 15분', () => expect(ot(withExtra, '07:50', '20:55')).toBe(195));
it('잔업 일정 · 19:00 퇴근 → 3시간 그대로 (조퇴는 근태 점검이 띄운다)', () => expect(ot(withExtra, '07:50', '19:00')).toBe(180));
it('잔업 일정 · 17:20 퇴근(잔업 시작 전) → 늘리지 않는다', () => expect(ot(withExtra, '07:50', '17:20')).toBe(0));
it('잔업 일정 없음 · 20:20 퇴근 → 지금 계산 그대로 2시간 45분', () => expect(ot(BASE, '07:50', '20:20')).toBe(165));
it('잔업 일정 · 3시간 늦게 온 날도 17:30 뒤는 연장 (급여-61)', () => expect(ot(withExtra, '11:00', '20:20')).toBe(180));
