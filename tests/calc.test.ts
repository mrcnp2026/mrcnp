// 게이트 2 — 순수함수 검증 (①-1 11-A "시간·날짜 / 지각 / 근로시간 / 연장·야간·휴일 / 미기록 배너 / 주간 누적").
// 계정 없이 돈다. 각 it 제목 끝의 ← 표시는 체크리스트 항목이다.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { FLAG } from '@/lib/flags';
import { judgeLateness } from '@/lib/lateness';
import { findMissingPunches } from '@/lib/missing-punch';
import {
  approvedMinutes,
  buildOvertimeRequest,
  pendingMinutes,
  unreviewedMinutes,
  type OvertimeRequest,
} from '@/lib/overtime';
import { pairDay, pairsByWorkDate } from '@/lib/pairs';
import { kstDateTime, resolveWorkDate, toKstDate } from '@/lib/time';
import type { DayType, HolidayRow, PunchCorrection, PunchEvent, PunchPair, WorkRule } from '@/lib/types';
import { weeklyHours } from '@/lib/weekly-hours';
import { calcWeek, calcWorkMinutes, type WorkCtx } from '@/lib/worktime';

const RULE: WorkRule = {
  startTime: '09:00:00',
  endTime: '18:00:00',
  lateGraceMin: 10,
  breakStart: '12:00:00',
  breakEnd: '13:00:00',
  workdays: [1, 2, 3, 4, 5],
  weeklyRestDay: 7,
};
const NO_BREAK: WorkRule = { ...RULE, breakStart: null, breakEnd: null };

// 2026-10-12(월) ~ 2026-10-18(일)
const MON = '2026-10-12';
const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
const SAT = days[5];
const SUN = days[6];

const at = (d: string, t: string) => kstDateTime(d, t);
const pair = (d: string, from: string, to: string, toDate = d): PunchPair => ({ in: at(d, from), out: at(toDate, to) });
const ctx = (workDate: string, dayType: DayType = 'workday', soFar = 0, total = 0): WorkCtx => ({
  workDate,
  dayType,
  weekRegularMinutesSoFar: soFar,
  weekTotalMinutesSoFar: total,
});
const H = (h: number, m = 0) => h * 60 + m;

function expectEquation(r: { regularMinutes: number; overtimeMinutes: number; holidayMinutes: number; netMinutes: number }) {
  expect(r.regularMinutes + r.overtimeMinutes + r.holidayMinutes).toBe(r.netMinutes);
}

