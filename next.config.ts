import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// 다국어 설정 파일: src/i18n/request.ts (7-11)
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // 명세서 PDF에 심는 글꼴 파일을 서버 묶음에 함께 올린다 (src/lib/payroll/slip-pdf.ts)
  // 글꼴 추리기(subset-font)는 wasm 파일을 읽으므로 묶지 않고 node_modules에서 그대로 쓴다
  serverExternalPackages: ['subset-font', 'harfbuzzjs', 'sharp'], // sharp: 회사 로고 여백 자르기 · 크기 맞추기 (2026-10-18)
  // PDF를 만드는 곳에 글꼴을 같이 싣는다 — 증명서 · 인사기록카드(2026-10-29)는 주소가 /pdf로 끝나지 않아 따로 적는다(빠지면 운영에서만 글꼴을 못 찾는다)
  outputFileTracingIncludes: { '/api/**/pdf': ['./src/assets/fonts/*.ttf'], '/api/certificates/**': ['./src/assets/fonts/*.ttf'], '/api/admin/certificates/**': ['./src/assets/fonts/*.ttf'], '/api/admin/members/**': ['./src/assets/fonts/*.ttf'] },
  // 한 번 본 화면은 30초 동안 브라우저가 들고 있다가 다시 열 때 바로 보여 준다 — 화면을 오갈 때마다 회색 자리(PageSkeleton)가
  // 번쩍이던 것을 줄인다 (2026-10-28 의뢰인: 「페이지 넘길 때 스켈레톤이 심하다」). 저장 · 수정 뒤에는 revalidatePath · router.refresh가 새로 받는다.
  experimental: { staleTimes: { dynamic: 30, static: 30 } }, // static: 메뉴에 손이 닿을 때 미리 받은 화면(IntentLink)을 30초만 쓴다 — 기본 5분이면 오래된 숫자가 보인다 (2026-10-29)
};

export default withNextIntl(nextConfig);
