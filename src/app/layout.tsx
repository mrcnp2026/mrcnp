import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Noto_Sans, Noto_Sans_KR, Noto_Sans_Thai } from 'next/font/google';
import { BRAND } from '@/config/brand';
import { themeCssVariables } from '@/config/theme';
import './globals.css';

// 7-11 요점 5: 베트남어 성조 부호·태국 문자가 □로 깨지지 않게 Noto 글꼴. 빌드는 성공해도 글자만 깨지는 곳이다 (B-18)
const latin = Noto_Sans({ subsets: ['latin', 'vietnamese'], weight: ['400', '600', '700'], variable: '--font-latin' });
const thai = Noto_Sans_Thai({ subsets: ['thai'], weight: ['400', '600', '700'], variable: '--font-thai' });
const kr = Noto_Sans_KR({ weight: ['400', '600', '700'], variable: '--font-kr', preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return { title: `${BRAND.name} ${t('appName')}` };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${latin.variable} ${thai.variable} ${kr.variable}`}>
      <head>
        <style>{themeCssVariables()}</style>
      </head>
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