describe('시간·날짜', () => {
  it('한국시간 오전 9시 정각의 기록이 그날 날짜로 잡힌다 ← B-1', () => {
    const ts = new Date('2026-10-12T00:00:00Z'); // = KST 09:00
    expect(toKstDate(ts)).toBe('2026-10-12');
    expect(toKstDate(at(MON, '09:00'))).toBe(MON);
  });

  it('한국시간 자정 직후(00:10) 기록이 그날 날짜로 잡힌다 ← B-1', () => {
    const ts = new Date('2026-10-11T15:10:00Z'); // = KST 10-12 00:10
    expect(toKstDate(ts)).toBe('2026-10-12');
  });

  it('kstDateTime은 실행 PC의 시간대와 무관하게 UTC+9로 바꾼다', () => {
    expect(at(MON, '09:00').toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });

  it('퇴근은 짝 없는 직전 출근의 근무일을 상속한다 (자정 넘김) ← B-4', () => {
    const out = at('2026-10-13', '06:00');
    expect(resolveWorkDate('out', out, { workDate: MON })).toBe(MON);
    expect(resolveWorkDate('out', out, null)).toBe('2026-10-13'); // 짝 없는 퇴근 → 퇴근 날짜 (note는 punch.ts)
    expect(resolveWorkDate('in', at(MON, '00:10'), null)).toBe(MON);
  });

  it('22:00 출근 → 다음날 06:00 퇴근이 한 근무일, 8시간, 휴게 0 + 법정 휴게 미확인 ← B-4', () => {
    const r = calcWorkMinutes([pair(MON, '22:00', '06:00', '2026-10-13')], RULE, ctx(MON));
    expect(r.netMinutes).toBe(H(8));
    expect(r.breakMinutes).toBe(0);
    expect(r.nightMinutes).toBe(H(8));
    expect(r.flags).toContain(FLAG.LEGAL_BREAK_UNCONFIRMED);
  });

  it('퇴근 기록만 있고 짝이 되는 출근이 없으면 0이 아니라 flags에 남는다', () => {
    const { pairs, flags } = pairDay([{ kind: 'out', at: at(MON, '18:00'), workDate: MON }]);
    const r = calcWorkMinutes(pairs, RULE, ctx(MON));
    expect([...flags, ...r.flags]).toContain(FLAG.ORPHAN_OUT);
    expect(r.netMinutes).toBe(0);
  });
});

describe('지각 판정', () => {
  const rule = { startTime: '09:00', lateGraceMin: 10, workdays: [1, 2, 3, 4, 5] };
  it('기준 09:00 + 유예 10분일 때 09:10:00은 정시, 09:10:01은 지각', () => {
    expect(judgeLateness({ punchedAt: at(MON, '09:10:00'), workDate: MON, rule, isHoliday: false }).verdict).toBe('on_time');
    expect(judgeLateness({ punchedAt: at(MON, '09:10:01'), workDate: MON, rule, isHoliday: false }).verdict).toBe('late');
  });

  it('휴일·비근무일 출근은 not_applicable', () => {
    for (const d of [SAT, SUN]) {
      const dt = resolveDayType(d, RULE, []);
      const r = judgeLateness({ punchedAt: at(d, '11:00'), workDate: d, rule, isHoliday: dt !== 'workday' });
      expect(r.verdict).toBe('not_applicable');
    }
  });

  it('지각 시간이 분 단위 실측이다 (올림하지 않는다) ← 13장', () => {
    const r = judgeLateness({ punchedAt: at(MON, '09:23:00'), workDate: MON, rule, isHoliday: false });
    expect(r.lateMinutes).toBe(13);
    const r2 = judgeLateness({ punchedAt: at(MON, '09:11:59'), workDate: MON, rule, isHoliday: false });
    expect(r2.lateMinutes).toBe(1); // 1분 59초 → 1분 (2분·30분으로 올리지 않음)
  });

  it('reason 문자열에 기준시각·유예·실제시각이 전부 들어 있다', () => {
    const r = judgeLateness({ punchedAt: at(MON, '09:23:00'), workDate: MON, rule, isHoliday: false });
    expect(r.reason).toContain('09:00');
    expect(r.reason).toContain('10분');
    expect(r.reason).toContain('09:23');
    expect(r.reason).toContain('13분');
  });
});

describe('근로시간 (휴게 12:00~13:00)', () => {
  it('09:00~12:30 → 휴게 0, 실근로 3시간 30분 ← B-5', () => {
    const r = calcWorkMinutes([pair(MON, '09:00', '12:30')], RULE, ctx(MON));
    expect(r.breakMinutes).toBe(0);
    expect(r.netMinutes).toBe(H(3, 30));
  });
  it('09:00~18:00 → 휴게 60분, 실근로 8시간', () => {
    const r = calcWorkMinutes([pair(MON, '09:00', '18:00')], RULE, ctx(MON));
    expect(r.breakMinutes).toBe(60);
    expect(r.netMinutes).toBe(H(8));
    expect(r.flags).not.toContain(FLAG.LEGAL_BREAK_UNCONFIRMED);
  });
  it('12:30~18:00 → 휴게 30분(겹친 분만), 실근로 5시간', () => {
    const r = calcWorkMinutes([pair(MON, '12:30', '18:00')], RULE, ctx(MON));
    expect(r.breakMinutes).toBe(30);
    expect(r.netMinutes).toBe(H(5));
  });
  it('14:00~22:00 → 휴게 0, 실근로 8시간, 법정 휴게 미확인. 모자란 휴게를 더 빼지 않는다 ← B-5', () => {
    const r = calcWorkMinutes([pair(MON, '14:00', '22:00')], RULE, ctx(MON));
    expect(r.breakMinutes).toBe(0);
    expect(r.netMinutes).toBe(H(8));
    expect(r.flags).toContain(FLAG.LEGAL_BREAK_UNCONFIRMED);
  });
  it('휴게시간대가 null인 규칙이면 공제 0', () => {
    const r = calcWorkMinutes([pair(MON, '09:00', '18:00')], NO_BREAK, ctx(MON));
    expect(r.breakMinutes).toBe(0);
    expect(r.netMinutes).toBe(H(9));
  });
});

describe('연장·야간·휴일', () => {
  it('★ regular + overtime + holiday == net 이 항상 성립한다 (무작위 500건) ← B-8, B-24', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const types: DayType[] = ['workday', 'rest_off', 'holiday'];
    for (let i = 0; i < 500; i++) {
      const start = at(MON, '00:00').getTime() + Math.floor(rand() * 24 * 60) * 60_000;
      const len = Math.floor(rand() * 20 * 60) * 60_000;
      const r = calcWorkMinutes(
        [{ in: new Date(start), out: new Date(start + len) }],
        rand() < 0.5 ? RULE : NO_BREAK,
        ctx(MON, types[Math.floor(rand() * 3)], Math.floor(rand() * 3000), Math.floor(rand() * 3500)),
      );
      expectEquation(r);
      expect(r.nightMinutes).toBeGreaterThanOrEqual(0);
      expect(r.nightMinutes).toBeLessThanOrEqual(r.netMinutes);
    }
  });

  it('월요일 09:00~23:00 → 소정 8, 연장 5, 야간 1이 각각 잡히고 야간은 등식 밖 ← B-8', () => {
    const r = calcWorkMinutes([pair(MON, '09:00', '23:00')], RULE, ctx(MON));
    expect(r.regularMinutes).toBe(H(8));
    expect(r.overtimeMinutes).toBe(H(5));
    expect(r.nightMinutes).toBe(H(1));
    expect(r.netMinutes).toBe(H(13));
    expectEquation(r);
  });

  it('월~금 매일 실근로 9시간 → 매일 소정 8 + 연장 1, 주 소정 40 + 연장 5 ← B-9', () => {
    const week = calcWeek(
      days.slice(0, 5).map((d) => ({ workDate: d, pairs: [pair(d, '09:00', '19:00')], dayType: 'workday' as DayType })),
      RULE,
    );
    for (const r of week) {
      expect(r.regularMinutes).toBe(H(8));
      expect(r.overtimeMinutes).toBe(H(1));
    }
    expect(week.reduce((a, r) => a + r.regularMinutes, 0)).toBe(H(40));
    expect(week.reduce((a, r) => a + r.overtimeMinutes, 0)).toBe(H(5));
  });

  it('월~금 매일 7시간 + 토요일(휴무일) 7시간 → 토요일 소정 5 + 연장 2', () => {
    const input = [
      ...days.slice(0, 5).map((d) => ({ workDate: d, pairs: [pair(d, '09:00', '17:00')], dayType: 'workday' as DayType })),
      { workDate: SAT, pairs: [pair(SAT, '09:00', '17:00')], dayType: resolveDayType(SAT, RULE, []) },
    ];
    const week = calcWeek(input, RULE);
    expect(week[0].netMinutes).toBe(H(7));
    const sat = week[5];
    expect(sat.dayType).toBe('rest_off');
    expect(sat.regularMinutes).toBe(H(5));
    expect(sat.overtimeMinutes).toBe(H(2));
  });

  it('월요일 실근로를 정정으로 바꾸면 같은 주 뒤쪽 날의 소정·연장이 다시 계산된다 ← B-25', () => {
    const mk = (monOut: string) => [
      { workDate: MON, pairs: [pair(MON, '09:00', monOut)], dayType: 'workday' as DayType },
      ...days.slice(1, 5).map((d) => ({ workDate: d, pairs: [pair(d, '09:00', '18:00')], dayType: 'workday' as DayType })),
      { workDate: SAT, pairs: [pair(SAT, '09:00', '17:00')], dayType: 'rest_off' as DayType },
    ];
    // 월요일이 4시간(09~13 → 휴게 1시간 빼고 3시간)이면 토요일까지 소정 여유가 남는다
    const before = calcWeek(mk('13:00'), RULE);
    expect(before[5].regularMinutes).toBe(H(5));
    // 정정으로 월요일 퇴근이 18:00이 되면 주 40시간이 금요일에 차서 토요일은 전부 연장
    const after = calcWeek(mk('18:00'), RULE);
    expect(after[5].regularMinutes).toBe(0);
    expect(after[5].overtimeMinutes).toBe(H(7));
    expect(after[5].weekRegularMinutesSoFar).toBe(H(40));
  });

  it('20:00 출근 → 다음날 04:00 퇴근에서 야간이 6시간 (22~24 + 00~04) ← B-10', () => {
    const r = calcWorkMinutes([pair(MON, '20:00', '04:00', '2026-10-13')], RULE, ctx(MON));
    expect(r.nightMinutes).toBe(H(6));
  });

  it('주휴일(일요일) 10시간 → 소정 0, 연장 0, 휴일 10(8 + 2), 지각 판정 안 함 ← B-24', () => {
    const dt = resolveDayType(SUN, RULE, []);
    expect(dt).toBe('holiday');
    const r = calcWorkMinutes([pair(SUN, '08:00', '19:00')], RULE, ctx(SUN, dt));
    expect(r.regularMinutes).toBe(0);
    expect(r.overtimeMinutes).toBe(0);
    expect(r.holidayMinutes).toBe(H(10));
    expect(r.holidayWithin8Minutes).toBe(H(8));
    expect(r.holidayOver8Minutes).toBe(H(2));
    expectEquation(r);
    const l = judgeLateness({ punchedAt: at(SUN, '08:00'), workDate: SUN, rule: RULE, isHoliday: dt !== 'workday' });
    expect(l.verdict).toBe('not_applicable');
  });

  it('공휴일(public)도 휴일 축으로 간다', () => {
    const hol: HolidayRow[] = [{ date: '2026-10-09', kind: 'public' }]; // 한글날(금)
    expect(resolveDayType('2026-10-09', RULE, hol)).toBe('holiday');
    const r = calcWorkMinutes([pair('2026-10-09', '09:00', '18:00')], RULE, ctx('2026-10-09', 'holiday'));
    expect(r.holidayMinutes).toBe(H(8));
    expect(r.regularMinutes + r.overtimeMinutes).toBe(0);
  });

  it('토요일(휴무일)·회사 지정 휴무(company)는 휴일 축이 아니라 소정·연장으로 간다', () => {
    expect(resolveDayType(SAT, RULE, [])).toBe('rest_off');
    expect(resolveDayType(MON, RULE, [{ date: MON, kind: 'company' }])).toBe('rest_off');
    const r = calcWorkMinutes([pair(MON, '09:00', '18:00')], RULE, ctx(MON, 'rest_off'));
    expect(r.holidayMinutes).toBe(0);
    expect(r.regularMinutes).toBe(H(8));
  });

  it('주 52시간 판정 합계에 휴일근로가 포함되고, 넘어도 기록은 막히지 않는다 ← 7-6 요점 5, 4-3', () => {
    // 월~토 각 8시간 소정·연장 = 48시간, 일요일 휴일 5시간 → 53시간
    const input = [
      ...days.slice(0, 6).map((d, i) => ({
        workDate: d,
        pairs: [pair(d, '09:00', '18:00')],
        dayType: (i < 5 ? 'workday' : 'rest_off') as DayType,
      })),
      { workDate: SUN, pairs: [pair(SUN, '13:00', '18:00')], dayType: 'holiday' as DayType },
    ];
    const week = calcWeek(input, RULE);
    expect(week[5].flags).not.toContain(FLAG.WEEKLY_LIMIT_EXCEEDED); // 48시간
    expect(week[6].flags).toContain(FLAG.WEEKLY_LIMIT_EXCEEDED); // 휴일 포함 53시간
    expect(week[6].holidayMinutes).toBe(H(5)); // 숫자는 그대로 (막지 않음)
  });

  it('연장 30분 미만은 승인 대기에 안 올라가고, 그 분은 unreviewed로 그대로 남는다 ← B-28', () => {
    const work = { overtimeMinutes: 29, nightMinutes: 0, holidayMinutes: 0 };
    const t = OFFICE.overtimeReviewThresholdMin;
    expect(buildOvertimeRequest({ employeeId: 'e', workDate: MON, work, thresholdMinutes: t })).toBeNull();
    expect(unreviewedMinutes({ work, thresholdMinutes: t })).toEqual({ overtime: 29, night: 0 });
    const work30 = { ...work, overtimeMinutes: 30 };
    expect(buildOvertimeRequest({ employeeId: 'e', workDate: MON, work: work30, thresholdMinutes: t })).not.toBeNull();
    expect(unreviewedMinutes({ work: work30, thresholdMinutes: t })).toEqual({ overtime: 0, night: 0 });
  });

  it('연장이 0이어도 휴일 근로가 있으면 승인 대기에 올라간다', () => {
    const d = buildOvertimeRequest({
      employeeId: 'e',
      workDate: SUN,
      work: { overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 10 },
      thresholdMinutes: 30,
    });
    expect(d?.holidayMinutes).toBe(10);
  });

  const req = (p: Partial<OvertimeRequest>): OvertimeRequest => ({
    status: 'approved',
    overtimeMinutes: 0,
    nightMinutes: 0,
    holidayMinutes: 0,
    approvedMinutes: null,
    approvedNightMinutes: null,
    approvedHolidayMinutes: null,
    ...p,
  });

  it('휴일 10시간 중 6시간만 승인 → within8=6, over8=0 (8시간 이내부터 채운다)', () => {
    const a = approvedMinutes(req({ holidayMinutes: H(10), approvedHolidayMinutes: H(6) }));
    expect(a.holidayWithin8).toBe(H(6));
    expect(a.holidayOver8).toBe(0);
    const full = approvedMinutes(req({ holidayMinutes: H(10) }));
    expect([full.holidayWithin8, full.holidayOver8]).toEqual([H(8), H(2)]);
  });

  it('거부하면 인정 0 — 집계분(사실)은 입력 그대로 남는다 ← 7-7 요점 1', () => {
    const r = req({ status: 'rejected', overtimeMinutes: 90 });
    expect(approvedMinutes(r).overtime).toBe(0);
    expect(r.overtimeMinutes).toBe(90);
  });

  it('pending 연장은 0도 전액 인정도 아니고 별도 칸(pending)에 뜬다 ← 7-7 요점 3', () => {
    const r = req({ status: 'pending', overtimeMinutes: 90, nightMinutes: 30 });
    expect(approvedMinutes(r).overtime).toBe(0);
    expect(pendingMinutes(r)).toEqual({ overtime: 90, night: 30, holiday: 0 });
  });

  it('퇴근 기록이 없는 날은 0시간이 아니라 퇴근 미기록 flags로 나오고, 자동으로 채워지지 않는다 ← B-11, 4-8', () => {
    const { pairs } = pairDay([{ kind: 'in', at: at(MON, '09:00'), workDate: MON }]);
    expect(pairs).toEqual([{ in: at(MON, '09:00'), out: null }]); // 퇴근은 null 그대로
    const r = calcWorkMinutes(pairs, RULE, ctx(MON));
    expect(r.flags).toContain(FLAG.MISSING_OUT);
  });
});

