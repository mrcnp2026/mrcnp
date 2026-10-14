// 근태 월 마감 — 읽기 · 마감 · 다시 열기 (PRD v1.3 8 · 35.2장). 서버 전용.
// 잠금은 DB가 한다(0034의 트리거: 마감된 기간의 근태 자료는 넣지도 고치지도 못한다). 여기는 검토와 마감 기록을 만든다.
// 급여 마감과 따로 된 잠금을 만들지 않는다 — 급여도 이 마감 기록(attendance_closes)을 본다.
import 'server-only';
import { createHash } from 'node:crypto';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { monthSpan, reviewMonth, type CloseReview, type PendingCounts } from '@/lib/close-review';
import { confirmKey, loadConfirms } from '@/lib/confirm-data';
import { canonical } from '@/lib/payroll/reference';
import { daysFor, loadPeriod, type PeriodData } from '@/lib/period-data';
import { summarizeAnomalies } from '@/lib/anomaly';
import { collectAnomalies, loadAnomalyPolicy, loadAnomalyReviews } from '@/lib/anomaly-data';
import { loadStaff } from '@/lib/staff-data';
import { needsSecondAdmin } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export type CloseRow = { id: string; employeeId: string; periodFrom: string; periodTo: string; revision: number; state: 'CLOSED' | 'REOPENED'; closedBy: string; closedAt: string; reopenedBy: string | null; reopenedAt: string | null; reopenReason: string | null };
const toClose = (r: Record<string, unknown>): CloseRow => ({ id: r.id as string, employeeId: r.employee_id as string, periodFrom: r.period_from as string, periodTo: r.period_to as string, revision: r.revision as number, state: r.state as CloseRow['state'], closedBy: r.closed_by as string, closedAt: r.closed_at as string, reopenedBy: r.reopened_by as string | null, reopenedAt: r.reopened_at as string | null, reopenReason: r.reopen_reason as string | null });

/** 그 달의 마감 기록 전부 (다시 연 것 포함, 판 번호 큰 것부터) */
export async function loadCloses(ym: string, practice: boolean): Promise<CloseRow[]> {
  const { from, to } = monthSpan(ym);
  const { data, error } = await createAdminClient().from('attendance_closes').select('*').eq('is_test', practice).eq('period_from', from).eq('period_to', to).order('revision', { ascending: false });
  if (error) throw new Error(`loadCloses: ${error.code}`);
  return (data ?? []).map(toClose);
}

export type CloseLine = { employeeId: string; name: string; employeeNo: string | null; groupId: string | null; jobId: string | null; active: boolean; review: CloseReview; hash: string; close: CloseRow | null; history: CloseRow[] };

/** 마감할 때 본 근태 자료의 해시 — 그 직원 · 그 달의 사실들. 검토 뒤 자료가 바뀌었는지 알아낸다 */
function inputHash(data: PeriodData, employeeId: string, from: string, last: string, confirmed: string[]): string {
  const inMonth = (d: string) => d >= from && d <= last;
  const facts = {
    events: data.events.filter((e) => e.employeeId === employeeId && inMonth(e.workDate)).map((e) => [e.id, e.kind, e.punchedAt.toISOString()]).sort(),
    corrections: data.corrections.filter((c) => c.employeeId === employeeId && inMonth(c.workDate)).map((c) => [c.id, c.status, c.correctionType, c.newPunchedAt ? c.newPunchedAt.toISOString() : null]).sort(),
    overtime: data.overtime.filter((o) => o.employeeId === employeeId).map((o) => [o.id, o.status, o.approvedMinutes, o.approvedNightMinutes, o.approvedHolidayMinutes, o.needsReview]).sort(),
    leave: data.leaveRequests.filter((l) => l.employeeId === employeeId && l.startDate <= last && l.endDate >= from).map((l) => [l.id, l.status, l.startDate, l.endDate, l.days, l.typeCode, l.startTime ?? null, l.endTime ?? null]).sort(),
    work: data.workRequests.filter((w) => w.employeeId === employeeId && w.startDate <= last && w.endDate >= from).map((w) => [w.id, w.status, w.startDate, w.endDate, w.kind]).sort(),
    shifts: data.shifts.filter((s) => s.employeeId === employeeId && inMonth(s.workDate)).map((s) => [s.id, s.workDate, s.startTime, s.endTime, s.kind]).sort(),
    confirmed: [...confirmed].sort(),
  };
  return createHash('sha256').update(canonical(facts)).digest('hex');
}

