'use client';
// 맨 바깥 틀(app/layout — 회사명 등을 DB에서 읽는다)까지 실패했을 때의 안내 (2026-11-17 Supabase 장애). 번역 공급자가 없어 브라우저 언어로 고른다
import { ErrorView } from '@/components/ErrorScreen';
import './globals.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = typeof navigator !== 'undefined' && !navigator.language.startsWith('ko') ? 'en' : 'ko';
  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">
        <ErrorView locale={locale} digest={error.digest} onRetry={reset} />
      </body>
    </html>
  );
}