describe('정정 적용 (원본은 그대로)', () => {
  const ev = (id: string, kind: 'in' | 'out', d: string, t: string, workDate = d): PunchEvent => ({
    id,
    employeeId: 'e1',
    kind,
    punchedAt: at(d, t),
    workDate,
  });
  const corr = (p: Partial<PunchCorrection>): PunchCorrection => ({
    id: 'c',
    correctionType: 'add_missing',
    targetId: null,
    employeeId: 'e1',
    workDate: MON,
    kind: 'out',
    newPunchedAt: at(MON, '21:40'),
    status: 'approved',
    ...p,
  });

  it('승인된 add_missing이 빠진 퇴근을 채우고, 원본 배열은 바뀌지 않는다', () => {
    const events = [ev('a', 'in', MON, '09:00')];
    const copy = structuredClone(events);
    const m = pairsByWorkDate(events, [corr({})]);
    expect(m.get(MON)?.pairs).toEqual([{ in: at(MON, '09:00'), out: at(MON, '21:40') }]);
    expect(events).toEqual(copy);
  });

  it('pending·rejected 정정은 적용되지 않는다', () => {
    const m = pairsByWorkDate([ev('a', 'in', MON, '09:00')], [corr({ status: 'pending' }), corr({ status: 'rejected' })]);
    expect(m.get(MON)?.pairs[0].out).toBeNull();
  });

  it('modify는 시각을 바꾸고 void는 기록을 집계에서 뺀다', () => {
    const events = [ev('a', 'in', MON, '09:00'), ev('b', 'out', MON, '18:00'), ev('x', 'in', MON, '09:01')];
    const m = pairsByWorkDate(events, [
      corr({ correctionType: 'modify', targetId: 'b', kind: null, newPunchedAt: at(MON, '20:00') }),
      corr({ correctionType: 'void', targetId: 'x', kind: null, newPunchedAt: null }),
    ]);
    expect(m.get(MON)).toEqual({ pairs: [{ in: at(MON, '09:00'), out: at(MON, '20:00') }], flags: [] });
  });
});

