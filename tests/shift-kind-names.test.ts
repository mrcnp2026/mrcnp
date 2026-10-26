// 근무일정 유형의 보이는 이름 (2026-10-25 의뢰인)
import { describe, expect, it } from 'vitest';
import { cleanKindNames, withKindNames } from '@/lib/shift-kind-names';

describe('근무일정 유형 보이는 이름', () => {
  it('빈 칸은 기본 이름으로 돌리고, 앞뒤 공백은 지운다', () => {
    expect(cleanKindNames({ normal: ' 일반 ', deemed: '', outside: '외부 일정' })).toEqual({ normal: '일반', outside: '외부 일정' });
  });
  it('20자를 넘거나 글자가 아니면 거절하고, 모르는 유형은 무시한다', () => {
    expect(cleanKindNames({ normal: 'ㄱ'.repeat(21) })).toBeNull();
    expect(cleanKindNames({ normal: 5 })).toBeNull();
    expect(cleanKindNames('x')).toBeNull();
    expect(cleanKindNames({ none: '없음', bogus: 'x' })).toEqual({});
  });
  it('바꾼 이름이 있으면 그것, 없으면 기본 이름', () => {
    const tk = withKindNames((k: string) => `기본:${k}`, { remote: '재택' });
    expect(tk('remote')).toBe('재택');
    expect(tk('holiday')).toBe('기본:holiday');
    expect(withKindNames((k: string) => k, undefined)('normal')).toBe('normal');
  });
});
