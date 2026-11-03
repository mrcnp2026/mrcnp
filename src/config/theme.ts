// 디자인 토큰 한곳 (부록 R-10-8, ★ 의뢰인 위임으로 확정 2026-10-01).
// 방향 (2026-10-10 의뢰인: "시프티와 차이가 많다" — 시프티처럼 각진 카드·화면 끝까지 닿는 목록·짙은 남색 하단 탭으로 바꿈. 색 값은 우리 것 그대로).
// 이전 방향 (2026-10-02 의뢰인 선택 "토스풍 시안"): 연회색 바탕 + 테두리 없는 큰 흰 카드 + 아주 큰 숫자, 파랑 하나.
// 포인트 주황(주의)·초록(정상). 장식 없이 크기와 굵기 차이로 위계를 만든다.
// ⚠️ 색 값(#…)은 이 파일 밖에 쓰지 않는다 — 검사(tests/i18n-design.test.ts)가 찾아낸다.
//    토큰 이름은 역할로 (blue·orange 같은 색 이름 금지). 다크 모드는 만들지 않는다.
// 이 값들은 layout.tsx가 CSS 변수(--t-…)로 내보내고, globals.css가 Tailwind 이름(bg-primary 등)에 연결한다.
// 2026-10-22 의뢰인(결정 사항 개발-52): 「우리 색으로, 어울리는 색으로」 + 「글래스 효과를 통합설정 포함 전반적으로」
//   → 처음엔 로고 빨강으로 바꿨다가, 같은 날 의뢰인: 「색상은 파란색 계통이 좋은 거 같아, 빨간색 별로야」 → 파란 계열로 되돌림(더 맑은 파랑 #1D4ED8).
//   바탕은 서늘한 회색 + 옅은 빛(aura 세 가지: 하늘 · 보라빛 · 물빛) 위에 반투명 흰 판(글래스)을 얹는다 — globals.css 「글래스」.
// 2026-10-27 의뢰인: 온디랩스 디자인 키트(Code and Chill 'Corvane' 참고)의 바탕 · 카드 · 등장 효과가 마음에 든다 → 키트 색(미색 바탕 · 초록 강조)으로 바꿈. 남청색은 유지 안 해도 된다고 함.

export const COLORS = {
  // 2026-10-27 의뢰인: 「키트 색상으로 가는 게 좋겠다 · 남청색은 유지 안 해도 된다」 — 온디랩스 디자인 키트(레퍼런스 폴더) 색으로 바꿈.
  //   따뜻한 미색 바탕 + 살짝 떠 보이는 카드 + 깊은 초록 강조색. 이전 남청색 판은 백업/theme-남청색-2026-10-27.ts
  bg: '#FBFAF6', // 카드 바탕 (키트 card) — 순백이 아니라 아주 옅은 미색
  surface: '#F2F0EA', // 화면 바탕 (키트 bg) — 차가운 회색 대신 따뜻한 미색
  border: '#E4E0D7', // 목록 구분선·입력칸 테두리
  text: '#1D1C1A', // 카드 위 16.3:1
  muted: '#5F5B54', // 5.9:1 (바탕)
  faint: '#68635B', // 5.2:1 (바탕)
  primary: '#1F6B57', // 흰 글자 6.4:1 — 출근 버튼·링크·선택·승인 (키트 accent)
  'primary-tint': '#DBE9E2', // 고른 메뉴 · 보조 버튼 바탕 (키트 accent-soft)
  'primary-deep': '#1D1E20', // 큰 제목·퇴근 버튼·가장 중요한 버튼 (키트 ink)
  warn: '#8A5A00', // 주의 글자·선 — ⚠ 아이콘과 함께만
  'warn-tint': '#F5EAD6',
  ok: '#1F6B57', // 정상 글자·선 — ✓ 아이콘과 함께만 (키트 good = accent)
  'ok-tint': '#DCE6D9',
  danger: '#A63A2E', // 주 52시간 초과·오류·되돌릴 수 없는 확인창에만
  'danger-tint': '#F6E2DD',
  'on-primary': '#FFFFFF',
  nav: '#1D1E20', // 폰 하단 탭 바탕 (키트 ink) — 흰 글자 16:1
  rail: '#F5F3EE', // PC 앱 띠 바탕 (키트 card-2)
  // 예전 글래스 뒤 옅은 빛 — 지금은 쓰지 않는다(이름만 남김)
  'aura-1': '#E9E3D6',
  'aura-2': '#E6E9DF',
  'aura-3': '#E3E8EC',
  'primary-ink': '#185645', // 링크 · 강조 글자 — 카드 위 8.2:1
  // 그래프 보조색 — 그래프 칸에만, 이름 · 숫자와 함께
  'chart-idle': '#C9C4B8', // 미출근 조각 (키트 bar)
  'chart-extra': '#C08A2E', // 연장 · 야간 · 지각 조각 (키트 amber)
  // 지표 타일 파스텔 4색 (키트 tile-1~4): 샌드 · 세이지 · 미스트 · 클레이 — 글자는 text · muted만 올린다
  'tile-1': '#ECE2D1',
  'tile-2': '#DCE6D9',
  'tile-3': '#DBE3EC',
  'tile-4': '#EFDCD5',
  'accent-2': '#5FA58A', // 곡선 그라데이션 시작색 (primary보다 밝게)
} as const;