describe('미기록 배너', () => {
  const ev = (kind: 'in' | 'out', d: string, t: string): PunchEvent => ({
    id: `${kind}${d}${t}`,
    employeeId: 'e1',
    kind,
    punchedAt: at(d, t),
    workDate: d,
  });
  const dayTypes: Record<string, DayType> = Object.fromEntries(days.map((d) => [d, resolveDayType(d, RULE, [])]));
  const base = {
    employeeId: 'e1',
    approvedCorrections: [] as PunchCorrection[],
    pendingCorrections: [] as PunchCorrection[],
    rule: RULE,
    dayTypes,
    outGraceHours: 2,
    inGraceMin: 30,
  };

  it('퇴근을 안 찍은 근무일이 있으면 그 날짜를 돌려준다', () => {
    const r = findMissingPunches({ ...base, events: [ev('in', MON, '09:00')], now: at('2026-10-13', '08:00') });
    expect(r).toContainEqual({ workDate: MON, kind: 'out', hasPendingRequest: false });
  });

  it('기준 퇴근 + 2시간이 지나기 전에는 대상이 아니다', () => {
    const events = [ev('in', MON, '09:00')];
    expect(findMissingPunches({ ...base, events, now: at(MON, '19:59') }).some((x) => x.kind === 'out')).toBe(false);
    expect(findMissingPunches({ ...base, events, now: at(MON, '20:01') }).some((x) => x.kind === 'out')).toBe(true);
  });

  it('휴일·휴무일에는 출근 미기록 대상이 아니다 (평일은 대상)', () => {
    const r = findMissingPunches({ ...base, events: [], now: at('2026-10-19', '08:00'), lookbackDays: 8 });
    const ins = r.filter((x) => x.kind === 'in').map((x) => x.workDate);
    expect(ins).toEqual(days.slice(0, 5));
    expect(ins).not.toContain(SAT);
    expect(ins).not.toContain(SUN);
  });

  it('이미 정정 요청을 넣은 날은 hasPendingRequest: true', () => {
    const pending: PunchCorrection = {
      id: 'p',
      correctionType: 'add_missing',
      targetId: null,
      employeeId: 'e1',
      workDate: MON,
      kind: 'out',
      newPunchedAt: at(MON, '21:00'),
      status: 'pending',
    };
    const r = findMissingPunches({
      ...base,
      events: [ev('in', MON, '09:00')],
      pendingCorrections: [pending],
      now: at('2026-10-13', '08:00'),
    });
    expect(r).toContainEqual({ workDate: MON, kind: 'out', hasPendingRequest: true });
  });

  it('승인된 add_missing이 있는 날은 대상이 아니다', () => {
    const approved: PunchCorrection = {
      id: 'a',
      correctionType: 'add_missing',
      targetId: null,
      employeeId: 'e1',
      workDate: MON,
      kind: 'out',
      newPunchedAt: at(MON, '21:00'),
      status: 'approved',
    };
    const r = findMissingPunches({
      ...base,
      events: [ev('in', MON, '09:00')],
      approvedCorrections: [approved],
      now: at('2026-10-13', '08:00'),
    });
    expect(r.some((x) => x.workDate === MON && x.kind === 'out')).toBe(false);
  });

  it('야간 근무 중(22:00 출근, 23:00에 앱 열기)에는 퇴근 미기록 배너가 뜨지 않는다', () => {
    const r = findMissingPunches({ ...base, events: [ev('in', MON, '22:00')], now: at(MON, '23:00') });
    expect(r.some((x) => x.kind === 'out')).toBe(false);
  });

  it('코드베이스에 푸시·문자 발송·예약 작업(cron) 코드가 없다 ← 3장', () => {
    const root = path.join(import.meta.dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|json)$/.test(f)) files.push(p);
      }
    };
    walk(path.join(root, 'src'));
    files.push(path.join(root, 'package.json'));
    const banned = /web-push|pushManager|PushSubscription|node-cron|"crons"|twilio|aligo|kakao.*alimtalk|sendSms/i;
    const hits = files.filter((f) => banned.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});

