// 근태 점검 — 하루 판정 (급여-69 · 근태 점검 문서의 1단계 시험 사례)
import { describe, expect, it } from 'vitest';
import { bundleMonth, countDays, judgeDay, type DayCheckInput } from '@/lib/attendance-check';

const D = '2026-10-28';
const at = (hms: string, d = D) => new Date(`${d}T${hms.length === 5 ? hms + ':00' : hms}+09:00`);
const lunch = [{ start: '12:00', end: '13:00' }, { start: '17:00', end: '17:30' }];
const base: DayCheckInput = { workDate: D, plan: { startTime: '07:30', endTime: '17:00' }, breaks: lunch, roundStepMin: 15, pairs: [], deemed: false, fullLeave: false, missing: null, recordError: false, pending: false, approvedExtraMin: 0, waivedBreakMin: 0 };
const kinds = (r: ReturnType<typeof judgeDay>) => r.parts.map((p) => `${p.kind}:${p.minutes}:${p.state}`);

describe('근태 점검 하루 판정', () => {
  it('정원채 10/28 — 일정 07–17, 05:00→15:01, 15–17 연차 승인(기준이 07–15로 줄어 있음) → 일정 전 근무 2시간 판단 필요, 15시 뒤는 안 걸림', () => {
    const r = judgeDay({ ...base, plan: { startTime: '07:00', endTime: '15:00' }, pairs: [{ in: at('05:00:39'), out: at('15:01:41') }] });
    expect(kinds(r)).toEqual(['before_start:120:decide']);
    expect(r.parts[0]).toMatchObject({ plan: '07:00', punched: '05:00', counted: '05:00' });
    expect(r.state).toBe('decide');
  });
  it('정재호 — 일정 08시, 11:00 출근, 요청 없음 → 늦은 출근 3시간 판단 필요', () => {
    const r = judgeDay({ ...base, plan: { startTime: '08:00', endTime: '17:00' }, pairs: [{ in: at('11:00'), out: at('17:00') }] });
    expect(kinds(r)).toEqual(['late_in:180:decide']);
  });
  it('일정 07:30, 07:31 출근 → 늦은 출근(계산 07:45, 15분 차감)', () => {
    const r = judgeDay({ ...base, pairs: [{ in: at('07:31'), out: at('17:00') }] });
    expect(kinds(r)).toEqual(['late_in:15:decide']);
    expect(r.parts[0].counted).toBe('07:45');
  });
  it('일정 07:30, 07:16 출근 → 차이 없음', () => {
    expect(judgeDay({ ...base, pairs: [{ in: at('07:16'), out: at('17:00') }] }).state).toBeNull();
  });
  it('일정 07:30, 07:15 출근 → 일정 전 근무 15분 판단 필요', () => {
    expect(kinds(judgeDay({ ...base, pairs: [{ in: at('07:15'), out: at('17:00') }] }))).toEqual(['before_start:15:decide']);
  });
  it('늦은 출근 1시간 30분인데 휴게 안 함 승인이 1시간만 → 남은 30분 판단 필요', () => {
    const r = judgeDay({ ...base, pairs: [{ in: at('09:00'), out: at('17:00') }], waivedBreakMin: 60 });
    expect(r.parts[0]).toMatchObject({ kind: 'late_in', minutes: 90, covered: 60, state: 'decide' });
  });
  it('지각 1시간을 휴게 안 함 1시간(승인)이 전부 덮으면 확인만 — 경고 없음', () => {
    const r = judgeDay({ ...base, pairs: [{ in: at('08:30'), out: at('17:00') }], waivedBreakMin: 60 });
    expect(kinds(r)).toEqual(['late_in:60:confirm']);
    expect(r.state).toBe('confirm');
  });
  it('하루 연차인데 기록 있음 → 휴가일 기록 판단 필요', () => {
    expect(kinds(judgeDay({ ...base, fullLeave: true, pairs: [{ in: at('07:30'), out: at('17:00') }] }))).toEqual(['leave_day_punch:0:decide']);
  });
  it('하루 연차 · 기록 없음 → 아무것도 없음', () => {
    expect(judgeDay({ ...base, fullLeave: true }).state).toBeNull();
  });
  it('출근만 있고 퇴근 없음 → 마감 막음, 퇴근 쪽은 따지지 않음', () => {
    const r = judgeDay({ ...base, pairs: [{ in: at('07:20'), out: null }], missing: 'out' });
    expect(kinds(r)).toEqual(['missing_out:0:block']);
    expect(r.state).toBe('block');
  });
  it('처리 전 요청이 있으면 마감 막음', () => {
    expect(judgeDay({ ...base, pending: true, pairs: [{ in: at('07:20'), out: at('17:00') }] }).state).toBe('block');
  });
  it('일정 후 근무는 승인된 연장이 덮는 만큼 확인만, 17:00–17:30 휴게는 빼고 센다', () => {
    const r = judgeDay({ ...base, pairs: [{ in: at('07:20'), out: at('19:00') }], approvedExtraMin: 90 });
    expect(kinds(r)).toEqual(['after_end:90:confirm']);
    expect(kinds(judgeDay({ ...base, pairs: [{ in: at('07:20'), out: at('19:00') }], approvedExtraMin: 30 }))).toEqual(['after_end:90:decide']);
  });
  it('이른 퇴근 — 일정 끝 전 퇴근, 덮는 것 없음 → 판단 필요(퇴근 11:28은 11:15로 내리고, 점심은 빼고 센다)', () => {
    expect(kinds(judgeDay({ ...base, pairs: [{ in: at('07:20'), out: at('11:28') }] }))).toEqual(['early_out:285:decide']);
  });
  it('일정 없는 날 근무 — 승인된 휴일근로가 없으면 근무 분 전부 판단 필요, 있으면 확인만', () => {
    const p = { ...base, plan: null, pairs: [{ in: at('08:00'), out: at('12:00') }] };
    expect(kinds(judgeDay(p))).toEqual(['no_plan_work:240:decide']);
    expect(judgeDay({ ...p, approvedExtraMin: 240 }).state).toBe('confirm');
  });
  it('간주 근무는 판정하지 않는다', () => {
    expect(judgeDay({ ...base, deemed: true, pairs: [{ in: at('11:00'), out: at('12:00') }] }).state).toBeNull();
  });
  it('일정은 있는데 기록이 없으면(결근일 수 있음) 판단 필요', () => {
    expect(kinds(judgeDay({ ...base, missing: 'in' }))).toEqual(['missing_in:0:decide']);
  });
});

