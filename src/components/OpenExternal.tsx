'use client';
// 앱 안 브라우저 탈출 (2026-10-02 의뢰인 요청: "카톡으로 받은 링크를 누르면 바로 등록돼야 한다").
// 내장 브라우저에서 로그인하면 그 앱 안에만 로그인이 남아, 홈 화면 아이콘으로 열 때 다시 로그인해야 한다. 그래서 열리자마자 폰의 기본 브라우저로 넘긴다.
// - 카카오톡: 공식 스킴 kakaotalk://web/openExternal (아이폰·안드로이드 모두)
// - 라인: ?openExternalBrowser=1
// - 그 밖의 안드로이드 앱 안 브라우저(네이버·인스타그램 등): intent://…;package=com.android.chrome
// 넘어가지 못하는 경우(아이폰의 네이버·인스타그램 등)에도 로그인은 된다 (비밀번호 로그인은 내장 브라우저에서도 동작한다).
import { useEffect } from 'react';

export function OpenExternal() {
  useEffect(() => {
    const ua = navigator.userAgent;
    const here = window.location.href;
    if (/KAKAOTALK/i.test(ua)) {
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(here)}`;
      return;
    }
    if (/Line\//i.test(ua) && !/openExternalBrowser=1/.test(here)) {
      const u = new URL(here);
      u.searchParams.set('openExternalBrowser', '1');
      window.location.href = u.toString();
      return;
    }
    if (/Android/i.test(ua) && /NAVER|Instagram|FBAN|FBAV|FB_IAB|DaumApps|everytimeApp|; wv\)/i.test(ua)) {
      const u = new URL(here);
      window.location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
    }
  }, []);
  return null;
}
