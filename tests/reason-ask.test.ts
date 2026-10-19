// 출근 · 퇴근을 찍은 뒤 사유를 물을지 (2026-10-18 의뢰인 — app/punch/ReasonSheet.tsx reasonAsk)
import { describe, expect, it } from 'vitest';
import { reasonAsk } from '@/lib/reason-ask';

const base = { planStart: '08:00', planEnd: '17:00', graceMin: 0, offDay: false, overtimeGraceMin: 15, outside: false };
const at = (hm: string) => `2026-10-19T${hm}:00+09:00`;

describe('사유를 물을지', () => {
  it('제때 출근 · 제때 퇴근이면 묻지 않는다', () => {
    expect(reasonAsk({ ...base, kind: 'in', punchedAt: at('07:55') })).toBeNull();
    expect(reasonAsk({ ...base, kind: 'out', punchedAt: at('17:10') })).toBeNull();
  });
  it('지각이면 늦은 분을 함께', () => expect(reasonAsk({ ...base, kind: 'in', punchedAt: at('08:20') })).toEqual({ kind: 'in', reasons: ['late'], lateMin: 20, overMin: 0 }));
  it('사무실 밖 출근', () => expect(reasonAsk({ ...base, kind: 'in', punchedAt: at('07:50'), outside: true })?.reasons).toEqual(['outside']));
  it('일정보다 늦은 퇴근 = 연장', () => expect(reasonAsk({ ...base, kind: 'out', punchedAt: at('18:30') })).toEqual({ kind: 'out', reasons: ['overtime'], lateMin: 0, overMin: 90 }));
  it('휴일 · 밤 10시 넘어 · 밖 (오늘 테스트 관리자와 같은 경우는 휴일 + 밖)', () => {
    expect(reasonAsk({ ...base, kind: 'out', punchedAt: at('21:29'), offDay: true, outside: true })?.reasons).toEqual(['holiday', 'outside']);
    expect(reasonAsk({ ...base, kind: 'out', punchedAt: at('22:40') })?.reasons).toEqual(['overtime', 'night']);
  });
  it('일정 없는 날 퇴근', () => expect(reasonAsk({ ...base, planStart: null, planEnd: null, kind: 'out', punchedAt: at('15:00') })?.reasons).toEqual(['noPlan']));
});
