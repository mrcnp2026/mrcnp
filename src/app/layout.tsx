import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Noto_Sans, Noto_Sans_KR } from 'next/font/google';
import { CAPTURE_INSTALL_PROMPT } from '@/components/useInstall';
import { companyName } from '@/lib/company'; // 통합설정 › 회사 기본설정의 회사명 (2026-10-18)
import { themeCssVariables } from '@/config/theme';
import { FxObserver } from '@/components/FxObserver';
import { NavProgress } from '@/components/NavProgress';
import { PickerHost } from '@/components/PickerHost';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'; // 한글 · 영문 글꼴 (OFL). 쓰는 글자 조각만 내려받는다
import './globals.css';

// 7-11 요점 5: 베트남어 성조 부호·태국 문자가 □로 깨지지 않게 Noto 글꼴. 빌드는 성공해도 글자만 깨지는 곳이다 (B-18)
const latin = Noto_Sans({ subsets: ['latin'], weight: ['400', '500', '700', '800'], variable: '--font-latin' }); // 태국어 · 베트남어 글꼴은 2026-10-22 언어를 빼며 뺐다
const kr = Noto_Sans_KR({ weight: ['400', '500', '700', '800'], variable: '--font-kr', preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return { title: `${await companyName()} ${t('appName')}` };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const tc = await getTranslations('common');
  const isDev = process.env.VERCEL_ENV === 'preview'; // 개발 서버(미리보기)에서만 — 운영과 헷갈리지 않게 (2026-10-25 의뢰인)
  return (
    <html lang={locale} className={`${latin.variable} ${kr.variable}`} suppressHydrationWarning>
      <head>
        <style>{themeCssVariables()}</style>
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
        {/* 그래프 움직임은 보일 때 시작 — 그리기 전에 표시해 두어야 처음에 한 번 움직였다 멈추는 깜빡임이 없다 (FxObserver) */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('fx-js')" }} />
      </head>
      <body className="min-h-dvh font-sans text-text antialiased">
        <NextIntlClientProvider>
          {isDev && <div role="status" data-noprint className="sticky top-0 z-50 bg-danger px-3 py-1 text-center text-sm font-bold text-on-primary">{tc('devBanner')}</div>}
          {children}
          <PickerHost />
        </NextIntlClientProvider>
        <FxObserver />
        <NavProgress />
      </body>
    </html>
  );
}
