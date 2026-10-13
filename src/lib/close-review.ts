// 근태 월 마감의 검토 — 순수 함수 (PRD v1.3 8 · 35.2장). DB와 떨어져 있어 단위 검사로 확인한다.
// 마감할 수 있으려면: 그 달에 기록이 있는 날이 전부 확정돼 있고, 그 달에 걸린 대기 중 요청이 없고, 「마감 차단」으로 정한 이상 기록이 없어야 한다.
// 간주 근무일(일정 시간으로 계산하는 날)은 찍은 기록이 없어도 되므로 확정을 요구하지 않는다.

export type PendingCounts = { correction: number; punch: number; overtime: number; leave: number; work: number; shift: number };
export type CloseReview = {
  recordDays: string[]; // 기록이 있는 날 (간주 근무일 제외)
  unconfirmed: string[]; // 그중 확정되지 않은 날
  deemedDays: number;
  pending: PendingCounts;
  pendingTotal: number;
  anomalyBlocks: number; // 마감을 막는 이상 기록(일 수) — 이상자 관리의 「마감 차단」 유형
  anomalyChecks: number; // 확인만 하는 이상 기록(일 수) — 마감을 막지 않는다
  blockers: number; // 0이어야 마감할 수 있다
  payableMinutes: number;
  netMinutes: number;
};

export function reviewMonth(args: { days: { workDate: string; hasRecord: boolean; deemed: boolean; payableMinutes: number; netMinutes: number }[]; confirmed: ReadonlySet<string>; pending: PendingCounts; anomalies?: { block: number; check: number } }): CloseReview {
  const recordDays = args.days.filter((d) => d.hasRecord && !d.deemed).map((d) => d.workDate);
  const unconfirmed = recordDays.filter((d) => !args.confirmed.has(d));
  const pendingTotal = Object.values(args.pending).reduce((a, b) => a + b, 0);
  return {
    recordDays,
    unconfirmed,
    deemedDays: args.days.filter((d) => d.deemed).length,
    pending: args.pending,
    pendingTotal,
    anomalyBlocks: args.anomalies?.block ?? 0,
    anomalyChecks: args.anomalies?.check ?? 0,
    blockers: unconfirmed.length + pendingTotal + (args.anomalies?.block ?? 0),
    payableMinutes: args.days.reduce((a, d) => a + d.payableMinutes, 0),
    netMinutes: args.days.reduce((a, d) => a + d.netMinutes, 0),
  };
}

/** 'YYYY-MM' → 그 달의 [첫날, 다음 달 첫날) */
export function monthSpan(ym: string): { from: string; to: string; last: string } {
  const [y, m] = ym.split('-').map(Number);
  const from = `${ym}-01`;
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to, last };
}
export const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
