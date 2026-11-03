// 홈 화면에 추가해서 앱처럼 쓰기 (PWA, 마스터 5장). 첫 화면은 로그인 상태에 따라 직원 홈/관리자 홈으로 간다.
import type { MetadataRoute } from 'next';
import { BRAND } from '@/config/brand';
import { COLORS } from '@/config/theme';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.appName,
    short_name: BRAND.name,
    start_url: '/',
    display: 'standalone',
    background_color: COLORS.bg,
    theme_color: COLORS.bg,
    icons: [
      // 통합설정 › 회사 기본설정에서 올린 앱 아이콘(없으면 원래 파일) — 2026-11-03
      { src: '/api/brand/icon?s=s192', sizes: '192x192', type: 'image/png' },
      { src: '/api/brand/icon?s=s512', sizes: '512x512', type: 'image/png' },
      { src: '/api/brand/icon?s=mask512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
