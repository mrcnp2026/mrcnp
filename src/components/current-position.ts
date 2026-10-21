'use client';
// 지금 위치 한 번 (최대 8초). 거절 · 실패 · 미지원이면 null — 위치 없이도 기록 · 요청은 보낸다.
// 출퇴근 찍기(TodayCard)와 요청 쓰기(외근 · 정정, 2026-10-18 결정 출퇴근-9)가 같은 것을 쓴다.
// 한 번이라도 위치를 받으면 이 기기에 표시를 남긴다 — 아이폰 Safari(위치 「다음 번에 묻기」)와 안드로이드 「이번만 허용」은
// 허용한 뒤에도 브라우저가 「아직 안 물음」으로 알려 줘서 홈의 위치 허용 안내가 매번 다시 떴다 (2026-10-21 의뢰인). LocationPrompt가 이 표시를 본다.
export const GEO_OK_KEY = 'geo-ok';

export function rememberGeoOk(): void {
  try {
    localStorage.setItem(GEO_OK_KEY, '1');
  } catch {}
}
export function geoOkBefore(): boolean {
  try {
    return localStorage.getItem(GEO_OK_KEY) === '1';
  } catch {
    return false;
  }
}

export function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        rememberGeoOk();
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}
