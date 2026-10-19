// 요청을 쓰는 순간의 위치 (2026-10-18 결정 출퇴근-9 · DB 0055) — 외근 · 출장 · 재택 신청과 정정 요청에 남긴다. 서버 전용.
// 위치를 남기는 설정(OFFICE.requestLocation)이 켜져 있고 본인이 수집에 동의했을 때만 읽는다. 아니면 비운다(요청은 그대로 보낸다).
import 'server-only';
import { OFFICE } from '@/config/office';
import { hasConsent } from '@/lib/consent';
import { parseCoords, roundCoord } from '@/lib/geo';

export async function requestGeo(employeeId: string, raw: unknown): Promise<{ lat: number; lng: number } | Record<string, never>> {
  if (!OFFICE.requestLocation) return {};
  const coords = parseCoords(raw);
  if (!coords || !(await hasConsent(employeeId))) return {};
  return { lat: roundCoord(coords.lat), lng: roundCoord(coords.lng) };
}