describe('직원 줄 숫자', () => {
  const days = [
    judgeDay({ ...base, workDate: '2026-10-01', plan: { startTime: '07:30', endTime: '17:00' }, pairs: [{ in: at('08:00', '2026-10-01'), out: at('17:00', '2026-10-01') }] }),
    judgeDay({ ...base, workDate: '2026-10-02', pairs: [{ in: at('08:00', '2026-10-02'), out: at('17:00', '2026-10-02') }] }),
    judgeDay({ ...base, workDate: '2026-10-05', pairs: [{ in: at('07:20', '2026-10-05'), out: null }], missing: 'out' }),
    judgeDay({ ...base, workDate: '2026-10-06', pairs: [{ in: at('08:00', '2026-10-06'), out: at('17:00', '2026-10-06') }], waivedBreakMin: 30 }),
  ];
  it('하루 = 1건으로 센다, 처리한 날은 빠지고 막음은 처리 표시로 풀리지 않는다', () => {
    expect(countDays(days)).toMatchObject({ block: 1, decide: 2, confirm: 1, open: 4, top: 'late_in' });
    expect(countDays(days, new Set(['2026-10-01', '2026-10-05']))).toMatchObject({ block: 1, decide: 1, confirm: 1, open: 3 });
  });
});

describe('2026-11-03 의뢰인 — 시작 시각 기준 · 일찍 출근 기준 · 한 달 1건', () => {
  const at740 = { ...base, plan: { startTime: '07:40', endTime: '17:00' } };
  it('일정 07:40, 07:35 출근 → 늦은 출근 아님(계산 07:40), 07:41 출근 → 늦은 출근 5분(07:45)', () => {
    expect(judgeDay({ ...at740, pairs: [{ in: at('07:35'), out: at('17:00') }] }).state).toBeNull();
    expect(kinds(judgeDay({ ...at740, pairs: [{ in: at('07:41'), out: at('17:00') }] }))).toEqual(['late_in:5:decide']);
  });
  it('일찍 출근이 기준(60분) 이내면 흐리게만 — 숫자에서 빠짐, 넘으면 판단 필요', () => {
    const r = judgeDay({ ...base, earlyIgnoreMin: 60, pairs: [{ in: at('06:40'), out: at('17:00') }] });
    expect(r.state).toBeNull();
    expect(r.parts[0]).toMatchObject({ kind: 'before_start', minutes: 45, quiet: true });
    expect(judgeDay({ ...base, earlyIgnoreMin: 60, pairs: [{ in: at('06:10'), out: at('17:00') }] }).state).toBe('decide');
  });
  const day = (date: string, inAt: string) => judgeDay({ ...base, workDate: date, earlyIgnoreMin: 60, pairs: [{ in: at(inAt, date), out: at('17:00', date) }] });
  it('근무일 80% 이상을 비슷한 분(15분 폭)만큼 일찍 → 한 달 1건 「일정 확인 필요」', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07'].map((d, i) => day(d, i === 4 ? '07:20' : i % 2 ? '06:45' : '07:00'));
    const b = bundleMonth('2026-10', days, 5);
    expect(b.monthly).toEqual([expect.objectContaining({ kind: 'schedule_check', fromMin: 30, toMin: 45, patternDays: 4, workedDays: 5 })]);
    expect(countDays(b.days, new Set(), b.monthly)).toMatchObject({ decide: 0, monthly: 1, open: 1, top: 'schedule_check' });
    expect(countDays(b.days, new Set(['2026-10:schedule_check']), b.monthly).open).toBe(0);
  });
  it('기준 넘은 날(정원채 님처럼 2~3시간)은 그날 건이 아니라 한 달 1건 묶음, 날짜는 목록으로', () => {
    const days = [day('2026-10-01', '04:30'), day('2026-10-02', '05:00'), day('2026-10-05', '07:30')];
    const b = bundleMonth('2026-10', days.filter((d) => d.parts.length), 10);
    expect(b.monthly).toEqual([expect.objectContaining({ kind: 'early_bundle', dates: ['2026-10-01', '2026-10-02'], fromMin: 150, toMin: 180 })]);
    expect(b.days.every((d) => d.state === null)).toBe(true);
  });
});