/**
 * 그 달의 마감 검토. 대상 = 켜져 있는 직원 + 꺼져 있어도 그 달에 기록 · 휴가가 있는 직원 (퇴사자를 빼먹지 않는다). 검사 전용 계정은 뺀다.
 * 조회만 한다 — 연장 요청 동기화 같은 쓰기를 하지 않는다.
 */
export async function loadCloseBoard(ym: string, practice: boolean): Promise<{ lines: CloseLine[]; data: PeriodData; from: string; last: string }> {
  const { from, to, last } = monthSpan(ym);
  const db = createAdminClient();
  const [data, confirms, closes, { data: pr }, { data: sr }, anomalyPolicy, reviews] = await Promise.all([
    loadPeriod(from, last, practice),
    loadConfirms(from, last, practice),
    loadCloses(ym, practice),
    db.from('punch_requests').select('employee_id').eq('is_test', practice).eq('status', 'pending').gte('work_date', from).lt('work_date', to),
    db.from('shift_requests').select('employee_id').eq('is_test', practice).eq('status', 'pending').gte('work_date', from).lt('work_date', to),
    loadAnomalyPolicy(),
    loadAnomalyReviews(from, last, practice),
  ]);
  // 이상자 관리에서 「마감 차단」으로 정한 유형이 남아 있으면 마감하지 못한다
  const anomalies = summarizeAnomalies(collectAnomalies(data, from, last), anomalyPolicy.policy, new Set(reviews.keys())).byEmployee;
  const count = (rows: { employee_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.employee_id === id).length;
  const inMonth = (d: string) => d >= from && d <= last;
  const lines: CloseLine[] = [];
  for (const p of data.people) {
    // 검사 계정(e2e-)은 loadPeriod가 보는 사람에 따라 이미 뺀다(실제 관리자 → 전부 뺌, 검사 계정 → 꺼진 것만 뺌) — 여기서 또 빼면 검사 계정으로도 확인할 수 없다
    const mine = data.events.filter((e) => e.employeeId === p.id && inMonth(e.workDate));
    const leaves = data.leaveRequests.filter((l) => l.employeeId === p.id && l.startDate <= last && l.endDate >= from);
    if (!p.active && mine.length === 0 && leaves.length === 0) continue;
    const days = daysFor(data, p.id, from, last);
    const eventDays = new Set([...mine.map((e) => e.workDate), ...data.corrections.filter((c) => c.employeeId === p.id && c.status === 'approved' && c.correctionType === 'add_missing' && inMonth(c.workDate)).map((c) => c.workDate)]);
    const confirmed = new Set(days.map((d) => d.workDate).filter((d) => confirms.has(confirmKey(p.id, d))));
    const pending: PendingCounts = {
      correction: data.corrections.filter((c) => c.employeeId === p.id && c.status === 'pending' && inMonth(c.workDate)).length,
      punch: count(pr, p.id),
      overtime: data.overtime.filter((o) => o.employeeId === p.id && (o.status === 'pending' || o.needsReview)).length,
      leave: leaves.filter((l) => l.status === 'pending').length,
      work: data.workRequests.filter((w) => w.employeeId === p.id && w.status === 'pending' && w.startDate <= last && w.endDate >= from).length,
      shift: count(sr, p.id),
    };
    const review = reviewMonth({ days: days.map((d) => ({ workDate: d.workDate, hasRecord: eventDays.has(d.workDate) || d.pairs.length > 0, deemed: !!d.deemed, payableMinutes: d.payableMinutes, netMinutes: d.netMinutes })), confirmed, pending, anomalies: anomalies.get(p.id) });
    const history = closes.filter((c) => c.employeeId === p.id);
    lines.push({ employeeId: p.id, name: p.name, employeeNo: p.employeeNo, groupId: p.groupId, jobId: p.jobId, active: p.active, review, hash: inputHash(data, p.id, from, last, [...confirmed]), close: history.find((c) => c.state === 'CLOSED') ?? null, history });
  }
  return { lines, data, from, last };
}

export type CloseResult = { employeeId: string; result: 'closed' | 'blocked' | 'changed' | 'already_closed' | 'not_found' | 'future' };

/**
 * 마감 — 고른 직원마다: 다시 검토해 막는 것이 없고, 화면이 본 해시와 지금 자료가 같을 때만 마감 기록과 스냅샷을 만든다.
 * 마감 기록이 들어가는 순간부터 DB가 그 기간의 근태 변경을 막는다. 그 직전에 끼어든 변경은 스냅샷을 만들기 전에 해시를 다시 봐서 잡는다(다르면 바로 다시 연다).
 */
export async function closeMonth(args: { ym: string; practice: boolean; items: { employeeId: string; hash: string }[]; today: string; me: Me }): Promise<CloseResult[]> {
  const { from, to, last } = monthSpan(args.ym);
  // 아직 끝나지 않은 달은 마감하지 않는다 (마지막 날이 지나야 한다)
  if (last >= args.today) return args.items.map((x) => ({ employeeId: x.employeeId, result: 'future' as const }));
  const db = createAdminClient();
  const board = await loadCloseBoard(args.ym, args.practice);
  const out: CloseResult[] = [];
  for (const it of args.items) {
    const line = board.lines.find((l) => l.employeeId === it.employeeId);
    if (!line) {
      out.push({ employeeId: it.employeeId, result: 'not_found' });
      continue;
    }
    if (line.close) {
      out.push({ employeeId: it.employeeId, result: 'already_closed' });
      continue;
    }
    if (line.review.blockers > 0) {
      out.push({ employeeId: it.employeeId, result: 'blocked' });
      continue;
    }
    if (line.hash !== it.hash) {
      out.push({ employeeId: it.employeeId, result: 'changed' });
      continue;
    }
    const revision = (line.history[0]?.revision ?? 0) + 1;
    const { data: row, error } = await db.from('attendance_closes').insert({ employee_id: it.employeeId, period_from: from, period_to: to, is_test: args.practice, revision, input_hash: line.hash, closed_by: args.me.id }).select('id').single();
    if (error || !row) {
      if (error?.code === '23P01' || error?.code === '23505') {
        out.push({ employeeId: it.employeeId, result: 'already_closed' });
        continue;
      }
      throw new Error(`closeMonth.insert: ${error?.code}`);
    }
    // 잠긴 뒤의 자료로 다시 읽어 스냅샷을 만든다. 마감 기록을 넣기 직전에 누가 바꿨으면 해시가 다르다 → 다시 연다
    const dep = { from: addDays(from, -6), to: addDays(last, 6) };
    const after = await loadCloseBoard(args.ym, args.practice);
    const now = after.lines.find((l) => l.employeeId === it.employeeId);
    const reopen = async (why: string) => db.from('attendance_closes').update({ state: 'REOPENED', reopened_by: args.me.id, reopened_at: new Date().toISOString(), reopen_reason: why }).eq('id', row.id);
    if (!now || now.hash !== line.hash || now.review.blockers > 0) {
      await reopen('자동: 마감하는 동안 근태 자료가 바뀌었습니다');
      out.push({ employeeId: it.employeeId, result: 'changed' });
      continue;
    }
    const payload = {
      month: args.ym,
      employee: { id: line.employeeId, name: line.name, employeeNo: line.employeeNo, groupId: line.groupId, jobId: line.jobId },
      review: now.review,
      days: daysFor(after.data, it.employeeId, from, last),
      leave: after.data.leaveRequests.filter((l) => l.employeeId === it.employeeId && l.status === 'approved' && l.startDate <= last && l.endDate >= from),
      work: after.data.workRequests.filter((w) => w.employeeId === it.employeeId && w.status === 'approved' && w.startDate <= last && w.endDate >= from),
      overtime: after.data.overtime.filter((o) => o.employeeId === it.employeeId),
    };
    const snap = await db.from('attendance_close_snapshots').insert({ close_id: row.id, dependency_from: dep.from, dependency_to: dep.to, payload: JSON.parse(JSON.stringify(payload)), input_hash: line.hash });
    if (snap.error) {
      await reopen('자동: 스냅샷을 만들지 못했습니다');
      throw new Error(`closeMonth.snapshot: ${snap.error.code}`);
    }
    out.push({ employeeId: it.employeeId, result: 'closed' });
  }
  return out;
}

/** 다시 열기 — 사유를 꼭 적는다. 마감 기록은 남고, 그 기간의 근태를 다시 고칠 수 있게 된다 */
export async function reopenClose(id: string, reason: string, me: Me): Promise<void> {
  const { data, error } = await createAdminClient().from('attendance_closes').update({ state: 'REOPENED', reopened_by: me.id, reopened_at: new Date().toISOString(), reopen_reason: reason }).eq('id', id).eq('state', 'CLOSED').select('id');
  if (error) throw new Error(`reopenClose: ${error.code}`);
  if (!data?.length) throw new ApiError(409, 'close_not_open');
}

// ── 다시 열기의 두 번째 관리자 확인 (0038, PRD 8장) ──
export type ReopenRequest = { id: string; closeId: string; reason: string; requestedBy: string; createdAt: string };
/** 대기 중인 다시 열기 요청 (마감 기록 번호 → 요청) */
export async function loadReopenRequests(closeIds: string[]): Promise<Map<string, ReopenRequest>> {
  if (closeIds.length === 0) return new Map();
  const { data, error } = await createAdminClient().from('attendance_reopen_requests').select('id, close_id, reason, requested_by, created_at').eq('status', 'pending').in('close_id', closeIds);
  if (error) throw new Error(`loadReopenRequests: ${error.code}`);
  return new Map((data ?? []).map((r) => [r.close_id as string, { id: r.id as string, closeId: r.close_id as string, reason: r.reason as string, requestedBy: r.requested_by as string, createdAt: r.created_at as string }]));
}

/**
 * 다시 열기 — 다른 관리자가 있으면 바로 열지 않고 요청으로 남긴다(그 관리자가 확인해야 열린다). 관리자가 혼자이거나 오너면 바로 연다.
 * 권한 변경의 「두 번째 관리자 확인」과 같은 규칙(staff-rules.ts)을 쓴다.
 */
export async function requestReopen(id: string, reason: string, me: Me): Promise<'reopened' | 'requested'> {
  if (!needsSecondAdmin(me.id, await loadStaff())) {
    await reopenClose(id, reason, me);
    return 'reopened';
  }
  const db = createAdminClient();
  const { data: c } = await db.from('attendance_closes').select('id, state').eq('id', id).maybeSingle();
  if (!c || c.state !== 'CLOSED') throw new ApiError(409, 'close_not_open');
  const { error } = await db.from('attendance_reopen_requests').insert({ close_id: id, reason, requested_by: me.id });
  if (error?.code === '23505') throw new ApiError(409, 'reopen_pending');
  if (error) throw new Error(`requestReopen: ${error.code}`);
  return 'requested';
}

/** 요청 처리 — 확인 · 거절은 요청한 사람과 다른 관리자만, 취소는 요청한 본인만. 확인하면 요청의 사유로 마감을 연다 */
export async function decideReopen(args: { requestId: string; decision: 'approved' | 'rejected' | 'cancelled'; me: Me }): Promise<void> {
  const db = createAdminClient();
  const { data: r } = await db.from('attendance_reopen_requests').select('id, close_id, reason, requested_by, status').eq('id', args.requestId).maybeSingle();
  if (!r) throw new ApiError(404, 'not_found');
  if (r.status !== 'pending') throw new ApiError(409, 'already');
  if (args.decision === 'cancelled' ? r.requested_by !== args.me.id : r.requested_by === args.me.id) throw new ApiError(403, args.decision === 'cancelled' ? 'forbidden' : 'self_decision');
  const { data: done, error } = await db.from('attendance_reopen_requests').update({ status: args.decision, decided_by: args.me.id, decided_at: new Date().toISOString() }).eq('id', r.id).eq('status', 'pending').select('id');
  if (error) throw new Error(`decideReopen: ${error.code}`);
  if (!done?.length) throw new ApiError(409, 'already');
  if (args.decision === 'approved') await reopenClose(r.close_id as string, r.reason as string, args.me);
}

/**
 * 그 직원의 그 날짜가 마감된 기간인가 (연습/운영은 지금 앱의 모드). employeeId가 비어 있으면 "그 날짜에 마감된 직원이 한 명이라도 있는가".
 * DB 트리거가 최종 방어선이고, 이 함수는 화면에 미리 「마감된 달입니다」를 보이기 위한 것이다.
 */
export async function isClosed(employeeId: string, workDate: string, practice = OFFICE.practiceMode): Promise<boolean> {
  let q = createAdminClient().from('attendance_closes').select('id').eq('state', 'CLOSED').eq('is_test', practice).lte('period_from', workDate).gt('period_to', workDate).limit(1);
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q;
  if (error) throw new Error(`isClosed: ${error.code}`);
  return (data?.length ?? 0) > 0;
}
