// 요청 통합 (의뢰인 2026-10-10: 시프티의 「요청」 탭처럼 — 종류가 달라도 한 목록, 대기중/완료로 나눈다). 순수함수.
// 정정 · 연장근로 확인 · 휴가 · 외근/출장/재택은 표가 따로다 — 여기서 같은 모양(ReqItem)으로 맞춘다. 처리(승인·거절)는 기존 길 그대로다.
export type ReqKind = 'correction' | 'overtime' | 'leave' | 'work';
export type ReqStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ReqItem = {
  key: string; // 종류 + id (목록 키)
  kind: ReqKind;
  id: string;
  employeeId: string;
  status: ReqStatus;
  date: string; // 그 요청이 가리키는 날 (기간이면 시작일)
  endDate: string;
  sub: string | null; // 종류 안의 구분: 정정 종류 · 휴가 종류 코드 · 외근 종류
  startTime: string | null;
  endTime: string | null;
  punchKind: 'in' | 'out' | null; // 정정: 출근/퇴근
  newAt: string | null; // 정정: 새 시각
  minutes: number | null; // 연장근로: 분
  days: number | null; // 휴가: 일수
  place: string | null; // 외근: 장소
  reason: string | null;
  createdAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
};

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
const hm = (v: unknown) => (typeof v === 'string' ? v.slice(0, 5) : null);
const base = (kind: ReqKind, r: Row, date: string, endDate = date): ReqItem => ({
  key: `${kind}:${r.id}`, kind, id: String(r.id), employeeId: String(r.employee_id), status: r.status as ReqStatus, date, endDate,
  sub: null, startTime: null, endTime: null, punchKind: null, newAt: null, minutes: null, days: null, place: null,
  reason: s(r.reason), createdAt: s(r.created_at), decidedAt: s(r.decided_at), decidedBy: s(r.approved_by),
});

export const fromCorrection = (r: Row): ReqItem => ({ ...base('correction', r, String(r.work_date)), sub: s(r.correction_type), punchKind: r.kind === 'in' || r.kind === 'out' ? r.kind : null, newAt: s(r.new_punched_at) });
export const fromOvertime = (r: Row): ReqItem => ({ ...base('overtime', r, String(r.work_date)), minutes: Number(r.overtime_minutes ?? 0) + Number(r.holiday_minutes ?? 0) });
export const fromLeave = (r: Row): ReqItem => ({ ...base('leave', r, String(r.start_date), String(r.end_date)), sub: s(r.type_code), days: Number(r.days), startTime: hm(r.start_time), endTime: hm(r.end_time) });
export const fromWork = (r: Row): ReqItem => ({ ...base('work', r, String(r.start_date), String(r.end_date)), sub: s(r.kind), place: s(r.place), startTime: hm(r.start_time), endTime: hm(r.end_time) });

const desc = (a: string | null, b: string | null) => (a === b ? 0 : (a ?? '') < (b ?? '') ? 1 : -1);

/** 대기중(새 요청이 위) / 완료(방금 처리된 것이 위 — 처리 시각이 없으면 낸 시각) */
export function splitRequests(items: readonly ReqItem[]): { pending: ReqItem[]; done: ReqItem[] } {
  const pending = items.filter((x) => x.status === 'pending').sort((a, b) => desc(a.createdAt, b.createdAt) || desc(a.date, b.date));
  const done = items.filter((x) => x.status !== 'pending').sort((a, b) => desc(a.decidedAt ?? a.createdAt, b.decidedAt ?? b.createdAt) || desc(a.date, b.date));
  return { pending, done };
}

/** 「2일 전」 — 앞날이거나 1분 안이면 now */
export function ago(now: Date, iso: string | null): { unit: 'now' | 'min' | 'hour' | 'day'; n: number } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const min = Math.floor((now.getTime() - t) / 60_000);
  if (min < 1) return { unit: 'now', n: 0 };
  if (min < 60) return { unit: 'min', n: min };
  if (min < 60 * 24) return { unit: 'hour', n: Math.floor(min / 60) };
  return { unit: 'day', n: Math.floor(min / (60 * 24)) };
}
