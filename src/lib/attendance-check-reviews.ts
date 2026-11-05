// 근태 점검 — 담당자 판단 기록 (DB 0088 attendance_check_reviews, 결정 급여-69 · 급여-71). 서버 전용.
// 항목은 저장하지 않고 그때그때 계산한다. 판단할 때 보였던 항목의 요약(fingerprint)을 같이 남겨, 그 뒤 자료가 바뀌면 다시 띄운다.
import 'server-only';
import type { DayCheck, MonthCheck } from '@/lib/attendance-check';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const CHECK_DECISIONS = ['recognized', 'not_recognized', 'break_taken', 'not_late', 'schedule_ok', 'confirmed'] as const;
export type CheckDecision = (typeof CHECK_DECISIONS)[number];
export type CheckReview = { id: string; employeeId: string; workDate: string; scope: 'day' | 'month'; kind: 'day' | MonthCheck['kind']; decision: CheckDecision; note: string | null; fingerprint: string; decidedBy: string; createdAt: string };

/** 그날 숫자에 들어가는 항목의 요약 — 흐리게만 남은 것 · 한 달 1건으로 옮겨 간 것은 빼고 */
export const dayFingerprint = (d: DayCheck) =>
  d.parts.filter((p) => !p.quiet && !p.bundled).map((p) => `${p.kind}:${p.minutes}:${p.covered}`).join('|') || 'none';
// 칸별 판단 (2026-11-05 의뢰인: 지각 [무급] 하나가 그날 연장 칸까지 닫았다) — 「p|」로 시작하면 판단한 칸의 요약만 담는다.
//   그날 판단할 칸이 모두 들어 있어야 처리 완료, 일부만이면 그 칸만 닫힌다. 예전 기록(하루 통째)은 그대로 읽는다
const partSig = (p: DayCheck['parts'][number]) => `${p.kind}:${p.minutes}:${p.covered}`;
const openParts = (d: DayCheck) => d.parts.filter((p) => !p.quiet && !p.bundled && p.state === 'decide');
export const partsFingerprint = (d: DayCheck, kinds: readonly string[], prev?: string | null) => {
  const keep = prev?.startsWith('p|') ? prev.slice(2).split('|').filter((x) => x && !kinds.includes(x.split(':')[0])) : [];
  const mine = d.parts.filter((p) => !p.quiet && !p.bundled && kinds.includes(p.kind)).map(partSig);
  return `p|${[...keep, ...mine].join('|')}`.slice(0, 500);
};
export const monthFingerprint = (m: MonthCheck) => `${m.kind}:${m.dates.length}:${m.fromMin}-${m.toMin}`;
export const monthKey = (m: Pick<MonthCheck, 'month' | 'kind'>) => `${m.month}:${m.kind}`;

export async function loadCheckReviews(from: string, to: string, practice: boolean, employeeIds?: string[]): Promise<CheckReview[]> {
  let q = createAdminClient().from('attendance_check_reviews').select('id, employee_id, work_date, scope, kind, decision, note, fingerprint, decided_by, created_at').eq('active', true).eq('is_test', practice).gte('work_date', from).lte('work_date', to);
  if (employeeIds?.length) q = q.in('employee_id', employeeIds);
  const { data, error } = await q;
  if (error) throw new Error(`loadCheckReviews: ${error.code}`);
  return (data ?? []).map((r) => ({ id: r.id, employeeId: r.employee_id, workDate: r.work_date, scope: r.scope, kind: r.kind, decision: r.decision, note: r.note, fingerprint: r.fingerprint, decidedBy: r.decided_by, createdAt: r.created_at }) as CheckReview);
}

/**
 * 한 직원의 판단 상태 — 처리됨(요약이 같다) · 처리 뒤 바뀜(요약이 다르다 → 다시 판단 필요).
 * handled는 countDays에 넘기는 열쇠: 날짜 'YYYY-MM-DD' · 한 달 'YYYY-MM:종류'
 */
export function reviewState(days: readonly DayCheck[], monthly: readonly MonthCheck[], reviews: readonly CheckReview[]) {
  const handled = new Set<string>();
  const changed = new Set<string>();
  const byKey = new Map<string, CheckReview>();
  for (const r of reviews) byKey.set(r.scope === 'day' ? r.workDate : `${r.workDate.slice(0, 7)}:${r.kind}`, r);
  const doneKinds = new Map<string, Set<string>>(); // 칸별 판단으로 닫힌 칸 — 그날이 아직 열려 있어도 이 칸의 단추는 숨긴다
  for (const d of days) {
    const r = byKey.get(d.workDate);
    if (!r) continue;
    if (!r.fingerprint.startsWith('p|')) {
      (r.fingerprint === dayFingerprint(d) ? handled : changed).add(d.workDate);
      continue;
    }
    const sigs = new Set(r.fingerprint.slice(2).split('|').filter(Boolean));
    const sigKinds = new Set([...sigs].map((x) => x.split(':')[0]));
    const open = openParts(d);
    const done = open.filter((p) => sigs.has(partSig(p)));
    if (open.some((p) => !sigs.has(partSig(p)) && sigKinds.has(p.kind))) changed.add(d.workDate); // 판단한 칸의 숫자가 바뀜
    else if (done.length === open.length) handled.add(d.workDate);
    if (done.length) doneKinds.set(d.workDate, new Set(done.map((p) => p.kind)));
  }
  for (const m of monthly) {
    const r = byKey.get(monthKey(m));
    if (!r) continue;
    (r.fingerprint === monthFingerprint(m) ? handled : changed).add(monthKey(m));
  }
  return { handled, changed, byKey, doneKinds };
}

/** 판단 남기기 — 같은 칸에 살아 있는 판단이 있으면 거두고 새로 넣는다(이력은 남는다) */
export async function saveCheckReview(a: { employeeId: string; workDate: string; scope: 'day' | 'month'; kind: CheckReview['kind']; decision: CheckDecision; note: string | null; fingerprint: string; practice: boolean; me: Me }): Promise<void> {
  const db = createAdminClient();
  const { error: e1 } = await db.from('attendance_check_reviews').update({ active: false, released_by: a.me.id, released_at: new Date().toISOString() }).eq('employee_id', a.employeeId).eq('work_date', a.workDate).eq('scope', a.scope).eq('kind', a.kind).eq('is_test', a.practice).eq('active', true);
  if (e1) throw new Error(`saveCheckReview.release: ${e1.code}`);
  const { error } = await db.from('attendance_check_reviews').insert({ employee_id: a.employeeId, work_date: a.workDate, scope: a.scope, kind: a.kind, decision: a.decision, note: a.note, fingerprint: a.fingerprint, is_test: a.practice, decided_by: a.me.id });
  if (error) throw new Error(`saveCheckReview: ${error.code}`);
}

export async function releaseCheckReview(id: string, practice: boolean, me: Me): Promise<string | null> {
  const { data, error } = await createAdminClient().from('attendance_check_reviews').update({ active: false, released_by: me.id, released_at: new Date().toISOString() }).eq('id', id).eq('is_test', practice).eq('active', true).select('employee_id');
  if (error) throw new Error(`releaseCheckReview: ${error.code}`);
  return (data?.[0]?.employee_id as string | undefined) ?? null;
}
