'use client';
// 현황판 자동 새로고침 30초 (7-9 요점 5). 화면이 백그라운드로 가면 멈춘다(배터리), 돌아오면 바로 한 번.
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(() => router.refresh(), seconds * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        router.refresh();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [router, seconds]);
  return null;
}
