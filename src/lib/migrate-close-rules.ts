// 이관 정리 (개발-63, 2026-11-01 의뢰인) — 기준일 이전 지난 연장 요청을 한 번에 닫는 규칙. DB를 모르는 순수 함수.
//   재확인(이미 결정됐는데 다시 계산하니 달라진 것) → keep: 결정했던 값 그대로 다시 결정(재확인 표시만 내린다)
//   대기(아직 결정 안 한 것)                     → approve: 계산된 시간 그대로 인정 / reject: 인정 안 함
// 기준일 뒤 날짜 · 상태와 맞지 않는 처리는 받지 않는다 — 화면이 오래돼 그사이 바뀐 건을 잘못 닫지 않게.
export type MigrateAction = 'keep' | 'approve' | 'reject';
export type MigrateRow = {
  id: string; workDate: string; status: 'pending' | 'approved' | 'rejected'; needsReview: boolean;
  approvedMinutes: number | null; approvedNightMinutes: number | null; approvedHolidayMinutes: number | null;
};
export type MigrateOp = {
  id: string; decision: 'approved' | 'rejected';
  approvedMinutes: number | null; approvedNightMinutes: number | null; approvedHolidayMinutes: number | null;
};
export type MigrateSkip = { id: string; why: 'not_found' | 'after_cutoff' | 'wrong_state' };

/** 정리 대상인가: 기준일 이전이고, 대기이거나 재확인이 걸린 것 */
export const isMigrateTarget = (r: MigrateRow, cutoff: string) => r.workDate <= cutoff && (r.status === 'pending' || r.needsReview);

/** 고른 처리 → DB에 넘길 결정. keep은 그때 값을 그대로(인정분이 비어 있으면 비어 있는 그대로 — 계산된 시간 전부 인정이라는 뜻) */
export function planMigrate(rows: readonly MigrateRow[], picks: readonly { id: string; action: MigrateAction }[], cutoff: string): { ops: MigrateOp[]; skipped: MigrateSkip[] } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ops: MigrateOp[] = [];
  const skipped: MigrateSkip[] = [];
  for (const p of picks) {
    const r = byId.get(p.id);
    if (!r) { skipped.push({ id: p.id, why: 'not_found' }); continue; }
    if (r.workDate > cutoff) { skipped.push({ id: p.id, why: 'after_cutoff' }); continue; }
    if (p.action === 'keep') {
      if (!(r.needsReview && r.status !== 'pending')) { skipped.push({ id: p.id, why: 'wrong_state' }); continue; }
      ops.push({ id: r.id, decision: r.status, approvedMinutes: r.approvedMinutes, approvedNightMinutes: r.approvedNightMinutes, approvedHolidayMinutes: r.approvedHolidayMinutes });
    } else {
      if (r.status !== 'pending') { skipped.push({ id: p.id, why: 'wrong_state' }); continue; }
      ops.push({ id: r.id, decision: p.action === 'approve' ? 'approved' : 'rejected', approvedMinutes: null, approvedNightMinutes: null, approvedHolidayMinutes: null });
    }
  }
  return { ops, skipped };
}
