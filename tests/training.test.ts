// 교육 · 안전교육 (묶음 33, 2026-10-20) — 대상 · 주기 · 시간 · 이수 · 입력 검사
import { describe, expect, it } from 'vitest';
import { cleanCourse, cleanSession, cleanSignature, isTarget, periodOf, progressOf, sessionHours, type Course } from '@/lib/training-rules';

const inGroup = (pg: string | null, g: string) => pg === g || (g === 'factory' && (pg === 'f1' || pg === 'f2'));
const people = [
  { id: 'a', jobId: 'prod', groupId: 'f1', joinedOn: '2025-01-01', active: true },
  { id: 'b', jobId: 'office', groupId: 'hq', joinedOn: '2026-09-01', active: true },
  { id: 'c', jobId: 'prod', groupId: 'f2', joinedOn: null, active: true },
  { id: 'd', jobId: 'prod', groupId: 'f1', joinedOn: '2020-01-01', active: false },
];
const course = (over: Partial<Course>): Course => ({ id: 'k', name: '정기', law: null, cycle: 'HALF', hours: 12, targets: {}, signatureRequired: true, needsCheck: true, active: true, sort: 0, ...over });

describe('교육', () => {
  it('대상: 아무것도 안 고르면 전 직원, 소속은 아래 팀까지', () => {
    expect(people.map((p) => isTarget({}, p, inGroup))).toEqual([true, true, true, true]);
    expect(people.map((p) => isTarget({ groupIds: ['factory'] }, p, inGroup))).toEqual([true, false, true, true]);
    expect(people.map((p) => isTarget({ jobIds: ['office'], employeeIds: ['c'] }, p, inGroup))).toEqual([false, true, true, false]);
  });
  it('주기 기간', () => {
    expect([periodOf('HALF', '2026-03-05'), periodOf('HALF', '2026-10-20'), periodOf('YEAR', '2026-10-20'), periodOf('HIRE', '2026-10-20')]).toEqual([{ from: '2026-01-01', to: '2026-06-30' }, { from: '2026-07-01', to: '2026-12-31' }, { from: '2026-01-01', to: '2026-12-31' }, null]);
  });
  it('시간', () => {
    expect([sessionHours({ startTime: '09:00', endTime: '12:30' }), sessionHours({ startTime: null, endTime: null })]).toEqual([3.5, null]);
  });
  it('이수: 반기 시간 합 · 취소 · 뺀 사람 · 다른 기간 · 채용 시는 입사 뒤 한 번', () => {
    const sessions = [
      { id: 's1', courseId: 'k', heldOn: '2026-08-01', startTime: '09:00', endTime: '15:00', instructor: null, place: null, content: null, cancelled: false },
      { id: 's2', courseId: 'k', heldOn: '2026-09-01', startTime: '09:00', endTime: '15:00', instructor: null, place: null, content: null, cancelled: false },
      { id: 's3', courseId: 'k', heldOn: '2026-03-01', startTime: '09:00', endTime: '21:00', instructor: null, place: null, content: null, cancelled: false },
      { id: 's4', courseId: 'k', heldOn: '2026-10-01', startTime: '09:00', endTime: '21:00', instructor: null, place: null, content: null, cancelled: true },
    ];
    const att = [
      { sessionId: 's1', employeeId: 'a', signedAt: 'x', removed: false }, { sessionId: 's2', employeeId: 'a', signedAt: 'x', removed: false },
      { sessionId: 's1', employeeId: 'b', signedAt: 'x', removed: false }, { sessionId: 's3', employeeId: 'b', signedAt: 'x', removed: false },
      { sessionId: 's4', employeeId: 'c', signedAt: 'x', removed: false }, { sessionId: 's2', employeeId: 'c', signedAt: null, removed: false },
    ];
    expect(progressOf({ course: course({}), date: '2026-10-20', people, sessions, attendees: att, inGroup })).toEqual([
      { employeeId: 'a', hours: 12, sessions: 2, done: true },
      { employeeId: 'b', hours: 6, sessions: 1, done: false },
      { employeeId: 'c', hours: 0, sessions: 0, done: false },
    ]);
    const hire = progressOf({ course: course({ cycle: 'HIRE', hours: null }), date: '2026-10-20', people, sessions, attendees: att, inGroup })!;
    expect(hire.map((x) => [x.employeeId, x.done])).toEqual([['a', true], ['b', false]]); // c는 입사일이 없어 빠짐, b는 9/1 입사인데 서명한 교육이 모두 그 전
    expect(progressOf({ course: course({ cycle: 'DAILY' }), date: '2026-10-20', people, sessions, attendees: att, inGroup })).toBeNull();
  });
  it('입력 검사', () => {
    expect(cleanCourse({ name: ' TBM ', cycle: 'DAILY', hours: '', signatureRequired: true })).toEqual({ name: 'TBM', law: null, cycle: 'DAILY', hours: null, targets: { jobIds: [], groupIds: [], employeeIds: [] }, signatureRequired: true, needsCheck: true, active: true });
    expect(cleanCourse({ name: 'x', cycle: 'WEEK' })).toEqual({ error: 'training_cycle' });
    expect(cleanSession({ courseId: '11111111-1111-1111-1111-111111111111', heldOn: '2026-10-20', startTime: '13:00', endTime: '12:00' })).toEqual({ error: 'training_time' });
    expect(cleanSession({ courseId: '11111111-1111-1111-1111-111111111111', heldOn: '2026-10-20', startTime: '13:00' })).toEqual({ error: 'training_time' });
    expect(cleanSignature('M 1 1 L 2 2 L 3 3 L 4 4 L 5 5')).toBe('M 1 1 L 2 2 L 3 3 L 4 4 L 5 5');
    expect([cleanSignature('M 1 1 L 2 2'), cleanSignature('<script>'), cleanSignature('')]).toEqual([undefined, undefined, null]);
  });
});
