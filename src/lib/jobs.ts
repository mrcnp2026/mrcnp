// 직무 (의뢰인 2026-10-10: 시프티의 「직무」처럼 — 이름 + 색, 직원마다 본직무 하나, 목록의 색 막대가 직무 색). 순수함수.
import { SHIFT_COLORS, type ShiftColor } from '@/lib/shifts';

export type Job = { id: string; name: string; color: ShiftColor; sort: number; active: boolean };
export type JobInput = { name: string; color: ShiftColor };

/** 양식 입력값 검사 */
export function validateJob(b: Record<string, unknown>): { ok: true; value: JobInput } | { ok: false; code: 'invalid_job_name' | 'invalid_input' } {
  const name = typeof b.name === 'string' ? b.name.replace(/[\u0000-\u001F\u007F]/g, ' ').trim() : '';
  if (name.length < 1 || name.length > 40) return { ok: false, code: 'invalid_job_name' };
  if (!(SHIFT_COLORS as readonly unknown[]).includes(b.color)) return { ok: false, code: 'invalid_input' };
  return { ok: true, value: { name, color: b.color as ShiftColor } };
}

/** 이름 순서 — 「1. 시급제」「2. 월급제」처럼 번호를 붙이면 번호 순, 나머지는 가나다 순 */
export const sortJobs = <T extends { name: string; sort: number }>(jobs: readonly T[]): T[] => [...jobs].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'ko', { numeric: true }));