// 8px 격자: 4·8·12·16·24·32·48 (Tailwind 1·2·3·4·6·8·12 단계만 쓴다)
// 메일(HTML)에 쓰는 색 — 메일 앱은 CSS 변수를 못 읽어 값을 그대로 적어야 한다. 앱 화면 색과 따로 두되 이 파일에만 둔다.
export const MAIL_COLORS = { page: '#f4f6fa', card: '#ffffff', text: '#1f2937', body: '#374151', muted: '#6b7280', faint: '#9ca3af', action: '#2563eb', onAction: '#ffffff' } as const;
// 앱 아이콘 · 로고 맞추기의 흰 바탕 — 폰 홈 화면 아이콘은 투명이면 기종마다 검게 보여서 순백으로 채운다 (2026-11-03)
export const ICON_BG = '#FFFFFF';
export const RADII = { card: '14px', button: '11px', punch: '11px', chip: '9999px' } as const; // 2026-10-27 키트: 둥근 카드 (이전 6/4px)
// PC(1024px~) 디자인 기준 — 2026-10-14 의뢰인이 견본 「나 · 파랑」을 골랐다 (결정 사항 개발-22, `09 디자인 기준 견본 (2026-10-14).html`).
//   본문 14px · 카드 모서리 12px · 버튼 8px · 옅은 선 · 강조색 한 가지(파랑) · 상태는 옅은 바탕 + 진한 글자 딱지.
//   이전 기준(2026-10-11 시프티 PC: 각진 3px 모서리 · 13px · 짙은 남색 왼쪽 메뉴)을 바꾼 것이다. 폰 값은 건드리지 않는다.
export const RADII_PC = { card: '18px', button: '11px', punch: '11px' } as const; // 2026-10-27 키트 r-card 18 · r-ctl 11 (이전 12/8px)
export const COLORS_PC = {
  // 2026-10-27 키트 색으로 — 폰과 같은 값 (PC만 다르게 둘 이유가 없어졌다)
  surface: COLORS.surface,
  border: COLORS.border,
  text: COLORS.text,
  muted: COLORS.muted,
  primary: COLORS.primary,
  'primary-tint': COLORS['primary-tint'],
  'primary-deep': COLORS['primary-deep'],
  ok: COLORS.ok,
  'ok-tint': COLORS['ok-tint'],
  'warn-tint': COLORS['warn-tint'],
  danger: COLORS.danger,
  'danger-tint': COLORS['danger-tint'],
} as const;
export const FONT_SIZES_PC = { xs: '12px', sm: '14px', base: '14px', lg: '16px', xl: '18px', '2xl': '24px', '3xl': '28px', '4xl': '36px' } as const;
export const SHADOW_CARD_PC = '0 1px 2px #28221a0a, 0 10px 28px -22px #28221a33'; // 키트 shadow를 한 단계 옅게 (2026-10-27 의뢰인: 그림자가 조금 심하다)
export const SHADOW_POP = '0 24px 60px -18px #1e1a1452, 0 2px 6px #1e1a1414'; // 떠 있는 것 · PC에서 카드에 마우스를 올렸을 때 (키트 shadow-pop)
// 글래스 판의 그림자 (2026-10-22): 바깥은 아주 옅은 남색 퍼짐, 안쪽 위 가장자리는 흰 빛 한 줄 — 유리 모서리처럼 보인다
// 카드에 마우스를 올렸을 때 — 시안(원장 대시보드)의 --shadow-hover. 한 단계만 깊어진다 (2026-10-27 의뢰인: 호버가 너무 심하다 → shadow-pop 대신)
export const SHADOW_HOVER = '0 1px 3px #28221a0d, 0 16px 34px -24px #28221a47'; // 2026-10-27 2차(의뢰인: 「팍 튀어나오고 많이 튀어나온다 · 그림자도 심하다」) — 한 단계만, 옅게
export const SHADOW_GLASS = '0 10px 30px -12px rgb(40 34 26 / 0.14), inset 0 1px 0 0 rgb(255 255 255 / 0.65)';
export const SHADOW_SHEET = '0 -8px 40px 0 rgb(30 26 20 / 0.22)'; // 통합설정 판
export const PC_MIN_WIDTH = '1024px'; // Tailwind lg와 같게
// 글자 크기 12/14/16/20/24/32 — 본문 16 (외국인 직원, R-10-8)
// 큰 숫자(지금 시각·근무 시간)만 4xl 44px — 화면에서 가장 먼저 읽혀야 하는 것 하나
export const FONT_SIZES = { xs: '12px', sm: '14px', base: '16px', lg: '18px', xl: '20px', '2xl': '24px', '3xl': '32px', '4xl': '44px' } as const;
export const SHADOW_CARD = '0 1px 2px #28221a0a, 0 10px 28px -22px #28221a33'; // 2026-10-27 키트: 폰도 같은 옅은 그림자 (이전: 그림자 없음)
export const MOTION_MS = 150; // 상태 변화만. 등장 애니메이션 없음

