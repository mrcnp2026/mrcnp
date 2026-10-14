// 디자인 토큰 한곳 (부록 R-10-8, ★ 의뢰인 위임으로 확정 2026-10-01).
// 방향 (2026-10-10 의뢰인: "시프티와 차이가 많다" — 시프티처럼 각진 카드·화면 끝까지 닿는 목록·짙은 남색 하단 탭으로 바꿈. 색 값은 우리 것 그대로).
// 이전 방향 (2026-10-02 의뢰인 선택 "토스풍 시안"): 연회색 바탕 + 테두리 없는 큰 흰 카드 + 아주 큰 숫자, 파랑 하나.
// 포인트 주황(주의)·초록(정상). 장식 없이 크기와 굵기 차이로 위계를 만든다.
// ⚠️ 색 값(#…)은 이 파일 밖에 쓰지 않는다 — 검사(tests/i18n-design.test.ts)가 찾아낸다.
//    토큰 이름은 역할로 (blue·orange 같은 색 이름 금지). 다크 모드는 만들지 않는다.
// 이 값들은 layout.tsx가 CSS 변수(--t-…)로 내보내고, globals.css가 Tailwind 이름(bg-primary 등)에 연결한다.

export const COLORS = {
  bg: '#FFFFFF',
  surface: '#F2F4F6', // 화면 바탕 (카드는 흰색)
  border: '#E5E8EB', // 목록 구분선·입력칸 테두리만. 카드에는 테두리를 쓰지 않는다
  text: '#191F28', // 16.9:1
  muted: '#4E5968', // 6.6:1 (회색 바탕)
  faint: '#646E7B', // 4.7:1 (회색 바탕)
  primary: '#2150C8', // 흰 글자 6.9:1 — 출근 버튼·링크·선택·승인
  'primary-tint': '#EEF3FD', // 연습 모드 배지 바탕 (주황·초록·빨강 금지, 4-6)
  'primary-deep': '#191F28', // 큰 제목·퇴근 버튼 바탕 (거의 검정)
  warn: '#B45309', // 주의 글자·선 5.0:1 — ⚠ 아이콘과 함께만
  'warn-tint': '#FFF7ED',
  ok: '#047857', // 정상 글자·선 5.5:1 — ✓ 아이콘과 함께만. 퇴근 버튼 바탕
  'ok-tint': '#ECFDF5',
  danger: '#B42318', // 주 52시간 초과·오류·되돌릴 수 없는 확인창에만
  'danger-tint': '#FEF3F2',
  'on-primary': '#FFFFFF',
  nav: '#24385F', // 폰 하단 탭 바탕 (짙은 남색) — 흰 글자 11.6:1
  rail: '#F4F6FB', // PC 앱 띠 바탕 (아주 옅은 파랑 회색)
} as const;

// 8px 격자: 4·8·12·16·24·32·48 (Tailwind 1·2·3·4·6·8·12 단계만 쓴다)
export const RADII = { card: '6px', button: '4px', punch: '4px', chip: '9999px' } as const;
// PC(1024px~) 디자인 기준 — 2026-10-14 의뢰인이 견본 「나 · 파랑」을 골랐다 (결정 사항 개발-22, `09 디자인 기준 견본 (2026-10-14).html`).
//   본문 14px · 카드 모서리 12px · 버튼 8px · 옅은 선 · 강조색 한 가지(파랑) · 상태는 옅은 바탕 + 진한 글자 딱지.
//   이전 기준(2026-10-11 시프티 PC: 각진 3px 모서리 · 13px · 짙은 남색 왼쪽 메뉴)을 바꾼 것이다. 폰 값은 건드리지 않는다.
export const RADII_PC = { card: '12px', button: '8px', punch: '8px' } as const;
export const COLORS_PC = {
  surface: '#F5F6F8',
  border: '#E6E9EE',
  text: '#1B1F24', // 16.5:1
  muted: '#5D6672', // 5.9:1
  primary: '#2150C8', // 흰 글자 6.9:1
  'primary-tint': '#EAF0FD',
  'primary-deep': '#1B1F24',
  ok: '#0A7D54', // 흰 바탕 5.2:1
  'ok-tint': '#E6F6EE',
  'warn-tint': '#FFF3E3',
  danger: '#C62828', // 흰 글자 5.6:1
  'danger-tint': '#FDECEC',
} as const;
export const FONT_SIZES_PC = { xs: '12px', sm: '14px', base: '14px', lg: '16px', xl: '18px', '2xl': '24px', '3xl': '28px', '4xl': '36px' } as const;
export const SHADOW_CARD_PC = '0 1px 2px 0 rgb(27 31 36 / 0.05)';
export const SHADOW_POP = '0 8px 24px 0 rgb(27 31 36 / 0.12)'; // 떠 있는 것(검색 결과 · 내 메뉴)에만
export const PC_MIN_WIDTH = '1024px'; // Tailwind lg와 같게
// 글자 크기 12/14/16/20/24/32 — 본문 16 (외국인 직원, R-10-8)
// 큰 숫자(지금 시각·근무 시간)만 4xl 44px — 화면에서 가장 먼저 읽혀야 하는 것 하나
export const FONT_SIZES = { xs: '12px', sm: '14px', base: '16px', lg: '18px', xl: '20px', '2xl': '24px', '3xl': '32px', '4xl': '44px' } as const;
export const SHADOW_CARD = 'none'; // 토스풍: 그림자 없이 흰 카드와 회색 바탕의 대비만
export const MOTION_MS = 150; // 상태 변화만. 등장 애니메이션 없음

/** layout.tsx의 :root 스타일 — 토큰을 CSS 변수로 */
export function themeCssVariables(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(COLORS)) lines.push(`--t-color-${k}:${v}`);
  for (const [k, v] of Object.entries(RADII)) lines.push(`--t-radius-${k}:${v}`);
  for (const [k, v] of Object.entries(FONT_SIZES)) lines.push(`--t-text-${k}:${v}`);
  lines.push(`--t-shadow-card:${SHADOW_CARD}`, `--t-shadow-pop:${SHADOW_POP}`, `--t-motion:${MOTION_MS}ms`);
  const pc = [
    ...Object.entries(RADII_PC).map(([k, v]) => `--t-radius-${k}:${v}`),
    ...Object.entries(COLORS_PC).map(([k, v]) => `--t-color-${k}:${v}`),
    ...Object.entries(FONT_SIZES_PC).map(([k, v]) => `--t-text-${k}:${v}`),
    `--t-shadow-card:${SHADOW_CARD_PC}`,
  ];
  return `:root{${lines.join(';')}}@media (min-width:${PC_MIN_WIDTH}){:root{${pc.join(';')}}}`;
}
