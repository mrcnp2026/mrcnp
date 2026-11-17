'use client';
// 화면을 그리다 서버 · DB가 잠깐 응답하지 않을 때의 안내 (2026-11-17 의뢰인: Supabase 서울 리전 장애 때 영어 「Application error」 하얀 화면이 떴다).
// 메뉴 틀은 그대로 두고 본문 자리에만 뜬다(app/admin · app/punch의 error.tsx). 「다시 시도」는 서버 화면을 새로 받아 다시 그린다.
// 문구는 messages/error-screen.json — 맨 바깥 틀까지 실패하면(global-error) 번역 공급자가 없어 큰 문구 파일 대신 이 작은 파일만 읽는다.
import { RefreshCw } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { Button } from '@/components/ui';
import text from '../../messages/error-screen.json';

export function ErrorView({ locale, digest, onRetry }: { locale: string; digest?: string; onRetry: () => void }) {
  const m = locale === 'en' ? text.en : text.ko;
  return (
    <div role="alert" className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-warn-tint text-warn">
        <RefreshCw size={22} strokeWidth={1.75} />
      </span>
      <h1 className="text-xl font-bold">{m.title}</h1>
      <p className="text-sm text-muted">{m.body}</p>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button type="button" onClick={onRetry} className="sm:min-w-32">{m.retry}</Button>
        {/* 보통 <a> — 틀이 깨진 상태에서도 확실히 처음부터 다시 받게(화면 안 이동은 깨진 틀을 그대로 쓴다) */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="inline-flex min-h-11 items-center justify-center rounded-button border border-border bg-bg px-4 text-sm font-semibold text-text hover:bg-surface sm:min-w-32">{m.home}</a>
      </div>
      {digest && <p className="num text-xs text-faint">{m.reference.replace('{id}', digest)}</p>}
    </div>
  );
}

export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  const router = useRouter();
  return <ErrorView locale={locale} digest={error.digest} onRetry={() => startTransition(() => { router.refresh(); reset(); })} />;
}