describe('주간 누적', () => {
  it('월~일 KST 근무일로 합산 — 일요일 23시 기록(근무일 일요일)이 다음 주로 넘어가지 않는다', () => {
    const r = weeklyHours({
      weekStart: MON,
      dailyWork: [
        { workDate: SUN, netMinutes: 120 }, // 일요일 22:00~다음날 00:00 근무도 근무일은 일요일
        { workDate: '2026-10-19', netMinutes: 999 }, // 다음 주 월요일 — 빠져야 함
      ],
      is5OrMore: true,
    });
    expect(r.totalMinutes).toBe(120);
  });

  it('48시간이면 주의(caution), 52시간 초과면 한도 초과(over)', () => {
    const one = (m: number) => weeklyHours({ weekStart: MON, dailyWork: [{ workDate: MON, netMinutes: m }], is5OrMore: true });
    expect(one(H(47, 59)).level).toBe('normal');
    expect(one(H(48)).level).toBe('caution');
    expect(one(H(52)).level).toBe('caution');
    expect(one(H(52, 1)).level).toBe('over');
  });

  it('5인 미만 설정이면 색 없이 숫자만', () => {
    const r = weeklyHours({ weekStart: MON, dailyWork: [{ workDate: MON, netMinutes: H(53) }], is5OrMore: false });
    expect(r.colored).toBe(false);
    expect(r.totalMinutes).toBe(H(53));
  });
});

describe('금액 경계 (4-4)', () => {
  it('마이그레이션 어디에도 금액 컬럼(원·amount·wage·rate)이 없다', () => {
    const dir = path.join(import.meta.dirname, '..', 'supabase', 'migrations');
    for (const f of readdirSync(dir)) {
      const sql = readFileSync(path.join(dir, f), 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n');
      expect(sql).not.toMatch(/\b(amount|wage|salary|hourly_rate|pay_rate)\b|\b\w+_won\b/i);
    }
  });
});
