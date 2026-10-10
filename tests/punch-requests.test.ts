// 반경 밖 「출근/퇴근 요청」 판단 (2026-10-10 의뢰인 확정)
import { describe, expect, it } from 'vitest';
import { geoReasonOf, punchRoute } from '@/lib/punch-requests';
import { fromPunchRequest, splitRequests } from '@/lib/requests';

describe('punchRoute', () => {
  it('확인되면 기록', () => expect(punchRoute({ verified: true, hasOfficeSetup: true, approvedAway: false })).toBe('record'));
  it('반경 밖이면 요청', () => expect(punchRoute({ verified: false, hasOfficeSetup: true, approvedAway: false })).toBe('request'));
  it('장소·사무실 인터넷이 하나도 없는 회사는 기록 (전원이 요청으로 가지 않게)', () => expect(punchRoute({ verified: false, hasOfficeSetup: false, approvedAway: false })).toBe('record'));
  it('그날 승인된 외근이 있으면 기록', () => expect(punchRoute({ verified: false, hasOfficeSetup: true, approvedAway: true })).toBe('record'));
});

describe('geoReasonOf', () => {
  it('동의가 없으면 no_consent · 위치가 없으면 no_fix', () => {
    expect(geoReasonOf({ consent: false, hasCoords: true, verdict: 'outside' })).toBe('no_consent');
    expect(geoReasonOf({ consent: true, hasCoords: false, verdict: null })).toBe('no_fix');
  });
  it('판정 이유를 그대로', () => {
    expect(geoReasonOf({ consent: true, hasCoords: true, verdict: 'outside' })).toBe('outside');
    expect(geoReasonOf({ consent: true, hasCoords: true, verdict: 'low_accuracy' })).toBe('low_accuracy');
    expect(geoReasonOf({ consent: true, hasCoords: true, verdict: 'no_office' })).toBe('no_office');
  });
});

describe('요청 목록에 넣기', () => {
  it('출근 요청 한 건', () => {
    const r = fromPunchRequest({ id: 'p1', employee_id: 'e1', kind: 'in', requested_at: '2026-10-12T23:02:00Z', work_date: '2026-10-13', nearest_m: 420, geo_reason: 'outside', status: 'pending', approved_by: null, decided_at: null, created_at: '2026-10-12T23:02:00Z' });
    expect(r).toMatchObject({ key: 'punch:p1', kind: 'punch', date: '2026-10-13', punchKind: 'in', newAt: '2026-10-12T23:02:00Z', sub: 'outside', meters: 420 });
    expect(splitRequests([r]).pending).toHaveLength(1);
  });
});
