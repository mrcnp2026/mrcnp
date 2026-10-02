// 언어 목록과 검수 상태 (4-10, 7-11). 화면 문구는 messages/*.json에만 쓴다.
import status from '../../messages/_status.json';

export const LOCALES = ['ko', 'en', 'vi', 'th'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_EMPLOYEE_LOCALE: Locale = 'en'; // 직원 1순위
export const DEFAULT_ADMIN_LOCALE: Locale = 'ko';
export const FALLBACK_LOCALE: Locale = 'en'; // 번역 없는 키는 영어로

// 7-11 요점 6: 언어 전환 버튼은 **각 언어의 자기 이름**으로. 영어를 못 읽는 직원도 자기 언어를 찾을 수 있게.
// 언어 이름은 번역하지 않는 고정값이라 번역 파일이 아니라 여기에 둔다.
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
  th: 'ภาษาไทย',
  ko: '한국어',
};

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

type Status = Record<string, { reviewed?: boolean } | string>;

/** 언어 선택 목록 (자기 이름 표기) */
export function languageOptions(): { code: Locale; name: string }[] {
  return selectableLocales().map((code) => ({ code, name: LOCALE_NAMES[code] }));
}

/** 검수 안 된 언어(vi·th)는 고를 수 없다 (4-10, B-21) */
export function selectableLocales(s: Status = status as Status): Locale[] {
  return LOCALES.filter((l) => {
    const v = s[l];
    return typeof v === 'object' && v?.reviewed === true;
  });
}
