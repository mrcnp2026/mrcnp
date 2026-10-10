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

// ── 날짜별 근무일정 (2026-10-10 2단계) ──
export type DayShift = { id: string; employeeId: string; workDate: string; startTime: string; endTime: string; kind: ShiftKind; templateId: string | null; note: string | null };
export type PlanItem = { startTime: string; endTime: string; kind: ShiftKind; name: string | null; color: ShiftColor | null; shiftId: string | null; note: string | null; source: 'shift' | 'template' | 'rule' };
export type DayPlan = {
  rule: WorkRule | null; // 그날 판정에 쓰는 규칙 (시작·끝 시각이 그날 일정으로 바뀐 것)
  deemed: { startTime: string; endTime: string } | null; // 간주 근무로 볼 시간 (찍은 기록이 없을 때만 쓴다)
  items: PlanItem[]; // 화면에 보일 그날 일정 줄 (시작 시각 순)
};

const minT = (a: string, b: string) => (a <= b ? a : b);
const maxT = (a: string, b: string) => (a >= b ? a : b);

/**
 * 한 직원의 하루 일정.
 *   1) 그날 넣은 일정(잔업 제외)이 있으면 그것이 그날의 일정이다 — 여러 건이면 가장 이른 시작 ~ 가장 늦은 끝
 *   2) 없으면 근무일에 한해 평소 틀, 틀도 없으면 회사 규칙
 *   3) 유형 「잔업」은 위 일정에 끝 시각만 늘린다 (일정이 없는 날의 잔업은 그 자체가 일정)
 * 간주 근무: 그날 일정에 「간주 근무」가 있거나, 그날 일정이 없는 근무일에 평소 틀이 간주 근무일 때.
 */
export function planDay(args: { rule: WorkRule | null; tpl: ShiftTemplate | null; shifts: readonly DayShift[]; isWorkday: boolean; templates?: ReadonlyMap<string, ShiftTemplate> }): DayPlan {
  const { rule, tpl, isWorkday } = args;
  const dated = [...args.shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const main = dated.filter((s) => s.kind !== 'extra');
  const extra = dated.filter((s) => s.kind === 'extra');
  const items: PlanItem[] = dated.map((s) => {
    const t = s.templateId ? args.templates?.get(s.templateId) : undefined;
    return { startTime: s.startTime, endTime: s.endTime, kind: s.kind, name: t?.name ?? null, color: t?.color ?? null, shiftId: s.id, note: s.note, source: 'shift' };
  });

  let span: { startTime: string; endTime: string } | null = null;
  let deemed: DayPlan['deemed'] = null;
  if (main.length) {
    span = { startTime: main.map((s) => s.startTime).reduce(minT), endTime: main.map((s) => s.endTime).reduce(maxT) };
    const d = main.filter((s) => s.kind === 'deemed');
    if (d.length) deemed = { startTime: d.map((s) => s.startTime).reduce(minT), endTime: d.map((s) => s.endTime).reduce(maxT) };
  } else if (isWorkday) {
    if (tpl) {
      span = { startTime: tpl.startTime, endTime: tpl.endTime };
      if (tpl.kind === 'deemed') deemed = { ...span };
      items.push({ startTime: tpl.startTime, endTime: tpl.endTime, kind: tpl.kind, name: tpl.name, color: tpl.color, shiftId: null, note: null, source: 'template' });
    } else if (rule) {
      span = { startTime: hhmm(rule.startTime), endTime: hhmm(rule.endTime) };
      items.push({ startTime: span.startTime, endTime: span.endTime, kind: 'none', name: null, color: null, shiftId: null, note: null, source: 'rule' });
    }
  }
  for (const e of extra) span = span ? { startTime: span.startTime, endTime: maxT(span.endTime, e.endTime) } : { startTime: e.startTime, endTime: e.endTime };
  items.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return { rule: rule && span ? { ...rule, startTime: span.startTime, endTime: span.endTime } : applyTemplate(rule, tpl), deemed, items };
}

export type ShiftInput = { date: string; startTime: string; endTime: string; kind: ShiftKind; templateId: string | null; note: string | null; employeeIds: string[] };

/** 날짜별 일정 입력값 검사 */
export function validateShift(b: Record<string, unknown>): { ok: true; value: ShiftInput } | { ok: false; code: 'invalid_date' | 'invalid_time' | 'invalid_input' | 'no_people' } {
  const UUID = /^[0-9a-f-]{36}$/i;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || Number.isNaN(Date.parse(`${b.date}T00:00:00Z`))) return { ok: false, code: 'invalid_date' };
  const { startTime, endTime } = b;
  if (typeof startTime !== 'string' || typeof endTime !== 'string' || !TIME.test(startTime) || !TIME.test(endTime) || startTime >= endTime) return { ok: false, code: 'invalid_time' };
  const kind = (SHIFT_KINDS as readonly unknown[]).includes(b.kind) ? (b.kind as ShiftKind) : null;
  if (!kind) return { ok: false, code: 'invalid_input' };
  const templateId = b.templateId === undefined || b.templateId === null || b.templateId === '' ? null : typeof b.templateId === 'string' && UUID.test(b.templateId) ? b.templateId : undefined;
  if (templateId === undefined) return { ok: false, code: 'invalid_input' };
  const noteRaw = typeof b.note === 'string' ? b.note.trim() : b.note === undefined || b.note === null ? '' : null;
  if (noteRaw === null || noteRaw.length > 200) return { ok: false, code: 'invalid_input' };
  if (!Array.isArray(b.employeeIds) || b.employeeIds.some((x) => typeof x !== 'string' || !UUID.test(x)) || b.employeeIds.length > 500) return { ok: false, code: 'invalid_input' };
  const employeeIds = [...new Set(b.employeeIds as string[])];
  if (employeeIds.length === 0) return { ok: false, code: 'no_people' };
  return { ok: true, value: { date: b.date, startTime, endTime, kind, templateId, note: noteRaw === '' ? null : noteRaw, employeeIds } };
}

/** 그날 계획 근무 시간(분) = 일정 길이 − 일정과 겹치는 휴게시간. 홈의 「이번주 근무」 계획 눈금에 쓴다 */
export function planMinutes(rule: Pick<WorkRule, 'startTime' | 'endTime' | 'breakStart' | 'breakEnd'>): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const s = m(rule.startTime);
  const e = m(rule.endTime);
  if (e <= s) return 0;
  const cut = rule.breakStart && rule.breakEnd ? Math.max(0, Math.min(e, m(rule.breakEnd)) - Math.max(s, m(rule.breakStart))) : 0;
  return e - s - cut;
}
