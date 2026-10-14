import { describe, expect, it } from 'vitest';
import { initials, matchLevel, snippet, sortHits, type SearchHit } from '@/lib/search';

describe('통합 검색 맞추기', () => {
  it('통째로 들어 있으면 정확히 일치 (대소문자 · 띄어쓰기 무시)', () => {
    expect(matchLevel('급여 대장', ['급여대장'])).toBe('exact');
    expect(matchLevel('PDF', ['명세서 pdf 받기'])).toBe('exact');
  });
  it('띄어 쓴 낱말 하나만 맞으면 관련결과', () => {
    expect(matchLevel('연차 촉진', ['연차 사용 안내'])).toBe('related');
    expect(matchLevel('연차', ['병가'])).toBeNull();
  });
  it('초성으로 찾으면 관련결과 (ㅎㄱㄷ → 홍길동)', () => {
    expect(initials('홍길동A')).toBe('ㅎㄱㄷA');
    expect(matchLevel('ㅎㄱㄷ', ['홍길동'])).toBe('related');
    expect(matchLevel('ㅎㄱ', ['김철수'])).toBeNull();
  });
  it('빈 말은 아무것도 맞지 않는다', () => expect(matchLevel('  ', ['무엇이든'])).toBeNull());
  it('본문 미리 보기는 찾는 말 앞뒤를 자른다', () => {
    const t = '가'.repeat(100) + '지각' + '나'.repeat(100);
    const s = snippet(t, '지각', 30);
    expect(s.includes('지각') && s.startsWith('…') && s.endsWith('…')).toBe(true);
  });
  it('정확히 일치가 먼저, 같으면 새것부터', () => {
    const h = (level: 'exact' | 'related', date: string): SearchHit => ({ kind: 'notices', level, title: date, where: '', href: '', date });
    expect([h('related', '2026-10-14'), h('exact', '2026-10-01'), h('exact', '2026-10-10')].sort(sortHits).map((x) => x.title)).toEqual(['2026-10-10', '2026-10-01', '2026-10-14']);
  });
});
