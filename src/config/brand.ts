// 회사 로고·이름 한곳 (의뢰인 제공 로고 2026-10-02: 02 attendance 작업폴더/logo.jpg).
// 원본에서 잘라 만든 파일: public/brand/logo.png(가로형), mark.png(육각형 마크), icon-*.png(홈 화면), src/app/icon.png·apple-icon.png.
// ⚠️ 로고의 빨강은 로고 안에서만 쓴다. 화면 색으로 가져오지 않는다 — 빨강은 위험·오류 신호 전용이다 (부록 R-10-8 색 규칙 5).
export const BRAND = {
  name: 'MRCNP',
  appName: 'MRCNP Attendance',
  logo: { src: '/brand/logo.png', width: 926, height: 279 },
  mark: { src: '/brand/mark.png', width: 512, height: 512 },
} as const;
