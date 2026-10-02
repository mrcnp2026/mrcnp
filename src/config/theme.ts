// 디자인 토큰 한곳 (부록 R-10-8, ★ 의뢰인 위임으로 확정 2026-10-01).
// 방향: 흰 바탕 + 깊은 파랑 + 슬레이트, 포인트 주황(주의)·초록(정상). 장식 없이 절제·일관성·숫자 가독성.
// ⚠️ 색 값(#…)은 이 파일 밖에 쓰지 않는다 — 검사(tests/i18n-design.test.ts)가 찾아낸다.
//    토큰 이름은 역할로 (blue·orange 같은 색 이름 금지). 다크 모드는 만들지 않는다.
// 이 값들은 layout.tsx가 CSS 변수(--t-…)로 내보내고, globals.css가 Tailwind 이름(bg-primary 등)에 연결한다.

export const COLORS = {
  bg: '#FFFFFF',
  surface: '#F8FAFC',
  border: '#E2E8F0',
  text: '#0F172A', // 17.9:1
  muted: '#475569', // 7.6:1
  faint: '#64748B', // 4.8:1
  primary: '#2150C8', // 흰 글자 6.9:1 — 출근 버튼·링크·선택·승인
  'primary-tint': '#EEF3FD', // 연습 모드 배지 바탕 (주황·초록·빨강 금지, 4-6)
  'primary-deep': '#0F2A5C', // 헤더·큰 제목
  warn: '#B45309', // 주의 글자·선 5.0:1 — ⚠ 아이콘과 함께만
  'warn-tint': '#FFF7ED',
  ok: '#047857', // 정상 글자·선 5.5:1 — ✓ 아이콘과 함께만. 퇴근 버튼 바탕
  'ok-tint': '#ECFDF5',
  danger: '#B42318', // 주 52시간 초과·오류·되돌릴 수 없는 확인창에만
  'danger-tint': '#FEF3F2',
  'on-primary': '#FFFFFF',
} as const;

// 8px 격자: 4·8·12·16·24·32·48 (Tailwind 1·2·3·4·6·8·12 단계만 쓴다)
export const RADII = { card: '12px', button: '10px', punch: '16px', chip: '9999px' } as const;
// 글자 크기 12/14/16/20/24/32 — 본문 16 (외국인 직원, R-10-8)
export const FONT_SIZES = { xs: '12px', sm: '14px', base: '16px', xl: '20px', '2xl': '24px', '3xl': '32px' } as const;
export const SHADOW_CARD = '0 1px 2px rgba(15,23,42,.06)'; // 한 단계뿐. 그림자 겹침·색 그림자 없음
export const MOTION_MS = 150; // 상태 변화만. 등장 애니메이션 없음

/** layout.tsx의 :root 스타일 — 토큰을 CSS 변수로 */
export function themeCssVariables(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(COLORS)) lines.push(`--t-color-${k}:${v}`);
  for (const [k, v] of Object.entries(RADII)) lines.push(`--t-radius-${k}:${v}`);
  for (const [k, v] of Object.entries(FONT_SIZES)) lines.push(`--t-text-${k}:${v}`);
  lines.push(`--t-shadow-card:${SHADOW_CARD}`, `--t-motion:${MOTION_MS}ms`);
  return `:root{${lines.join(';')}}`;
}
