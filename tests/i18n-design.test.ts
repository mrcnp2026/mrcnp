// 게이트 3 — 다국어 (①-2 11-A "다국어") + 디자인 토큰 (부록 R-10 체크리스트 중 코드 검색으로 확인되는 것).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EMPLOYEE_LOCALE, LOCALE_NAMES, selectableLocales } from '@/i18n/locales';
import { messagesFor, withFallback } from '@/i18n/messages';
import en from '../messages/en.json';
import ko from '../messages/ko.json';

const ROOT = path.join(import.meta.dirname, '..');

function files(dir: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p, re));
    else if (re.test(f)) out.push(p);
  }
  return out;
}

/** 주석을 지운 코드 (// … 와 /* … *\/ 와 {/* … *\/}) */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function keys(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    k.startsWith('_') ? [] : typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const SCREEN_FILES = [...files(path.join(ROOT, 'src', 'app'), /\.tsx$/), ...files(path.join(ROOT, 'src', 'components'), /\.tsx?$/)];

describe('다국어', () => {
  it('직원 화면 기본 언어가 영어다', () => {
    expect(DEFAULT_EMPLOYEE_LOCALE).toBe('en');
  });

  it('하드코딩 검사: 화면 코드(src/app, src/components)에 문장이 직접 쓰여 있지 않다 ← B-17', () => {
    const hits: string[] = [];
    for (const f of SCREEN_FILES) {
      const code = stripComments(readFileSync(f, 'utf8'));
      const rel = path.relative(ROOT, f);
      // ① 한글은 주석 밖 어디에도 없어야 한다
      for (const m of code.matchAll(/[가-힣]+/g)) hits.push(`${rel}: 한글 "${m[0]}"`);
      // ② JSX가 있는 .tsx만 — .ts의 타입 표기(Promise<void> 등)를 문장으로 잘못 보지 않게
      if (f.endsWith('.tsx')) for (const m of code.matchAll(/>\s*([A-Za-z][A-Za-z ,.'!?-]{2,})\s*</g)) hits.push(`${rel}: 글자 "${m[1]}"`);
      // ③ 사람이 읽는 속성에 문장
      for (const m of code.matchAll(/\b(placeholder|title|alt|aria-label|label)="([^"]*[A-Za-z]{2,}[^"]*)"/g)) {
        hits.push(`${rel}: ${m[1]}="${m[2]}"`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('검사기가 실제로 잡는지 — 일부러 넣은 문장을 찾아낸다', () => {
    const bad = stripComments(`export const X = () => <button aria-label="Close menu">Clock in now</button>; // 주석의 한글은 괜찮다`);
    expect([...bad.matchAll(/>\s*([A-Za-z][A-Za-z ,.'!?-]{2,})\s*</g)].length).toBe(1);
    expect([...bad.matchAll(/\b(aria-label)="([^"]*[A-Za-z]{2,}[^"]*)"/g)].length).toBe(1);
    expect(bad).not.toMatch(/[가-힣]/);
  });

  it('검수 안 된 언어(vi·th)는 언어 선택 목록에 나오지 않는다 ← B-21', () => {
    expect(selectableLocales()).toEqual(['ko', 'en']);
    expect(selectableLocales({ vi: { reviewed: true }, th: { reviewed: false }, en: { reviewed: true } })).toEqual(['en', 'vi']);
  });

  it('언어 이름은 각 언어의 자기 이름이다', () => {
    expect(LOCALE_NAMES).toEqual({ en: 'English', vi: 'Tiếng Việt', th: 'ภาษาไทย', ko: '한국어' });
  });

  it('번역 키가 없으면 영어로 대체된다 (개발 모드에서는 [missing] 표시)', () => {
    const fb = { a: 'Hello', g: { b: 'Bye' } };
    expect(withFallback({ g: {} }, fb, false)).toEqual({ a: 'Hello', g: { b: 'Bye' } });
    expect(withFallback({ a: '안녕' }, fb, true)).toEqual({ a: '안녕', g: { b: '[missing] Bye' } });
    // 실제 파일: 베트남어 초안에 관리자 문구가 없으므로 영어로 채워진다
    const vi = messagesFor('vi', false) as { admin: { nav: { home: string } } };
    expect(vi.admin.nav.home).toBe('Home');
  });

  it('영어·한국어 번역 파일의 키가 같다 (어느 쪽도 빠진 문구가 없다)', () => {
    expect(keys(ko).sort()).toEqual(keys(en).sort());
  });

  it('화면 코드가 쓰는 번역 키가 영어 파일에 전부 있다', () => {
    const all = new Set(keys(en));
    const missing: string[] = [];
    for (const f of SCREEN_FILES) {
      const code = readFileSync(f, 'utf8');
      const ns = [...code.matchAll(/useTranslations\('([\w.]+)'\)|getTranslations\((?:\{[^}]*namespace: )?'([\w.]+)'/g)].map((m) => m[1] ?? m[2]);
      for (const m of code.matchAll(/\bt[a-z]?\('([\w.]+)'/g)) {
        const k = m[1];
        if (all.has(k) || ns.some((n) => all.has(`${n}.${k}`))) continue;
        missing.push(`${path.relative(ROOT, f)}: ${k}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('태국어 화면에는 keep-all이 걸리지 않는다 (한국어에만) ← B-20', () => {
    const css = readFileSync(path.join(ROOT, 'src', 'app', 'globals.css'), 'utf8');
    const lines = stripComments(css).split('\n').filter((l) => l.includes('keep-all'));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toContain('lang="ko"');
  });
});

describe('디자인 토큰 (R-10-8)', () => {
  it('코드에 색 값(#…, rgb()이 theme.ts 밖에 없다', () => {
    const all = [...files(path.join(ROOT, 'src'), /\.(tsx?|css)$/)].filter((f) => !f.endsWith(path.join('config', 'theme.ts')));
    const hits: string[] = [];
    for (const f of all) {
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const m of code.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)) hits.push(`${path.relative(ROOT, f)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it('임의 px 값·임의 색 클래스(예: text-[13px], bg-[…])를 쓰지 않는다', () => {
    const hits: string[] = [];
    for (const f of SCREEN_FILES) {
      const code = readFileSync(f, 'utf8');
      for (const m of code.matchAll(/\b(?:text|bg|border|rounded|p[xytrbl]?|m[xytrbl]?|gap|w|h)-\[(?!calc\(|env\()[^\]]+\]/g)) {
        hits.push(`${path.relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('그라데이션·등장 애니메이션 클래스가 없다', () => {
    const hits = SCREEN_FILES.filter((f) => /bg-gradient|bg-linear|animate-/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});

describe('명암비 (R-10-8: 글자 4.5 이상, 큰 글자·아이콘 3 이상)', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  it('실제로 쓰는 글자·바탕 조합이 기준을 넘는다', async () => {
    const { COLORS: C } = await import('@/config/theme');
    const pairs: [string, string, string, number][] = [
      ['본문 / 흰 바탕', C.text, C.bg, 4.5], ['본문 / 회색 바탕', C.text, C.surface, 4.5],
      ['보조 글자 / 회색 바탕', C.muted, C.surface, 4.5], ['캡션 / 흰 바탕', C.faint, C.bg, 4.5], ['캡션 / 회색 바탕', C.faint, C.surface, 4.5],
      ['출근 버튼 흰 글자', C['on-primary'], C.primary, 4.5], ['퇴근 버튼 흰 글자', C['on-primary'], C.ok, 4.5],
      ['연습 배지', C.primary, C['primary-tint'], 4.5], ['주의 칩', C.warn, C['warn-tint'], 4.5], ['정상 칩', C.ok, C['ok-tint'], 4.5],
      ['위험 글자', C.danger, C['danger-tint'], 4.5], ['진한 제목 / 회색 바탕', C['primary-deep'], C.surface, 4.5],
      ['현황판 전체 칸', C['on-primary'], C['primary-deep'], 4.5], ['처리함 배지(작은 숫자)', C['on-primary'], C.warn, 4.5],
    ];
    const low = pairs.filter(([, f, b, min]) => ratio(f, b) < min).map(([n, f, b]) => `${n} ${ratio(f, b).toFixed(2)}`);
    expect(low).toEqual([]);
  });
});
