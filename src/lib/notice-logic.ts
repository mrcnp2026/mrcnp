// 공지 — 순수함수 (②-5 7-15). DB·네트워크를 건드리지 않는다.

export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  important: boolean;
  legal: boolean;
  audience: 'all' | 'selected';
  startsAt: Date;
  endsAt: Date | null;
  status: 'draft' | 'published' | 'archived';
  version: number;
  createdAt: Date;
};

export type TranslationRow = {
  locale: string;
  title: string;
  body: string;
  source: 'machine' | 'human';
  reviewed: boolean;
  numbersOk: boolean;
  basedOnVersion: number;
};

export type NoticeState = 'draft' | 'scheduled' | 'live' | 'ended' | 'archived';

/** 게시 상태는 저장하지 않고 계산한다 (요점 13, B-43) */
export function noticeState(n: Pick<NoticeRow, 'status' | 'startsAt' | 'endsAt'>, now: Date): NoticeState {
  if (n.status === 'archived') return 'archived';
  if (n.status === 'draft') return 'draft';
  if (now < n.startsAt) return 'scheduled';
  if (n.endsAt && now >= n.endsAt) return 'ended';
  return 'live';
}

// 달 이름은 숫자로 읽는다 — "3월" → "March"가 숫자 누락으로 잡히지 않게 (영어·태국어는 달을 이름으로 쓴다)
// 영어는 날짜 옆(숫자 바로 앞·뒤)에 있을 때만 — "You may leave"의 may를 5월로 읽지 않게
const EN = ['january|jan', 'february|feb', 'march|mar', 'april|apr', 'may', 'june|jun', 'july|jul', 'august|aug', 'september|sept|sep', 'october|oct', 'november|nov', 'december|dec'];
const MONTHS: [RegExp, number][] = [
  ...EN.map((m, i): [RegExp, number] => [new RegExp(`\\b(?:${m})\\b\\.?(?=\\s*\\d)|(?<=\\d(?:st|nd|rd|th)?\\s*)\\b(?:${m})\\b\\.?`, 'gi'), i + 1]),
  ...['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'].map(
    (m, i): [RegExp, number] => [new RegExp(m, 'g'), i + 1],
  ),
];

/** 숫자 묶음 (날짜·시각·금액). "3월 14일 09:00" → ['3','14','9','0'] — 앞자리 0은 지워 비교한다 (09 = 9) */
export function numberTokens(text: string): string[] {
  const t = MONTHS.reduce((s, [re, n]) => s.replace(re, ` ${n} `), text);
  return (t.match(/\d+(?:[.,]\d+)*/g) ?? []).map((s) => s.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '')).sort();
}

/**
 * 요점 9 ★ 숫자 대조 — 원문의 숫자가 번역에 전부 그대로 있고, 원문에 없는 숫자가 생기지 않았는가.
 * 기계 번역에서 숫자가 틀리는 것은 조용히 일어난다 ("3월 14일 휴무" → "March 15").
 */
export function numbersMatch(source: string, translated: string): boolean {
  const a = numberTokens(source);
  const b = numberTokens(translated);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** 요점 8: 본문은 일반 텍스트. 줄바꿈은 화면이 살리고, https 주소만 링크 조각으로 나눈다 — HTML로 해석하지 않는다 */
export function splitLinks(text: string): { kind: 'text' | 'link'; value: string }[] {
  const out: { kind: 'text' | 'link'; value: string }[] = [];
  const re = /https:\/\/[^\s<>"']+/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: 'text', value: text.slice(last, m.index) });
    out.push({ kind: 'link', value: m[0].replace(/[).,]+$/, '') });
    last = m.index! + m[0].replace(/[).,]+$/, '').length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

/**
 * 요점 21 — 직원에게 보여 줄 언어: 지금 고른 언어(상단 토글)의 번역이 있으면 그것, 없으면 한국어 원문.
 * 옛 판 번역이면 stale=true ("번역이 옛 내용입니다").
 */
export function pickDisplay(
  n: Pick<NoticeRow, 'title' | 'body' | 'version'>,
  translations: TranslationRow[],
  locale: string,
): { locale: string; title: string; body: string; machine: boolean; stale: boolean; translated: boolean } {
  const t = locale === 'ko' ? undefined : translations.find((x) => x.locale === locale);
  if (!t) return { locale: 'ko', title: n.title, body: n.body, machine: false, stale: false, translated: false };
  return { locale, title: t.title, body: t.body, machine: t.source === 'machine', stale: t.basedOnVersion < n.version, translated: true };
}

/**
 * 게시할 수 있는가 (요점 9·11): 숫자 확인 필요인 번역은 「확인했음」 없이는 막는다.
 * 법적·급여 관련이면 켜진 언어마다 확인된 번역이 전부 있어야 한다.
 */
export function publishBlockers(n: Pick<NoticeRow, 'legal' | 'version'>, translations: TranslationRow[], enabledLocales: string[]): string[] {
  const out: string[] = [];
  for (const loc of enabledLocales) {
    const t = translations.find((x) => x.locale === loc);
    if (t && !t.numbersOk && !t.reviewed) out.push(`numbers:${loc}`);
    if (n.legal && (!t || !t.reviewed || t.basedOnVersion < n.version)) out.push(`legal:${loc}`);
  }
  return out;
}

/** 요점 19: 보여 줄 순서 — 중요 먼저, 그다음 최신. 한 번에 최대 limit개 */
export function popupOrder<T extends Pick<NoticeRow, 'important' | 'startsAt'>>(list: T[], limit = 3): T[] {
  return [...list].sort((a, b) => Number(b.important) - Number(a.important) || b.startsAt.getTime() - a.startsAt.getTime()).slice(0, limit);
}
