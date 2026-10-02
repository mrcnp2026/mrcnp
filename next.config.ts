import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// 다국어 설정 파일: src/i18n/request.ts (7-11)
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
