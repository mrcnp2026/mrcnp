// 근무일정 틀(템플릿) — 직원마다 다른 출퇴근 시각 (의뢰인 2026-10-10: 시프티의 「근무일정 템플릿」처럼. 07:30·07:40·07:50 시작 등을 만들어 직원별로 적용). 순수함수.
// 회사 근무규칙(지각 유예·휴게·근무 요일·주휴일)은 그대로 쓰고, **시작·끝 시각만** 그 직원의 틀로 바꿔 끼운다.
//   → 지각·미기록·「야근중」·홈 화면의 오늘 일정이 전부 그 직원의 틀 기준이 된다. 틀이 없는 직원은 회사 규칙 그대로다.
// 유형 「간주 근무」: 찍지 않아도 그 시간만큼 근무한 것으로 본다 (대표·경영진). 찍은 기록이 있으면 기록이 먼저다.
import { kstDateTime } from '@/lib/time';
import type { PunchPair, WorkRule } from '@/lib/types';

export const SHIFT_KINDS = ['none', 'normal', 'deemed', 'outside', 'remote', 'holiday', 'extra'] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];
// 색은 디자인 토큰에 있는 것만 (새 색은 토큰을 먼저 더한다)
export const SHIFT_COLORS = ['primary', 'ok', 'warn', 'danger', 'text', 'muted'] as const;
export type ShiftColor = (typeof SHIFT_COLORS)[number];
export const SHIFT_COLOR_CLASS: Record<ShiftColor, string> = { primary: 'bg-primary', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', text: 'bg-text', muted: 'bg-muted' };

export type ShiftTemplate = { id: string; name: string; startTime: string; endTime: string; kind: ShiftKind; color: ShiftColor; memo: string | null; active: boolean };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const hhmm = (t: string) => t.slice(0, 5);

/** 회사 규칙에 그 직원의 틀을 끼운다. 틀이 없으면 규칙 그대로, 규칙이 없으면 null (지어내지 않는다) */
export function applyTemplate(rule: WorkRule | null, tpl: Pick<ShiftTemplate, 'startTime' | 'endTime'> | null | undefined): WorkRule | null {
  if (!rule || !tpl) return rule;
  return { ...rule, startTime: tpl.startTime, endTime: tpl.endTime };
}

/**
 * 간주 근무의 그날 근무 — 찍은 기록이 없는 근무일에만 쓴다.
 * 지난 날은 시작~끝 전부, 오늘은 시작 시각이 지나야 생기고 끝 시각 전에는 "근무 중"(퇴근 없음), 앞날은 없다.
 */
export function deemedPair(tpl: Pick<ShiftTemplate, 'startTime' | 'endTime'>, workDate: string, now: Date): PunchPair | null {
  const start = kstDateTime(workDate, tpl.startTime);
  const end = kstDateTime(workDate, tpl.endTime);
  if (now < start) return null;
  return { in: start, out: now >= end ? end : null };
}

export type TemplateInput = { name: string; startTime: string; endTime: string; kind: ShiftKind; color: ShiftColor; memo: string | null };

/** 양식 입력값 검사. 틀리면 오류 코드 */
export function validateTemplate(b: Record<string, unknown>): { ok: true; value: TemplateInput } | { ok: false; code: 'invalid_template_name' | 'invalid_time' | 'invalid_input' } {
  const name = typeof b.name === 'string' ? b.name.replace(/[\u0000-\u001F\u007F]/g, ' ').trim() : '';
  if (name.length < 1 || name.length > 40) return { ok: false, code: 'invalid_template_name' };
  const { startTime, endTime } = b;
  // 자정을 넘기는 일정은 아직 지원하지 않는다 (회사 근무규칙과 같은 제한)
  if (typeof startTime !== 'string' || typeof endTime !== 'string' || !TIME.test(startTime) || !TIME.test(endTime) || startTime >= endTime) return { ok: false, code: 'invalid_time' };
  const kind = (SHIFT_KINDS as readonly unknown[]).includes(b.kind) ? (b.kind as ShiftKind) : null;
  const color = (SHIFT_COLORS as readonly unknown[]).includes(b.color) ? (b.color as ShiftColor) : null;
  if (!kind || !color) return { ok: false, code: 'invalid_input' };
  const memoRaw = typeof b.memo === 'string' ? b.memo.trim() : b.memo === undefined || b.memo === null ? '' : null;
  if (memoRaw === null || memoRaw.length > 200) return { ok: false, code: 'invalid_input' };
  return { ok: true, value: { name, startTime, endTime, kind, color, memo: memoRaw === '' ? null : memoRaw } };
}

/** 일정 길이(분) — 목록에 「9시간 30분」처럼 보인다 (휴게를 빼기 전의 길이) */
export function spanMinutes(tpl: Pick<ShiftTemplate, 'startTime' | 'endTime'>): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(tpl.endTime) - m(tpl.startTime);
}
