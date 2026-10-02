// 외근·출장·재택 (②-3 7-11). 순수함수.
// ★ 승인해도 punch_events.ip_verified는 그대로 — 화면에서 "승인된 외근"으로 표시만 (B-21).
// ★ 승인된 외근·출장·재택 날 출퇴근이 없으면 결근이 아니다 (요점 3). 그날 근로시간 간주는 노무 확인 전이라 더하지 않는다.
import { addDays } from '@/lib/calendar';

export type WorkKind = 'outside' | 'business_trip' | 'remote';
export const WORK_KINDS: WorkKind[] = ['outside', 'business_trip', 'remote'];
export type WorkRequest = {
  id: string; employeeId: string; kind: WorkKind; startDate: string; endDate: string; startTime: string | null; endTime: string | null;
  place: string; reason: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; createdAt?: string; decidedAt?: string | null; approvedBy?: string | null;
};

/** 그 날짜의 승인된 외근 종류 (여러 건이면 출장 > 외근 > 재택) */
export function workStatusOn(date: string, employeeId: string, reqs: WorkRequest[]): WorkKind | null {
  const on = reqs.filter((r) => r.status === 'approved' && r.employeeId === employeeId && r.startDate <= date && r.endDate >= date).map((r) => r.kind);
  return on.includes('business_trip') ? 'business_trip' : on.includes('outside') ? 'outside' : on.includes('remote') ? 'remote' : null;
}

/** 승인된 외근 → 날짜별 종류 (from~to) */
export function workByDate(reqs: WorkRequest[], employeeId: string, from: string, to: string): Map<string, WorkKind> {
  const out = new Map<string, WorkKind>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = workStatusOn(d, employeeId, reqs);
    if (k) out.set(d, k);
  }
  return out;
}
