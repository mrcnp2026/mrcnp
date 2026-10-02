// 원본 기록 + 승인된 정정 → 근무일별 출근·퇴근 쌍. 순수함수.
//
// 4-1: 원본(punch_events)은 그대로 두고, 집계할 때만 승인된 정정을 위에 덮어 적용한다.
// 4-8: 빠진 쪽은 null로 남긴다. 기준 시각이나 추정값으로 채우지 않는다.
//      빠진 기록은 승인된 add_missing 정정만 채울 수 있다 (7-6 요점 6).

import { FLAG } from '@/lib/flags';
import type { PunchCorrection, PunchEvent, PunchKind, PunchPair } from '@/lib/types';

type Effective = { kind: PunchKind; at: Date; workDate: string };

/** 승인된 정정만 적용한 "유효 기록". pending·rejected 정정은 무시한다 */
export function applyCorrections(events: PunchEvent[], corrections: PunchCorrection[]): Effective[] {
  const approved = corrections.filter((c) => c.status === 'approved');
  const voided = new Set(approved.filter((c) => c.correctionType === 'void').map((c) => c.targetId));
  const modified = new Map<string, Date>();
  for (const c of approved) {
    if (c.correctionType === 'modify' && c.targetId && c.newPunchedAt) modified.set(c.targetId, c.newPunchedAt);
  }

  const out: Effective[] = [];
  for (const e of events) {
    if (voided.has(e.id)) continue;
    out.push({ kind: e.kind, at: modified.get(e.id) ?? e.punchedAt, workDate: e.workDate });
  }
  // add_missing: punch_events에는 아무것도 없고, 집계에서만 "있어야 했던 기록"으로 끼워 넣는다 (4-8)
  for (const c of approved) {
    if (c.correctionType === 'add_missing' && c.kind && c.newPunchedAt) {
      out.push({ kind: c.kind, at: c.newPunchedAt, workDate: c.workDate });
    }
  }
  return out;
}

/**
 * 한 근무일의 유효 기록을 시각순으로 짝짓는다.
 * - 출근이 열린 채 또 출근 → 앞의 출근을 유지하고 '중복 출근' (7-4 요점 2: 막지 않고 사람이 판단)
 * - 열린 출근 없이 퇴근 → 앞에 닫힌 쌍이 있으면 '중복 퇴근', 아니면 '짝 없는 퇴근' 쌍(in=null)
 * - 끝까지 열린 출근 → 퇴근 null 쌍 + '퇴근 미기록'
 */
export function pairDay(records: Effective[]): { pairs: PunchPair[]; flags: string[] } {
  const sorted = [...records].sort((a, b) => a.at.getTime() - b.at.getTime());
  const pairs: PunchPair[] = [];
  const flags = new Set<string>();
  let open: Date | null = null;

  for (const r of sorted) {
    if (r.kind === 'in') {
      if (open) flags.add(FLAG.DUPLICATE_IN);
      else open = r.at;
    } else if (open) {
      pairs.push({ in: open, out: r.at });
      open = null;
    } else if (pairs.length > 0 && pairs[pairs.length - 1].in) {
      flags.add(FLAG.DUPLICATE_OUT);
    } else {
      pairs.push({ in: null, out: r.at });
    }
  }
  if (open) pairs.push({ in: open, out: null });
  return { pairs, flags: [...flags] };
}

/** 원본 + 정정 → 근무일별 쌍 */
export function pairsByWorkDate(
  events: PunchEvent[],
  corrections: PunchCorrection[],
): Map<string, { pairs: PunchPair[]; flags: string[] }> {
  const byDate = new Map<string, Effective[]>();
  for (const r of applyCorrections(events, corrections)) {
    const list = byDate.get(r.workDate) ?? [];
    list.push(r);
    byDate.set(r.workDate, list);
  }
  const out = new Map<string, { pairs: PunchPair[]; flags: string[] }>();
  for (const [d, list] of byDate) out.set(d, pairDay(list));
  return out;
}
