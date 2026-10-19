'use client';
// 지금 위치 한 번 (최대 8초). 거절 · 실패 · 미지원이면 null — 위치 없이도 기록 · 요청은 보낸다.
// 출퇴근 찍기(TodayCard)와 요청 쓰기(외근 · 정정, 2026-10-18 결정 출퇴근-9)가 같은 것을 쓴다.
export function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}
