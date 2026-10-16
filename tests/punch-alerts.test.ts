// 출퇴근 폰 알림의 판단 (lib/punch-alerts.ts planPunchAlerts)
import { describe, expect, it } from 'vitest';
import { planPunchAlerts, type PersonMisses } from '@/lib/punch-alerts';

const T = '2026-10-16', Y = '2026-10-15';
const person = (id: string, misses: PersonMisses['misses']): PersonMisses => ({ id, name: `직원${id}`, startTime: '08:00', endTime: '17:00', misses });
const plan = (people: PersonMisses[], hour: number) => planPunchAlerts({ people, today: T, yesterday: Y, hour, approversOf: () => ['boss'] });
const keys = (xs: ReturnType<typeof plan>) => xs.map((x) => x.key).sort();

describe('planPunchAlerts', () => {
  it('오늘 미출근 — 본인과 관리자에게', () => {
    const r = plan([person('a', [{ workDate: T, kind: 'in', hasPendingRequest: false }])], 9);
    expect(keys(r)).toEqual([`absent:a:${T}`, `self-in:a:${T}`]);
    expect(r.find((x) => x.key.startsWith('self-in'))!.to).toEqual(['a']);
    expect(r.find((x) => x.key.startsWith('absent'))!.to).toEqual(['boss']);
  });
  it('오늘 미퇴근 — 본인에게만', () => {
    expect(keys(plan([person('a', [{ workDate: T, kind: 'out', hasPendingRequest: false }])], 21))).toEqual([`self-out:a:${T}`]);
  });
  it('밤(22시~7시)에는 직원에게 보내지 않는다 — 관리자 미출근 알림은 간다', () => {
    expect(keys(plan([person('a', [{ workDate: T, kind: 'in', hasPendingRequest: false }, { workDate: T, kind: 'out', hasPendingRequest: false }])], 23))).toEqual([`absent:a:${T}`]);
  });
  it('아침: 어제 빠진 기록 — 본인에게 정정 안내, 관리자에게 한 번에 묶어서', () => {
    const r = plan([
      person('a', [{ workDate: Y, kind: 'out', hasPendingRequest: false }]),
      person('b', [{ workDate: Y, kind: 'in', hasPendingRequest: false }]),
      person('c', [{ workDate: Y, kind: 'in', hasPendingRequest: true }]),
    ], 9);
    expect(keys(r)).toEqual([`daily:boss:${Y}`, `self-prev:a:${Y}`, `self-prev:b:${Y}`]); // c는 이미 정정 요청을 냈다
    const d = r.find((x) => x.key.startsWith('daily'))!;
    expect(d.payload.title).toBe('어제(10/15) 출퇴근 미기록 3명');
    expect(d.payload.body).toBe('출근 미기록 2명: 직원b, 직원c · 퇴근 미기록 1명: 직원a');
    expect(d.payload.url).toBe(`/admin/missing?from=${Y}&to=${Y}&tab=in`);
  });
  it('관리자 아침 묶음은 8시 전에는 보내지 않는다', () => {
    expect(keys(plan([person('a', [{ workDate: Y, kind: 'in', hasPendingRequest: false }])], 7))).toEqual([`self-prev:a:${Y}`]);
  });
  it('승인할 사람이 없으면 관리자 알림을 뺀다', () => {
    const r = planPunchAlerts({ people: [person('a', [{ workDate: T, kind: 'in', hasPendingRequest: false }])], today: T, yesterday: Y, hour: 9, approversOf: () => [] });
    expect(keys(r)).toEqual([`self-in:a:${T}`]);
  });
});
