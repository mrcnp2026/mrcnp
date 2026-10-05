// 관리자 대리 등록 (②-3 7-6) — 넣어도 되는지 판단. 순수함수.
//
// ★ 원본 기록(punch_events)에는 아무것도 넣지 않는다. 폰이 실제로 찍은 것만 원본이다 (4-1).
//   대리 등록은 "빠진 기록 추가" 정정을 관리자 이름으로 만들고 바로 승인하는 것이다 —
//   사유(reason)·넣은 사람(requested_by)·시각이 정정 기록과 결정 기록에 남고, 집계는 승인된 정정을 그대로 읽는다.
//   사무실 확인 값이 없으므로 검증 통과로 보이지 않는다 (요점 2).
// ★ 사유가 비면 차단한다 (요점 1). 미래 시각은 넣을 수 없다 (요점 5).
import { addDays } from '@/lib/calendar';
import { kstDateTime, toKstDate } from '@/lib/time';
import type { PunchKind } from '@/lib/types';

export const PROXY_REASON_MIN = 2; // "." 한 글자 사유를 막는다
export const PROXY_REASON_MAX = 200;

export type ProxyPlan =
  | { ok: true; workDate: string; kind: PunchKind; at: Date }
  | { ok: false; code: 'invalid_input' | 'reason_required' | 'future_time' | 'already_exists' | 'pending_exists' | 'time_order' };

export function planProxyPunch(args: {
  workDate: unknown;
  kind: unknown;
  time: unknown; // 'HH:MM' (사무실 시간대)
  nextDay: unknown; // 자정 넘긴 퇴근이면 true → 근무일 다음 날의 그 시각
  reason: string; // 다듬은 사유
  now: Date;
  effective: { kind: PunchKind; at: Date }[]; // 그 직원·그 근무일의 유효 기록 (원본 + 승인된 정정)
  pendingSameKind: boolean; // 같은 날·같은 종류의 대기 중 요청이 있다 — 요청함에서 처리해야 한다
}): ProxyPlan {
  const { workDate, kind, time } = args;
  if (typeof workDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || Number.isNaN(Date.parse(`${workDate}T00:00:00Z`))) return { ok: false, code: 'invalid_input' };
  if (kind !== 'in' && kind !== 'out') return { ok: false, code: 'invalid_input' };
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, code: 'invalid_input' };
  if (args.nextDay === true && kind === 'in') return { ok: false, code: 'invalid_input' };
  if (args.reason.length < PROXY_REASON_MIN || args.reason.length > PROXY_REASON_MAX) return { ok: false, code: 'reason_required' };

  const at = kstDateTime(args.nextDay === true ? addDays(workDate, 1) : workDate, time);
  if (workDate > toKstDate(args.now) || at > args.now) return { ok: false, code: 'future_time' };

  if (args.effective.some((e) => e.kind === kind)) return { ok: false, code: 'already_exists' };
  if (args.pendingSameKind) return { ok: false, code: 'pending_exists' };

  // 퇴근이 출근보다 앞서면 짝이 맞지 않는다 (짝 없는 퇴근 + 열린 출근으로 갈라진다)
  const others = args.effective.filter((e) => e.kind !== kind).map((e) => e.at.getTime());
  if (others.length) {
    if (kind === 'out' && at.getTime() <= Math.min(...others)) return { ok: false, code: 'time_order' };
    if (kind === 'in' && at.getTime() >= Math.max(...others)) return { ok: false, code: 'time_order' };
  }
  return { ok: true, workDate, kind, at };
}
