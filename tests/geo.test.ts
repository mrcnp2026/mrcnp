// GPS로 사무실 확인
import { describe, expect, it } from 'vitest';
import { distanceM, parseCoords, roundCoord, validateLocation, verifyGeo, type OfficeLocation } from '@/lib/geo';

const OFFICE: OfficeLocation = { id: 'o', label: '본사', lat: 37.5665, lng: 126.978, radiusM: 100, active: true };
// 위도 0.001도 ≈ 111m
const at = (dLat: number, accuracyM = 20) => ({ lat: OFFICE.lat + dLat, lng: OFFICE.lng, accuracyM });

describe('거리', () => {
  it('위도 0.001도는 약 111m', () => {
    const d = distanceM(OFFICE, { lat: OFFICE.lat + 0.001, lng: OFFICE.lng });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
    expect(distanceM(OFFICE, OFFICE)).toBe(0);
  });
});

describe('사무실 확인', () => {
  it('반경 안이면 확인, 밖이면 미확인 (가장 가까운 거리와 함께)', () => {
    expect(verifyGeo(at(0.0005), [OFFICE])).toMatchObject({ verified: true, reason: 'ok' });
    const out = verifyGeo(at(0.002), [OFFICE]);
    expect(out).toMatchObject({ verified: false, reason: 'outside' });
    expect(out.nearestM).toBeGreaterThan(200);
  });
  it('오차가 100m보다 크면 반경 안이어도 확인하지 않는다', () => {
    expect(verifyGeo(at(0, 101), [OFFICE])).toMatchObject({ verified: false, reason: 'low_accuracy' });
    expect(verifyGeo(at(0, 100), [OFFICE]).verified).toBe(true);
  });
  it('위치를 못 받았거나 등록된 사무실 위치가 없으면 미확인', () => {
    expect(verifyGeo(null, [OFFICE])).toMatchObject({ verified: false, reason: 'no_fix' });
    expect(verifyGeo(at(0), [])).toMatchObject({ verified: false, reason: 'no_office' });
    expect(verifyGeo(at(0), [{ ...OFFICE, active: false }])).toMatchObject({ verified: false, reason: 'no_office' });
  });
  it('여러 곳 중 한 곳만 맞아도 확인', () => {
    const far = { ...OFFICE, id: 'f', lat: 35.1, lng: 129.0 };
    expect(verifyGeo(at(0.0003), [far, OFFICE]).verified).toBe(true);
  });
});

describe('입력값', () => {
  it('요청 본문의 위치: 숫자 셋이 모두 맞아야 한다', () => {
    expect(parseCoords({ lat: 37.5, lng: 127, accuracy: 15 })).toEqual({ lat: 37.5, lng: 127, accuracyM: 15 });
    expect(parseCoords({ lat: '37.5', lng: '127', accuracy: '15' })).toEqual({ lat: 37.5, lng: 127, accuracyM: 15 });
    for (const bad of [null, 'x', {}, { lat: 91, lng: 0, accuracy: 1 }, { lat: 0, lng: 181, accuracy: 1 }, { lat: 0, lng: 0 }, { lat: 0, lng: 0, accuracy: -1 }, { lat: NaN, lng: 0, accuracy: 1 }]) {
      expect(parseCoords(bad)).toBeNull();
    }
  });
  it('저장 좌표는 소수 5자리', () => {
    expect(roundCoord(37.56654321)).toBe(37.56654);
  });
  it('사무실 위치: 반경 30~1000m 정수', () => {
    expect(validateLocation({ lat: '37.5665', lng: '126.978', radiusM: '100' })).toEqual({ lat: 37.5665, lng: 126.978, radiusM: 100 });
    expect(validateLocation({ lat: 37.5, lng: 127, radiusM: 29 })).toBeNull();
    expect(validateLocation({ lat: 37.5, lng: 127, radiusM: 1001 })).toBeNull();
    expect(validateLocation({ lat: 37.5, lng: 127, radiusM: 50.5 })).toBeNull();
    expect(validateLocation({ lat: 95, lng: 127, radiusM: 100 })).toBeNull();
    expect(validateLocation({ lat: '', lng: 127, radiusM: 100 })).toBeNull();
  });
});
