'use client';
// 「요청」 화면을 열면 처리된 내 요청을 본 것으로 — 이 기기 쿠키에 연 시각을 남기고 메뉴 · 종 숫자를 바로 다시 센다 (2026-10-19 의뢰인, lib/my-decided.ts)
import { useEffect } from 'react';
import { reloadAlerts } from './Alerts';

export function SeenRequests() {
  useEffect(() => {
    document.cookie = `req_seen=${encodeURIComponent(new Date().toISOString())}; path=/; max-age=31536000; samesite=lax`;
    reloadAlerts();
  }, []);
  return null;
}
