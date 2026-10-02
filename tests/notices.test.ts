// 공지 순수함수 (②-5 7-15)
import { describe, expect, it } from 'vitest';
import { noticeState, numbersMatch, pickDisplay, popupOrder, publishBlockers, splitLinks, type TranslationRow } from '@/lib/notice-logic';

const d = (s: string) => new Date(s);
const tr = (p: Partial<TranslationRow> = {}): TranslationRow => ({ locale: 'en', title: 'T', body: 'B', source: 'machine', reviewed: false, numbersOk: true, basedOnVersion: 1, ...p });

describe('공지 상태는 계산한다 (요점 13)', () => {
  const base = { startsAt: d('2026-10-02T00:00:00Z'), endsAt: d('2026-10-05T00:00:00Z') };
  it('예약 · 게시 중 · 종료 · 임시 · 보관', () => {
    expect(noticeState({ ...base, status: 'published' }, d('2026-10-01T00:00:00Z'))).toBe('scheduled');
    expect(noticeState({ ...base, status: 'published' }, d('2026-10-03T00:00:00Z'))).toBe('live');
    expect(noticeState({ ...base, status: 'published' }, d('2026-10-05T00:00:00Z'))).toBe('ended');
    expect(noticeState({ ...base, status: 'draft' }, d('2026-10-03T00:00:00Z'))).toBe('draft');
    expect(noticeState({ ...base, status: 'archived' }, d('2026-10-03T00:00:00Z'))).toBe('archived');
    expect(noticeState({ ...base, endsAt: null, status: 'published' }, d('2030-01-01T00:00:00Z'))).toBe('live');
  });
});

describe('숫자 대조 (요점 9) — 번역이 숫자를 바꾸면 잡는다', () => {
  it('같은 숫자면 통과, 앞자리 0은 같은 숫자', () => {
    expect(numbersMatch('3월 14일 09:00 휴무', 'Closed on March 14 at 9:00')).toBe(true);
    expect(numbersMatch('3월 14일 휴무', 'Closed on 14 Mar.')).toBe(true);
    expect(numbersMatch('3월 14일 휴무', 'ปิดวันที่ 14 มีนาคม')).toBe(true);
    expect(numbersMatch('3월 14일 휴무', 'Nghỉ ngày 14 tháng 3')).toBe(true);
  });
  it('날짜 옆이 아닌 may·mark는 달로 읽지 않는다', () => {
    expect(numbersMatch('5시 퇴근 가능', 'You may leave at 5')).toBe(true);
    expect(numbersMatch('표시', 'Mark the box')).toBe(true);
  });
  it('날짜가 바뀌거나 숫자가 생기거나 빠지면 실패', () => {
    expect(numbersMatch('3월 14일 휴무', 'Closed on March 15')).toBe(false);
    expect(numbersMatch('3월 14일 휴무', 'Closed on 3/14, room 2')).toBe(false);
    expect(numbersMatch('3월 14일 휴무', 'Closed on March')).toBe(false);
  });
});

describe('본문은 일반 텍스트 (요점 8)', () => {
  it('https 주소만 링크, HTML은 글자 그대로', () => {
    expect(splitLinks('<b>안내</b> https://a.com/x. 끝')).toEqual([
      { kind: 'text', value: '<b>안내</b> ' },
      { kind: 'link', value: 'https://a.com/x' },
      { kind: 'text', value: '. 끝' },
    ]);
    expect(splitLinks('http://a.com javascript:alert(1)')).toEqual([{ kind: 'text', value: 'http://a.com javascript:alert(1)' }]);
  });
});

describe('보여 줄 언어 (요점 21) — 상단 언어 버튼을 따른다', () => {
  const n = { title: '제목', body: '본문', version: 2 };
  it('한국어면 원문, 번역이 있으면 번역, 없으면 원문', () => {
    expect(pickDisplay(n, [tr()], 'ko')).toMatchObject({ locale: 'ko', title: '제목', translated: false });
    expect(pickDisplay(n, [tr({ basedOnVersion: 2 })], 'en')).toMatchObject({ locale: 'en', title: 'T', machine: true, stale: false });
    expect(pickDisplay(n, [], 'en')).toMatchObject({ locale: 'ko', title: '제목' });
  });
  it('옛 판 번역이면 stale', () => {
    expect(pickDisplay(n, [tr({ basedOnVersion: 1 })], 'en').stale).toBe(true);
  });
});

describe('게시 막기 (요점 9·11)', () => {
  it('숫자 확인 필요는 「확인했음」 없이 막는다', () => {
    expect(publishBlockers({ legal: false, version: 1 }, [tr({ numbersOk: false })], ['en'])).toEqual(['numbers:en']);
    expect(publishBlockers({ legal: false, version: 1 }, [tr({ numbersOk: false, reviewed: true })], ['en'])).toEqual([]);
  });
  it('번역이 없어도 일반 공지는 한국어로만 게시할 수 있다', () => {
    expect(publishBlockers({ legal: false, version: 1 }, [], ['en'])).toEqual([]);
  });
  it('법적·급여 관련은 현재 판의 확인된 번역이 언어마다 있어야 한다', () => {
    expect(publishBlockers({ legal: true, version: 1 }, [], ['en'])).toEqual(['legal:en']);
    expect(publishBlockers({ legal: true, version: 2 }, [tr({ reviewed: true, basedOnVersion: 1 })], ['en'])).toEqual(['legal:en']);
    expect(publishBlockers({ legal: true, version: 2 }, [tr({ reviewed: true, basedOnVersion: 2 })], ['en'])).toEqual([]);
  });
});

describe('팝업 순서 (요점 19)', () => {
  it('중요 먼저, 그다음 최신, 최대 3개', () => {
    const list = [
      { id: 'a', important: false, startsAt: d('2026-10-01') },
      { id: 'b', important: true, startsAt: d('2026-09-01') },
      { id: 'c', important: false, startsAt: d('2026-10-02') },
      { id: 'd', important: false, startsAt: d('2026-08-01') },
    ];
    expect(popupOrder(list).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});