describe('늦은 출근 차감 방식 · 일정 확인 필요 30분 기준 (2026-11-03 대표 확인)', () => {
  it('1분 단위: 07:31 출근 → 1분 · 15분 내림: 07:44 → 0, 07:46 → 15 · 올림: 07:31 → 15', () => {
    const late = (t: string, lateRound: 'minute' | 'floor' | 'ceil') => judgeDay({ ...base, lateRound, pairs: [{ in: at(t), out: at('17:00') }] });
    expect(kinds(late('07:31', 'minute'))).toEqual(['late_in:1:decide']);
    expect(late('07:44', 'floor').state).toBeNull();
    expect(kinds(late('07:46', 'floor'))).toEqual(['late_in:15:decide']);
    expect(kinds(late('07:31', 'ceil'))).toEqual(['late_in:15:decide']);
  });
  it('매일 15분씩 일찍 오는 사람은 30분 기준 아래라 일정 확인 필요가 아니다', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-05'].map((d) => judgeDay({ ...base, workDate: d, earlyIgnoreMin: 60, pairs: [{ in: at('07:14', d), out: at('17:00', d) }] }));
    expect(bundleMonth('2026-10', days, 3, 30).monthly).toEqual([]);
    expect(bundleMonth('2026-10', days, 3, 0).monthly[0]?.kind).toBe('schedule_check');
  });
});