/** layout.tsx의 :root 스타일 — 토큰을 CSS 변수로 */
// PC 글자 · 모서리는 rem으로 낸다 — 큰 모니터에서 화면 전체를 같은 비율로 키우기 위해(globals.css의 「큰 모니터」). 1920 이하에서는 16px 기준이라 px와 똑같다
const rem = (v: string) => (v.endsWith('px') ? `${Number.parseFloat(v) / 16}rem` : v);

export function themeCssVariables(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(COLORS)) lines.push(`--t-color-${k}:${v}`);
  for (const [k, v] of Object.entries(RADII)) lines.push(`--t-radius-${k}:${v}`);
  for (const [k, v] of Object.entries(FONT_SIZES)) lines.push(`--t-text-${k}:${v}`);
  lines.push(`--t-shadow-card:${SHADOW_CARD}`, `--t-shadow-pop:${SHADOW_POP}`, `--t-shadow-hover:${SHADOW_HOVER}`, `--t-shadow-glass:${SHADOW_GLASS}`, `--t-shadow-sheet:${SHADOW_SHEET}`, `--t-motion:${MOTION_MS}ms`);
  const pc = [
    ...Object.entries(RADII_PC).map(([k, v]) => `--t-radius-${k}:${rem(v)}`),
    ...Object.entries(COLORS_PC).map(([k, v]) => `--t-color-${k}:${v}`),
    ...Object.entries(FONT_SIZES_PC).map(([k, v]) => `--t-text-${k}:${rem(v)}`),
    `--t-shadow-card:${SHADOW_CARD_PC}`,
  ];
  return `:root{${lines.join(';')}}@media (min-width:${PC_MIN_WIDTH}){:root{${pc.join(';')}}}`;
}
