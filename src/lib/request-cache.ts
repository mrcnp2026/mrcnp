// 한 요청 안에서 한 번만 — React cache와 같게 쓰되, API(route handler)에서도 듣게 한다.
// React cache는 화면을 그릴 때만 기억하고 API에서는 매번 새로 부른다(react.react-server: 디스패처가 없으면 그냥 호출).
// 그래서 종 숫자 API 한 번에 getMe · 검사 계정 목록 · 지점 범위를 여러 번 읽었다 (2026-11-05 운영 DB 기록: 하루 profiles 1만 4천 번).
// 열쇠는 요청마다 하나인 headers() 객체다(Next가 요청별로 같은 객체를 돌려준다). 요청 밖(스크립트 · after)이면 React cache로 돌아간다.
// 인자는 문자열 · 숫자 · 참거짓 · null만 쓴다(JSON으로 묶는다).
import { headers } from 'next/headers';
import { cache as reactCache } from 'react';

export function cache<A extends (string | number | boolean | null | undefined)[], R>(fn: (...args: A) => R): (...args: A) => R {
  const byRequest = new WeakMap<object, Map<string, R>>();
  const fallback = reactCache(fn);
  return (...args: A) => {
    let req: object | null = null;
    try {
      req = headers() as unknown as object;
    } catch {
      return fallback(...args);
    }
    let memo = byRequest.get(req);
    if (!memo) byRequest.set(req, (memo = new Map()));
    const key = JSON.stringify(args);
    if (!memo.has(key)) memo.set(key, fn(...args));
    return memo.get(key)!;
  };
}
