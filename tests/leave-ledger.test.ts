// 휴가 원장 — 발생 계획 · 잔여 · 차감 배분 · 신청 맞추기 · 소멸
import { describe, expect, it } from 'vitest';
import { addMonths, allocate, annualDays, entriesFor, ledgerBalance, lotRemaining, planAccrual, planExpiry, planRequest, STANDARD_LEAVE_POLICY, validateLeavePolicy, type Entry, type Lot } from '@/lib/leave-ledger';

const P = STANDARD_LEAVE_POLICY;
const lot = (id: string, o: Partial<Lot> = {}): Lot => ({ id, employeeId: 'e', typeCode: 'annual', kind: 'annual', grantedOn: '2026-01-01', usableFrom: '2026-01-01', usableTo: '2027-01-01', quantityMinutes: 7200, dayMinutes: 480, state: 'APPROVED', ...o });
let seq = 0;
const ent = (o: Partial<Entry>): Entry => ({ id: ++seq, employeeId: 'e', lotId: null, event: 'grant', minutes: 0, effectiveOn: '2026-01-01', isTest: false, requestId: null, ...o });

describe('날짜', () => {
  it('말일은 그 달의 말일로 맞춘다', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
});

describe('연차 일수', () => {
  it('15일에서 시작해 3년차부터 2년마다 1일, 최대 25일', () => {
    expect([1, 2, 3, 4, 5, 21, 22, 30].map((n) => annualDays(P, n))).toEqual([15, 15, 16, 16, 17, 25, 25, 25]);
  });
});

describe('발생 계획 — 입사일 기준', () => {
  it('1년 미만은 한 달마다 1일, 첫 주년 전날까지 쓴다', () => {
    const lots = planAccrual({ hiredOn: '2026-03-10', asOf: '2026-06-10', policy: P });
    expect(lots.map((l) => [l.kind, l.grantedOn, l.usableTo, l.minutes])).toEqual([
      ['monthly', '2026-04-10', '2027-03-10', 480],
      ['monthly', '2026-05-10', '2027-03-10', 480],
      ['monthly', '2026-06-10', '2027-03-10', 480],
    ]);
  });
  it('월 발생은 11번까지이고 1주년에 15일이 생긴다', () => {
    const lots = planAccrual({ hiredOn: '2025-03-10', asOf: '2026-03-10', policy: P });
    expect(lots.filter((l) => l.kind === 'monthly')).toHaveLength(11);
    const a = lots.find((l) => l.kind === 'annual')!;
    expect([a.grantedOn, a.usableTo, a.minutes, a.basis.years]).toEqual(['2026-03-10', '2027-03-10', 15 * 480, 1]);
  });
  it('liveOnly면 지난 건은 만들지 않는다', () => {
    const lots = planAccrual({ hiredOn: '2020-03-10', asOf: '2026-10-13', policy: P, liveOnly: true });
    expect(lots).toHaveLength(1);
    expect([lots[0].grantedOn, lots[0].basis.years, lots[0].minutes]).toEqual(['2026-03-10', 6, 17 * 480]);
  });
  it('열쇠는 다시 계산해도 같다', () => {
    const a = planAccrual({ hiredOn: '2025-03-10', asOf: '2026-03-10', policy: P }).map((l) => l.key);
    const b = planAccrual({ hiredOn: '2025-03-10', asOf: '2026-12-31', policy: P }).map((l) => l.key);
    expect(b.slice(0, a.length)).toEqual(a);
    expect(new Set(b).size).toBe(b.length);
  });
  it('입사 전이거나 날짜가 틀리면 아무것도 없다', () => {
    expect(planAccrual({ hiredOn: '2027-01-01', asOf: '2026-10-13', policy: P })).toEqual([]);
    expect(planAccrual({ hiredOn: '', asOf: '2026-10-13', policy: P })).toEqual([]);
  });
});

describe('발생 계획 — 회계연도 기준', () => {
  const F = { ...P, basis: 'fiscal_year' as const };
  it('첫 회계연도는 재직일수만큼 비례하고 끝수를 올린다', () => {
    const lots = planAccrual({ hiredOn: '2025-07-01', asOf: '2026-01-01', policy: F });
    const a = lots.find((l) => l.kind === 'annual')!;
    // 2025-07-01 ~ 2025-12-31 = 184일 → 15 × 184 ÷ 365 = 7.56 → 8일
    expect([a.grantedOn, a.usableTo, a.basis.serviceDays, a.basis.yearDays, a.basis.days]).toEqual(['2026-01-01', '2027-01-01', 184, 365, 8]);
    expect(planAccrual({ hiredOn: '2025-07-01', asOf: '2026-01-01', policy: { ...F, rounding: 'ceil_half' } }).find((l) => l.kind === 'annual')!.basis.days).toBe(8);
    expect(planAccrual({ hiredOn: '2025-07-01', asOf: '2026-01-01', policy: { ...F, rounding: 'none' } }).find((l) => l.kind === 'annual')!.basis.days).toBe(7.56);
  });
  it('그다음 회계연도부터 15일', () => {
    const lots = planAccrual({ hiredOn: '2025-07-01', asOf: '2027-01-01', policy: F }).filter((l) => l.kind === 'annual');
    expect(lots.map((l) => [l.grantedOn, l.basis.days])).toEqual([['2026-01-01', 8], ['2027-01-01', 15]]);
  });
  it('회계연도 시작일에 입사하면 첫해 비례가 15일 전부다', () => {
    const a = planAccrual({ hiredOn: '2025-01-01', asOf: '2026-01-01', policy: F }).find((l) => l.kind === 'annual')!;
    expect(a.basis.days).toBe(15);
  });
});

describe('정책 검사', () => {
  it('통상 방식은 통과, 틀린 값은 거부', () => {
    expect(validateLeavePolicy(P)).toEqual(P);
    expect(validateLeavePolicy({ ...P, basis: 'x' })).toBeNull();
    expect(validateLeavePolicy({ ...P, fiscalStart: '13-01' })).toBeNull();
    expect(validateLeavePolicy({ ...P, maxDays: 10 })).toBeNull();
    expect(validateLeavePolicy(null)).toBeNull();
  });
});

describe('잔여', () => {
  it('지급 건마다 원장을 더한다. 승인 안 된 건은 세지 않는다', () => {
    const lots = [lot('a'), lot('b', { state: 'CANDIDATE' })];
    const es = [ent({ lotId: 'a', minutes: 7200 }), ent({ lotId: 'a', event: 'use', minutes: -480, requestId: 'r1' }), ent({ lotId: 'b', minutes: 7200 })];
    expect([...lotRemaining(lots, es)]).toEqual([['a', 6720]]);
    expect(ledgerBalance(lots, es, '2026-06-01')).toEqual({ granted: 7200, used: 480, expired: 0, remaining: 6720, advance: 0, upcoming: 0 });
  });
  it('선사용은 잔여에서 빼고, 아직 시작 안 한 건은 따로 센다', () => {
    const lots = [lot('a'), lot('n', { usableFrom: '2027-01-01', usableTo: '2028-01-01' })];
    const es = [ent({ lotId: 'a', minutes: 480 }), ent({ lotId: 'n', minutes: 7200 }), ent({ lotId: null, event: 'advance', minutes: -240, requestId: 'r' })];
    expect(ledgerBalance(lots, es, '2026-06-01')).toMatchObject({ remaining: 240, advance: 240, upcoming: 7200 });
  });
  it('연습 신청의 줄은 연습 화면에서만 센다', () => {
    const es = [ent({ lotId: 'a', minutes: 7200 }), ent({ lotId: 'a', event: 'use', minutes: -480, requestId: 'p', isTest: true }), ent({ lotId: 'a', event: 'use', minutes: -960, requestId: 'l' })];
    expect(lotRemaining([lot('a')], entriesFor(es, true)).get('a')).toBe(6720);
    expect(lotRemaining([lot('a')], entriesFor(es, false)).get('a')).toBe(6240);
  });
});

describe('차감 배분', () => {
  it('먼저 끝나는 건부터 쓰고 모자라면 선사용', () => {
    const lots = [lot('late', { usableTo: '2027-06-01' }), lot('soon', { usableTo: '2026-09-01' }), lot('ended', { usableTo: '2026-03-01' })];
    const rem = new Map([['late', 480], ['soon', 240], ['ended', 480]]);
    expect(allocate({ lots, remaining: rem, minutes: 600, on: '2026-06-01' })).toEqual({ parts: [{ lotId: 'soon', minutes: 240 }, { lotId: 'late', minutes: 360 }], shortage: 0 });
    expect(allocate({ lots, remaining: rem, minutes: 1000, on: '2026-06-01' }).shortage).toBe(280);
  });
});

describe('신청 맞추기', () => {
  const lots = [lot('a')];
  const grant = ent({ lotId: 'a', minutes: 7200 });
  const req = { id: 'r1', startDate: '2026-05-04', days: 1.5, approved: true, deducts: true, isTest: false };
  it('승인되면 사용 줄을 넣고, 다시 불러도 더 넣지 않는다', () => {
    const add = planRequest({ req, lots, entries: [grant] });
    expect(add.map((e) => [e.event, e.lotId, e.minutes, e.effectiveOn])).toEqual([['use', 'a', -720, '2026-05-04']]);
    const after = [grant, ...add.map((e) => ent(e))];
    expect(planRequest({ req, lots, entries: after })).toEqual([]);
  });
  it('취소되면 되돌리는 줄, 다시 승인하면 새 열쇠로 다시 넣는다', () => {
    const used = ent({ lotId: 'a', event: 'use', minutes: -720, requestId: 'r1' });
    const back = planRequest({ req: { ...req, approved: false }, lots, entries: [grant, used] });
    expect(back.map((e) => [e.event, e.minutes])).toEqual([['cancel', 720]]);
    const again = planRequest({ req, lots, entries: [grant, used, ent(back[0])] });
    expect(again.map((e) => [e.event, e.minutes])).toEqual([['use', -720]]);
    expect(again[0].dedupeKey).not.toBe('req:r1:0:a:use');
  });
  it('차감하지 않는 종류는 넣지 않는다', () => {
    expect(planRequest({ req: { ...req, deducts: false }, lots, entries: [grant] })).toEqual([]);
  });
  it('지급 건이 모자라면 선사용 줄', () => {
    const add = planRequest({ req: { ...req, days: 20 }, lots, entries: [grant] });
    expect(add.map((e) => [e.event, e.lotId, e.minutes])).toEqual([['use', 'a', -7200], ['advance', null, -2400]]);
  });
  it('일수가 바뀌면 되돌리고 다시 넣는다', () => {
    const used = ent({ lotId: 'a', event: 'use', minutes: -720, requestId: 'r1' });
    const fix = planRequest({ req: { ...req, days: 1 }, lots, entries: [grant, used] });
    expect(fix.map((e) => [e.event, e.minutes])).toEqual([['cancel', 720], ['use', -480]]);
  });
});

describe('소멸', () => {
  it('끝난 건의 남은 분만, 끝나는 날로', () => {
    const lots = [lot('old', { usableTo: '2026-03-01' }), lot('live'), lot('zero', { usableTo: '2026-03-01' })];
    const es = [ent({ lotId: 'old', minutes: 960 }), ent({ lotId: 'old', event: 'use', minutes: -480, requestId: 'r' }), ent({ lotId: 'live', minutes: 480 }), ent({ lotId: 'zero', minutes: 480 }), ent({ lotId: 'zero', event: 'use', minutes: -480, requestId: 'q' })];
    expect(planExpiry(lots, es, '2026-06-01').map((e) => [e.lotId, e.minutes, e.effectiveOn, e.dedupeKey])).toEqual([['old', -480, '2026-03-01', 'expire:old']]);
  });
});
