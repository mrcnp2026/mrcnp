'use client';
// 현황판 자동 새로고침 (7-9 요점 5는 30초). 화면이 백그라운드로 가면 멈춘다(배터리), 돌아오면 바로 한 번 — 마지막 새로고침 30초 안이면 건너뛴다.
// 2026-11-04: 한 번에 서버가 회사 전체 기록을 수십 번 읽는다 — 30초면 켜 둔 PC 한 대가 하루 1,200번이라 2분으로 늘렸다(사용량 초과로 운영 정지)
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const start = () => {
      if (!timer) timer = setInterval(refresh, seconds * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        if (Date.now() - last >= 30_000) refresh();
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
