// 설정 화면 입력값 검사 (근무시간 · 휴일 · 사무실 인터넷 주소). 순수함수.
// ★ 근무시간은 이력이다 (② 4-1): 고치지 않고 "언제부터 적용"되는 새 규칙을 넣는다. 지난 날짜의 계산은 그날 규칙 그대로 남는다.
//   그래서 적용 시작일은 오늘 이후만 받는다 — 지난 날짜로 넣으면 이미 본 지각·연장 숫자가 뒤바뀐다.
// ★ 휴일도 지난 달은 받지 않는다 (그 달 집계가 달라진다). 이번 달과 앞으로의 날짜만.
import ipaddr from 'ipaddr.js';

export const ROUND_STEPS = [0, 5, 10, 15, 30, 60] as const;
export type RuleInput = { startTime: string; endTime: string; lateGraceMin: number; breakStart: string | null; breakEnd: string | null; extraBreaks: { start: string; end: string }[]; roundStepMin: number; workdays: number[]; weeklyRestDay: number; effectiveFrom: string };
export type SettingsCode = 'invalid_input' | 'invalid_time' | 'invalid_break' | 'invalid_workdays' | 'past_date' | 'invalid_label' | 'invalid_cidr';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max + 1) : '');

export function validateRule(b: Record<string, unknown>, today: string): { ok: true; value: RuleInput } | { ok: false; code: SettingsCode } {
  const { startTime, endTime } = b;
  if (typeof startTime !== 'string' || typeof endTime !== 'string' || !TIME.test(startTime) || !TIME.test(endTime)) return { ok: false, code: 'invalid_time' };
  // 자정을 넘기는 근무시간(야간 교대)은 지원하지 않는다 — 고정 주간 근무 1개 (3장)
  if (startTime >= endTime) return { ok: false, code: 'invalid_time' };
  const grace = typeof b.lateGraceMin === 'number' ? b.lateGraceMin : typeof b.lateGraceMin === 'string' && b.lateGraceMin.trim() !== '' ? Number(b.lateGraceMin) : NaN;
  if (!Number.isInteger(grace) || grace < 0 || grace > 120) return { ok: false, code: 'invalid_input' };
  const bs = b.breakStart === '' || b.breakStart === null || b.breakStart === undefined ? null : b.breakStart;
  const be = b.breakEnd === '' || b.breakEnd === null || b.breakEnd === undefined ? null : b.breakEnd;
  if ((bs === null) !== (be === null)) return { ok: false, code: 'invalid_break' };
  if (bs !== null && be !== null) {
    if (typeof bs !== 'string' || typeof be !== 'string' || !TIME.test(bs) || !TIME.test(be) || bs >= be || bs < startTime || be > endTime) return { ok: false, code: 'invalid_break' };
  }
  // 둘째 휴게시간대 (확정-9: 17:00~17:30처럼 근무시간 끝 뒤에 올 수 있다 — 잔업 중 휴게). 둘 다 있거나 둘 다 없거나
  const b2s = b.break2Start === '' || b.break2Start === null || b.break2Start === undefined ? null : b.break2Start;
  const b2e = b.break2End === '' || b.break2End === null || b.break2End === undefined ? null : b.break2End;
  if ((b2s === null) !== (b2e === null)) return { ok: false, code: 'invalid_break' };
  if (b2s !== null && (typeof b2s !== 'string' || typeof b2e !== 'string' || !TIME.test(b2s) || !TIME.test(b2e) || b2s >= b2e)) return { ok: false, code: 'invalid_break' };
  if (b2s !== null && bs === null) return { ok: false, code: 'invalid_break' }; // 첫 휴게 없이 둘째만 넣지 않는다
  const extraBreaks = b2s !== null ? [{ start: b2s as string, end: b2e as string }] : [];
  // 급여용 시간의 끊는 단위 (출근 올림 · 퇴근 내림). 비우면 끊지 않는다
  const step = b.roundStepMin === '' || b.roundStepMin === null || b.roundStepMin === undefined ? 0 : Number(b.roundStepMin);
  if (!(ROUND_STEPS as readonly number[]).includes(step)) return { ok: false, code: 'invalid_input' };
  const days = Array.isArray(b.workdays) ? [...new Set(b.workdays.map(Number))].sort((x, y) => x - y) : [];
  if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return { ok: false, code: 'invalid_workdays' };
  const rest = Number(b.weeklyRestDay);
  // 주휴일에 근무하도록 정할 수는 없다
  if (!Number.isInteger(rest) || rest < 1 || rest > 7 || days.includes(rest)) return { ok: false, code: 'invalid_workdays' };
  if (!isDate(b.effectiveFrom)) return { ok: false, code: 'invalid_input' };
  if (b.effectiveFrom < today) return { ok: false, code: 'past_date' };
  return { ok: true, value: { startTime, endTime, lateGraceMin: grace, breakStart: bs as string | null, breakEnd: be as string | null, extraBreaks, roundStepMin: step, workdays: days, weeklyRestDay: rest, effectiveFrom: b.effectiveFrom } };
}

export function validateHoliday(b: Record<string, unknown>, today: string): { ok: true; value: { date: string; label: string; kind: 'public' | 'company' } } | { ok: false; code: SettingsCode } {
  if (!isDate(b.date)) return { ok: false, code: 'invalid_input' };
  if (b.date < `${today.slice(0, 7)}-01`) return { ok: false, code: 'past_date' };
  const label = text(b.label, 40);
  if (label.length < 1 || label.length > 40) return { ok: false, code: 'invalid_label' };
  if (b.kind !== 'public' && b.kind !== 'company') return { ok: false, code: 'invalid_input' };
  return { ok: true, value: { date: b.date, label, kind: b.kind } };
}

/**
 * 사무실 인터넷 주소 → 대역 표기. 주소 하나만 적으면 IPv4는 /32, IPv6는 /64 대역으로 바꾼다 (부록 R-6의 3:
 * IPv6는 기기마다 뒤 64비트가 달라서 주소 하나로 등록하면 같은 사무실인데도 안 맞는다).
 * 너무 넓은 대역(IPv4 /16 미만, IPv6 /48 미만)은 받지 않는다 — 실수로 "어디서나 사무실"이 되는 것을 막는다.
 */
export function normalizeCidr(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    if (s.includes('/')) {
      const [addr, bits] = ipaddr.parseCIDR(s);
      const min = addr.kind() === 'ipv4' ? 16 : 48;
      if (bits < min) return null;
      const net = addr.kind() === 'ipv4' ? ipaddr.IPv4.networkAddressFromCIDR(s) : ipaddr.IPv6.networkAddressFromCIDR(s);
      return `${net.toString()}/${bits}`;
    }
    if (!ipaddr.isValid(s)) return null;
    const addr = ipaddr.parse(s);
    if (addr.kind() === 'ipv4') return `${addr.toString()}/32`;
    return `${ipaddr.IPv6.networkAddressFromCIDR(`${addr.toString()}/64`).toString()}/64`;
  } catch {
    return null;
  }
}

export function cleanLabel(v: unknown): string | null {
  const s = text(v, 40);
  return s.length <= 40 ? s || null : null;
}
