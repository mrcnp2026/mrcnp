'use client';
// 홈 화면에 추가 (PWA 설치). 2026-10-02 의뢰인 요청: 버튼으로 바로 설치되게.
// - 안드로이드 Chrome·삼성 인터넷: 브라우저가 주는 설치 이벤트(beforeinstallprompt)를 붙잡아 두었다가 버튼을 누르면 띄운다.
//   이 이벤트는 화면이 그려지기 전에 올 수 있어서 layout.tsx의 작은 스크립트가 window.__installPrompt에 먼저 받아 둔다.
// - 아이폰 Safari: 웹사이트가 직접 설치시키는 방법이 없다(애플 정책). 공유 → 홈 화면에 추가 안내를 보여 준다.
import { useEffect, useState } from 'react';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
declare global {
  interface Window {
    __installPrompt?: PromptEvent | null;
  }
}

export type InstallState = {
  platform: 'ios' | 'android' | 'other';
  installed: boolean; // 이미 앱으로 열려 있음
  canPrompt: boolean; // 버튼 한 번으로 설치 창을 띄울 수 있음
};

export function useInstall() {
  const [state, setState] = useState<InstallState | null>(null);
  useEffect(() => {
    const read = (): InstallState => {
      const ua = navigator.userAgent;
      return {
        platform: /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other',
        installed: window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
        canPrompt: !!window.__installPrompt,
      };
    };
    setState(read());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__installPrompt = e as PromptEvent;
      setState(read());
    };
    const onInstalled = () => {
      window.__installPrompt = null;
      setState({ ...read(), installed: true });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  /** 설치 창을 띄운다. 'accepted' | 'dismissed' | 'unavailable'(아이폰 등 — 안내를 보여야 함) */
  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const ev = window.__installPrompt;
    if (!ev) return 'unavailable';
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    window.__installPrompt = null; // 한 번 쓰면 다시 못 쓴다
    setState((s) => (s ? { ...s, canPrompt: false, installed: outcome === 'accepted' || s.installed } : s));
    return outcome;
  }

  return { state, promptInstall };
}

/** layout.tsx <head>에 넣는 스크립트: 화면이 그려지기 전에 온 설치 이벤트를 받아 둔다 */
export const CAPTURE_INSTALL_PROMPT = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e;});`;
