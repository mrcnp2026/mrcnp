// GPS로 사무실 확인
import { describe, expect, it } from 'vitest';
import { allowedLocations, cleanPlaceText, distanceM, latLngOf, metersPerPx, parseCoords, roundCoord, validateLocation, verifyGeo, worldPx, type OfficeLocation } from '@/lib/geo';

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

describe('지점별 출퇴근 장소 · 지도 계산 (2026-10-10)', () => {
  const A: OfficeLocation = { id: 'a', label: '1공장', lat: 35.7, lng: 129.3, radiusM: 80, active: true };
  const B: OfficeLocation = { id: 'b', label: '2공장', lat: 35.71, lng: 129.31, radiusM: 80, active: true };
  it('확인된 장소의 id를 돌려준다 (겹치면 가장 가까운 곳)', () => {
    expect(verifyGeo({ lat: 35.7, lng: 129.3, accuracyM: 10 }, [A, B]).locationId).toBe('a');
    expect(verifyGeo({ lat: 35.71, lng: 129.31, accuracyM: 10 }, [A, B]).locationId).toBe('b');
    expect(verifyGeo({ lat: 35.8, lng: 129.3, accuracyM: 10 }, [A, B]).locationId).toBeNull();
    const near = { ...A, id: 'near', lat: 35.7001 };
    expect(verifyGeo({ lat: 35.70009, lng: 129.3, accuracyM: 10 }, [A, near]).locationId).toBe('near');
  });
  it('지점에 붙인 장소가 있으면 그것만, 없으면 켜진 장소 전체', () => {
    const links = [{ groupId: 'g1', locationId: 'a' }];
    expect(allowedLocations([A, B], links, ['g1']).map((l) => l.id)).toEqual(['a']);
    expect(allowedLocations([A, B], links, ['g2']).map((l) => l.id)).toEqual(['a', 'b']);
    expect(allowedLocations([A, B], links, []).map((l) => l.id)).toEqual(['a', 'b']);
    expect(allowedLocations([{ ...A, active: false }, B], links, ['g1']).map((l) => l.id)).toEqual(['b']);
  });
  it('좌표와 화면 점 변환은 왕복해도 같고, 1px 길이는 위도에 맞다', () => {
    const p = worldPx(35.7, 129.3, 17);
    const back = latLngOf(p.x, p.y, 17);
    expect(back.lat).toBeCloseTo(35.7, 6);
    expect(back.lng).toBeCloseTo(129.3, 6);
    expect(metersPerPx(0, 0)).toBeCloseTo(156543.03, 1);
    expect(metersPerPx(35.7, 17)).toBeGreaterThan(0.9);
    expect(metersPerPx(35.7, 17)).toBeLessThan(1.0);
  });
  it('장소 이름·주소 다듬기', () => {
    expect(cleanPlaceText('  1공장 ', 40)).toBe('1공장');
    expect(cleanPlaceText('', 40)).toBeNull();
    expect(cleanPlaceText('가'.repeat(41), 40)).toBeUndefined();
    expect(cleanPlaceText(3, 40)).toBeUndefined();
  });
});
