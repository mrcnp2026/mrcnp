// Gemini 재시도·대체 모델 (번역 초안 — 503 과부하가 잦다)
import { describe, expect, it } from 'vitest';
import { callWithFallback, modelList } from '@/lib/gemini-retry';

const noSleep = async () => {};
const script = (plan: Record<string, (number | 'ok' | 'throw')[]>) => {
  const calls: string[] = [];
  const left = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, [...v]]));
  const call = async (m: string) => {
    calls.push(m);
    const s = left[m]?.shift() ?? 503;
    if (s === 'throw') throw new Error('net');
    return s === 'ok' ? ({ ok: true, value: m } as const) : ({ ok: false, status: s } as const);
  };
  return { calls, call };
};

describe('모델 목록', () => {
  it('주 모델 먼저, 쉼표 대체 모델, 빈칸·중복 제거', () => {
    expect(modelList('a', ' b, ,a,c ')).toEqual(['a', 'b', 'c']);
    expect(modelList(undefined, undefined)).toEqual([]);
    expect(modelList('', 'b')).toEqual(['b']);
  });
});

describe('재시도·대체', () => {
  it('503 뒤 성공하면 같은 모델로 끝난다', async () => {
    const s = script({ a: [503, 'ok'] });
    const r = await callWithFallback(['a', 'b'], s.call, { sleep: noSleep });
    expect(r.ok && r.model).toBe('a');
    expect(s.calls).toEqual(['a', 'a']);
  });
  it('주 모델이 계속 503이면 대체 모델로 넘어간다', async () => {
    const s = script({ a: [503, 503, 503], b: ['ok'] });
    const r = await callWithFallback(['a', 'b'], s.call, { sleep: noSleep });
    expect(r.ok && r.model).toBe('b');
    expect(s.calls).toEqual(['a', 'a', 'a', 'b']);
  });
  it('404는 다시 하지 않고 바로 다음 모델', async () => {
    const s = script({ a: [404], b: ['ok'] });
    const r = await callWithFallback(['a', 'b'], s.call, { sleep: noSleep });
    expect(r.ok).toBe(true);
    expect(s.calls).toEqual(['a', 'b']);
  });
  it('네트워크 오류(던짐)도 다시 해본다', async () => {
    const s = script({ a: ['throw', 'ok'] });
    expect((await callWithFallback(['a'], s.call, { sleep: noSleep })).ok).toBe(true);
  });
  it('모두 실패하면 시도 기록과 함께 실패', async () => {
    const s = script({ a: [503, 503, 503], b: [429, 429, 429] });
    const r = await callWithFallback(['a', 'b'], s.call, { sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(r.attempts).toHaveLength(6);
  });
  it('시간 예산을 넘으면 더 시작하지 않는다', async () => {
    let t = 0;
    const s = script({ a: [503, 503, 503], b: ['ok'] });
    const r = await callWithFallback(['a', 'b'], s.call, { sleep: async (ms) => void (t += ms), now: () => t, budgetMs: 2000, backoffMs: [1500] });
    expect(r.ok).toBe(false);
    expect(s.calls).toEqual(['a', 'a']);
  });
});
