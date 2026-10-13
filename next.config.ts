import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// 다국어 설정 파일: src/i18n/request.ts (7-11)
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // 명세서 PDF에 심는 글꼴 파일을 서버 묶음에 함께 올린다 (src/lib/payroll/slip-pdf.ts)
  // 글꼴 추리기(subset-font)는 wasm 파일을 읽으므로 묶지 않고 node_modules에서 그대로 쓴다
  serverExternalPackages: ['subset-font', 'harfbuzzjs'],
  outputFileTracingIncludes: { '/api/**/pdf': ['./src/assets/fonts/*.ttf'] },
};

export default withNextIntl(nextConfig);
