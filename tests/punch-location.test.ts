// 게이트 4·5 — 사무실 IP 판정(7-3) · 오늘 상태 분류(7-9 요점 8, 직원 홈 칩과 현황판이 같이 씀)
import { describe, expect, it } from 'vitest';
import { buildTodayBoard, classifyDay } from '@/lib/today';
import { kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';
import { extractClientIp, isOfficeIp, normalize, parseCidr, traceClientIp } from '@/lib/verify-location';

const ORDER = ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'] as const;

describe('사무실 IP 판정', () => {
  it('등록 대역 안이면 통과, 밖이면 실패 (IPv4)', () => {
    expect(isOfficeIp('203.0.113.10', ['203.0.113.0/24'])).toBe(true);
    expect(isOfficeIp('203.0.114.10', ['203.0.113.0/24'])).toBe(false);
    expect(isOfficeIp('203.0.113.10', ['203.0.113.10'])).toBe(true); // 슬래시 없으면 /32
  });

  it('IPv6 주소가 들어와도 죽지 않고, /64 대역으로 판정한다 ← B-3, R-6의 3', () => {
    const v6 = '2001:db8:1234:5678:abcd:ef01:2345:6789';
    expect(() => isOfficeIp(v6, ['203.0.113.0/24'])).not.toThrow();
    expect(isOfficeIp(v6, ['203.0.113.0/24'])).toBe(false); // IPv4 대역과는 안 맞는다 (조용히 실패하는 지점)
    expect(isOfficeIp(v6, ['2001:db8:1234:5678::/64'])).toBe(true);
    expect(isOfficeIp('2001:db8:1234:9999::1', ['2001:db8:1234:5678::/64'])).toBe(false);
  });

  it('IPv4가 IPv6 모양(::ffff:)으로 와도 IPv4 대역과 맞는다', () => {
    expect(normalize('::ffff:203.0.113.10')).toBe('203.0.113.10');
    expect(isOfficeIp('::ffff:203.0.113.10', ['203.0.113.0/24'])).toBe(true);
  });

  it('이상한 값·빈 값·잘못된 대역에도 죽지 않는다 (잘못된 대역만 건너뜀)', () => {
    expect(isOfficeIp(null, ['203.0.113.0/24'])).toBe(false);
    expect(isOfficeIp('not-an-ip', ['203.0.113.0/24'])).toBe(false);
    expect(isOfficeIp('203.0.113.10', ['garbage', '203.0.113.0/24'])).toBe(true);
    expect(parseCidr('garbage')).toBeNull();
  });

  it('헤더 체인: 앞 순서 헤더의 맨 앞 주소를 쓰고, 체인 전체를 남긴다 ← R-6의 1, 요점 2', () => {
    const h = new Headers({ 'x-forwarded-for': '1.1.1.1, 10.0.0.1', 'x-real-ip': '198.51.100.7' });
    const t = traceClientIp(h, ORDER);
    expect(t.ip).toBe('198.51.100.7');
    expect(t.usedHeader).toBe('x-real-ip');
    expect(t.headers['x-forwarded-for']).toBe('1.1.1.1, 10.0.0.1');
    expect(extractClientIp(new Headers({ 'x-forwarded-for': '[2001:db8::1]:443, 10.0.0.1' }), ORDER)).toBe('2001:db8::1');
    expect(extractClientIp(new Headers(), ORDER)).toBeNull();
  });
});

describe('오늘 상태 (한 사람은 한 칸)', () => {
  const RULE: WorkRule = {
    startTime: '09:00', endTime: '18:00', lateGraceMin: 10, breakStart: '12:00', breakEnd: '13:00',
    workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7,
  };
  const D = '2026-10-12';
  const at = (t: string) => kstDateTime(D, t);
  const c = (pairs: { in: Date | null; out: Date | null }[], now: string, dayType: 'workday' | 'rest_off' | 'holiday' = 'workday', rule: WorkRule | null = RULE) =>
    classifyDay({ pairs, rule, dayType, workDate: D, now: at(now) });

  it('출근 전 = 미출근, 정시 출근 = 근무중, 지각 = 지각, 퇴근 = 퇴근', () => {
    expect(c([], '08:00').status).toBe('absent');
    expect(c([{ in: at('09:00'), out: null }], '10:00').status).toBe('working');
    expect(c([{ in: at('09:30'), out: null }], '10:00').status).toBe('late');
    expect(c([{ in: at('09:30'), out: at('18:30') }], '19:00').status).toBe('done');
  });

  it('기준 퇴근이 지났는데 퇴근 없음 = 야근중. 지각했어도 칸은 야근중, 지각은 따로 남는다', () => {
    const r = c([{ in: at('09:30'), out: null }], '19:00');
    expect(r.status).toBe('overtime');
    expect(r.lateness?.verdict).toBe('late');
  });

  it('휴일·휴무일에 출근 없음 = 휴무, 휴일에 출근하면 근무 칸으로 (지각 판정은 안 함)', () => {
    expect(c([], '10:00', 'holiday').status).toBe('off');
    const r = c([{ in: at('11:00'), out: null }], '12:00', 'rest_off');
    expect(r.status).toBe('working');
    expect(r.lateness?.verdict).toBe('not_applicable');
  });

  it('현황판: 지각 후 야근 중인 사람은 야근중 칸에만 + 지각 배지, 5칸 합 + 휴무 = 직원 수 ← B-26', () => {
    const person = (id: string, pairs: { in: Date | null; out: Date | null }[]) => ({
      id, name: id, employeeNo: id, pairs, firstInVerified: true, adminEntered: false, weekMinutes: 0,
    });
    const people = [
      person('a-late-then-overtime', [{ in: at('09:30'), out: null }]),
      person('b-done', [{ in: at('09:00'), out: at('18:05') }]),
      person('c-absent', []),
      person('d-working', [{ in: at('09:05'), out: null }]),
    ];
    const b = buildTodayBoard({ people, rule: RULE, dayType: 'workday', workDate: D, now: at('19:00') });
    // 19:00: a(지각 후)와 d(정시) 모두 기준 퇴근이 지나 야근중. a는 지각 칸에 중복으로 세지 않고 배지만
    expect(b.overtime.map((r) => r.id)).toEqual(['a-late-then-overtime', 'd-working']);
    expect(b.overtime.find((r) => r.id === 'a-late-then-overtime')?.late).toBe(true);
    expect(b.overtime.find((r) => r.id === 'd-working')?.late).toBe(false);
    expect(b.late).toEqual([]);
    const five = b.working.length + b.late.length + b.absent.length + b.done.length + b.overtime.length;
    expect(five + b.off.length).toBe(people.length);
    const holiday = buildTodayBoard({ people, rule: RULE, dayType: 'holiday', workDate: D, now: at('10:00') });
    expect(holiday.off.map((r) => r.id)).toEqual(['c-absent']); // 휴일에 출근한 사람은 off가 아니다
  });

  it('근무규칙이 아직 없으면 지각·야근중을 판정하지 않는다 (추측하지 않음)', () => {
    expect(c([{ in: at('11:00'), out: null }], '20:00', 'workday', null).status).toBe('working');
  });
});
