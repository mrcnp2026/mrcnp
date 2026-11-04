// 회사 로고·이름 한곳 (의뢰인 제공 로고 2026-10-02: 02 attendance 작업폴더/logo.jpg).
// 원본에서 잘라 만든 파일: public/brand/logo.png(가로형), mark.png(육각형 마크), icon-*.png(홈 화면), public/brand/favicon-64.png · apple-icon.png (2026-11-03 옮김 — 탭 · 홈 화면 아이콘은 /api/brand/icon이 내보낸다).
// ⚠️ 로고의 빨강은 로고 안에서만 쓴다. 화면 색으로 가져오지 않는다 — 빨강은 위험·오류 신호 전용이다 (부록 R-10-8 색 규칙 5).
export const BRAND = {
  name: 'MRCNP',
  legalName: '(주)엠알씨앤피', // 명세서 · 증명서 등 양식에 찍는 회사 이름 (2026-10-30 의뢰인 — 붙여 쓴다)
  appName: 'MRCNP Attendance',
  logo: { src: '/brand/logo.png', width: 926, height: 279 },
  mark: { src: '/brand/mark.png', width: 512, height: 512 },
} as const;

// 앱 아이콘 크기 — 공개 아이콘 주소(/api/brand/icon)가 이것만 쓰려고 lib/logo-image(sharp 30MB)를 끌어오지 않게 여기 둔다 (2026-11-04)
export const ICON_SIZES = { s64: 64, s180: 180, s192: 192, s512: 512, mask512: 512 } as const;
export type IconSize = keyof typeof ICON_SIZES;
