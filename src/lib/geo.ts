// GPS로 사무실 확인 (의뢰인 2026-10-05) — 사무실 인터넷 주소 확인에 더하는 보조 수단. 순수함수.
// ★ 좌표는 폰(브라우저)이 보낸 값이라 서버가 직접 잰 값이 아니다. 인터넷 주소 확인보다 약한 증거다 —
//   그래서 "무엇으로 확인했는지"(ip/gps)를 기록에 따로 남긴다. 신원 확인(패스키)은 그대로 필수다.
// ★ 사무실 밖으로 판정된 좌표는 저장하지 않는다 (집 등 사생활 위치가 남지 않게). 확인된 좌표도 약 1m 단위로 줄여 저장한다.

export type OfficeLocation = { id: string; label: string | null; lat: number; lng: number; radiusM: number; active: boolean };
export type Coords = { lat: number; lng: number; accuracyM: number };

/** 폰이 알려 준 오차가 이보다 크면 믿지 않는다 (실내에서 WiFi·기지국으로 잡힌 수백 m 오차 값을 거른다) */
export const MAX_ACCURACY_M = 100;
export const RADIUS_MIN_M = 30;
export const RADIUS_MAX_M = 1000;

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/** 요청 본문의 위치값. 모양이 틀리면 null (위치 없이 찍은 것으로 본다 — 기록은 남는다, 4-3) */
export function parseCoords(raw: unknown): Coords | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const lat = num(o.lat);
  const lng = num(o.lng);
  const accuracyM = num(o.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracyM)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || accuracyM < 0) return null;
  return { lat, lng, accuracyM };
}

/** 두 좌표 사이 거리 (m, 하버사인) */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeoVerdict = { verified: boolean; reason: 'ok' | 'no_office' | 'no_fix' | 'low_accuracy' | 'outside'; nearestM: number | null };

/** 켜진 사무실 위치 중 하나의 반경 안인가. 오차가 크면 확인하지 않는다 */
export function verifyGeo(coords: Coords | null, locations: readonly OfficeLocation[]): GeoVerdict {
  const on = locations.filter((l) => l.active);
  if (on.length === 0) return { verified: false, reason: 'no_office', nearestM: null };
  if (!coords) return { verified: false, reason: 'no_fix', nearestM: null };
  if (coords.accuracyM > MAX_ACCURACY_M) return { verified: false, reason: 'low_accuracy', nearestM: null };
  let nearest = Infinity;
  let inside = false;
  for (const l of on) {
    const d = distanceM(coords, l);
    if (d < nearest) nearest = d;
    if (d <= l.radiusM) inside = true;
  }
  return { verified: inside, reason: inside ? 'ok' : 'outside', nearestM: Math.round(nearest) };
}

/** 저장할 좌표 — 소수 5자리(약 1m) */
export const roundCoord = (n: number) => Math.round(n * 1e5) / 1e5;

/** 설정 화면 입력값 */
export function validateLocation(b: Record<string, unknown>): { lat: number; lng: number; radiusM: number } | null {
  const lat = num(b.lat);
  const lng = num(b.lng);
  const radiusM = num(b.radiusM);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (!Number.isInteger(radiusM) || radiusM < RADIUS_MIN_M || radiusM > RADIUS_MAX_M) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, radiusM };
}
