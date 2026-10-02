// 번역 파일 읽기 + 없는 키는 영어로 채우기 (4-10: "번역 없는 키 en으로 대체, 개발 모드에서는 [missing] 표시")
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import th from '../../messages/th.json';
import vi from '../../messages/vi.json';
import type { Locale } from './locales';

type Tree = { [k: string]: string | Tree };

const FILES: Record<Locale, Tree> = { en, ko, vi, th } as unknown as Record<Locale, Tree>;

/** primary에 없는 키를 fallback 값으로 채운다. markMissing이면 "[missing] 영어 문구"로 보여 개발 중에 눈에 띄게 한다 */
export function withFallback(primary: Tree, fallback: Tree, markMissing: boolean): Tree {
  const out: Tree = {};
  for (const [k, fb] of Object.entries(fallback)) {
    const p = primary[k];
    if (typeof fb === 'object') {
      out[k] = withFallback(typeof p === 'object' ? p : {}, fb, markMissing);
    } else if (typeof p === 'string' && p.length > 0) {
      out[k] = p;
    } else {
      out[k] = markMissing ? `[missing] ${fb}` : fb;
    }
  }
  return out;
}

export function messagesFor(locale: Locale, markMissing = process.env.NODE_ENV === 'development'): Tree {
  if (locale === 'en') return FILES.en;
  return withFallback(FILES[locale], FILES.en, markMissing);
}
