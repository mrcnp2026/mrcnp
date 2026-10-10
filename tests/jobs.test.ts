// 직무 (2026-10-10): 입력 검사 · 순서
import { describe, expect, it } from 'vitest';
import { sortJobs, validateJob } from '@/lib/jobs';

describe('validateJob', () => {
  it('이름은 다듬고 색은 정해진 것만', () => {
    expect(validateJob({ name: '  1. 시급제 ', color: 'warn' })).toEqual({ ok: true, value: { name: '1. 시급제', color: 'warn' } });
    expect(validateJob({ name: '', color: 'warn' })).toEqual({ ok: false, code: 'invalid_job_name' });
    expect(validateJob({ name: 'x'.repeat(41), color: 'warn' })).toEqual({ ok: false, code: 'invalid_job_name' });
    expect(validateJob({ name: '임원', color: 'pink' })).toEqual({ ok: false, code: 'invalid_input' });
    expect(validateJob({ name: 3, color: 'ok' })).toEqual({ ok: false, code: 'invalid_job_name' });
  });
});

describe('sortJobs', () => {
  it('번호가 붙은 이름은 번호 순 (10이 2 뒤), 나머지는 가나다 순', () => {
    const names = ['임원', '10. 기타', '2. 월급제', '1. 시급제', '경영지원실'].map((name) => ({ name, sort: 0 }));
    expect(sortJobs(names).map((x) => x.name)).toEqual(['1. 시급제', '2. 월급제', '10. 기타', '경영지원실', '임원']);
  });
  it('순서 값이 먼저', () => {
    expect(sortJobs([{ name: '가', sort: 2 }, { name: '나', sort: 1 }]).map((x) => x.name)).toEqual(['나', '가']);
  });
});
