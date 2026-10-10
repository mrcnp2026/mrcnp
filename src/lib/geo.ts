// GPS로 사무실 확인 (의뢰인 2026-10-05) — 사무실 인터넷 주소 확인에 더하는 보조 수단. 순수함수.
// ★ 좌표는 폰(브라우저)이 보낸 값이라 서버가 직접 잰 값이 아니다. 인터넷 주소 확인보다 약한 증거다 —
//   그래서 "무엇으로 확인했는지"(ip/gps)를 기록에 따로 남긴다. 신원 확인(패스키)은 그대로 필수다.
// ★ 사무실 밖으로 판정된 좌표는 저장하지 않는다 (집 등 사생활 위치가 남지 않게). 확인된 좌표도 약 1m 단위로 줄여 저장한다.

export type OfficeLocation = { id: string; label: string | null; lat: number; lng: number; radiusM: number; active: boolean; address?: string | null };
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

export type GeoVerdict = { verified: boolean; reason: 'ok' | 'no_office' | 'no_fix' | 'low_accuracy' | 'outside'; nearestM: number | null; locationId: string | null };

/** 켜진 사무실 위치 중 하나의 반경 안인가. 오차가 크면 확인하지 않는다 */
export function verifyGeo(coords: Coords | null, locations: readonly OfficeLocation[]): GeoVerdict {
  const on = locations.filter((l) => l.active);
  if (on.length === 0) return { verified: false, reason: 'no_office', nearestM: null, locationId: null };
  if (!coords) return { verified: false, reason: 'no_fix', nearestM: null, locationId: null };
  if (coords.accuracyM > MAX_ACCURACY_M) return { verified: false, reason: 'low_accuracy', nearestM: null, locationId: null };
  let nearest = Infinity;
  let hit: { id: string; d: number } | null = null; // 반경이 겹치면 가장 가까운 장소로 적는다
  for (const l of on) {
    const d = distanceM(coords, l);
    if (d < nearest) nearest = d;
    if (d <= l.radiusM && (!hit || d < hit.d)) hit = { id: l.id, d };
  }
  return { verified: !!hit, reason: hit ? 'ok' : 'outside', nearestM: Math.round(nearest), locationId: hit?.id ?? null };
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

/**
 * 그 직원이 쓸 수 있는 출퇴근 장소 (의뢰인 2026-10-10: 시프티처럼 지점마다 장소를 붙인다).
 * 소속 지점(또는 그 상위 지점)에 붙인 장소가 있으면 그것만, 하나도 없으면 켜진 장소 전체 — 붙이기 전에도 지금처럼 돌아간다.
 */
export function allowedLocations(locations: readonly OfficeLocation[], links: readonly { groupId: string; locationId: string }[], groupIds: readonly string[]): OfficeLocation[] {
  const mine = new Set(links.filter((k) => groupIds.includes(k.groupId)).map((k) => k.locationId));
  const picked = locations.filter((l) => l.active && mine.has(l.id));
  return picked.length > 0 ? picked : locations.filter((l) => l.active);
}

/** 장소 이름·주소·메모: 비우면 null, 너무 길면 undefined */
export function cleanPlaceText(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim();
  if (s === '') return null;
  return s.length <= max ? s : undefined;
}

// ── 지도 계산 (웹 메르카토르, 타일 256px) — 지도 부품이 쓴다. 순수함수라 여기서 검사한다
export const TILE = 256;
export function worldPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = TILE * 2 ** zoom;
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
export function latLngOf(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = TILE * 2 ** zoom;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lng: (x / n) * 360 - 180 };
}
/** 그 위도에서 화면 1px이 몇 m인가 */
export const metersPerPx = (lat: number, zoom: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
