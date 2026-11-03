// 퇴근할 때 「저녁 휴게를 쉬었나요?」 (2026-11-04 의뢰인 — 지금 방식(평소보다 일찍 퇴근) + 퇴근할 때 직원에게 묻기, 지금 방식은 안전장치). 서버 전용.
// 묻는 날: 그날 휴게 중 17:00 이후에 시작하는 것(저녁 휴게)이 있고, 그 휴게 전에 출근해 휴게가 끝난 뒤 퇴근했고,
//          아직 「휴게 안 함」 표시도 직원의 답도 없는 날. 직원이 「못 쉬었어요」를 누르면 대기 한 줄(DB 0089) — 관리자가 근태 점검에서 승인한다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { daysFor, loadPeriod } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { hhmm, kstDateTime } from '@/lib/time';
import type { WorkRule } from '@/lib/types';

const breaksOf = (r: WorkRule) => [...(r.breakStart && r.breakEnd ? [{ start: hhmm(r.breakStart), end: hhmm(r.breakEnd) }] : []), ...(r.extraBreaks ?? []).map((b) => ({ start: hhmm(b.start), end: hhmm(b.end) }))];

/** 그날 물어볼 저녁 휴게 — 없으면 null */
export async function breakToAsk(employeeId: string, workDate: string, practice = OFFICE.practiceMode): Promise<{ start: string; end: string } | null> {
  const data = await loadPeriod(workDate, workDate, practice);
  const rule = data.ruleFor(employeeId, workDate) ?? data.ruleAt(workDate);
  if (!rule) return null;
  const evening = breaksOf(rule).find((b) => b.start >= '17:00');
  if (!evening) return null;
  if (data.waivedFor(employeeId, workDate).has(evening.start) || data.breakSkipFor(employeeId, workDate)) return null;
  const day = daysFor(data, employeeId, workDate, workDate)[0];
  const done = (day?.pairs ?? []).filter((p) => p.in && p.out);
  if (!done.length || (day?.pairs ?? []).some((p) => p.in && !p.out)) return null;
  const first = Math.min(...done.map((p) => p.in!.getTime()));
  const last = Math.max(...done.map((p) => p.out!.getTime()));
  if (first >= kstDateTime(workDate, evening.start).getTime() || last <= kstDateTime(workDate, evening.end).getTime()) return null;
  return evening;
}

/** 직원의 「못 쉬고 일했어요」 — 다시 확인한 뒤 대기 한 줄. 이미 있으면 그대로 */
export async function askBreakSkip(employeeId: string, workDate: string, practice = OFFICE.practiceMode): Promise<'ok' | 'nothing'> {
  const b = await breakToAsk(employeeId, workDate, practice);
  if (!b) return 'nothing';
  const { error } = await createAdminClient().from('break_skip_requests').insert({ employee_id: employeeId, work_date: workDate, break_start: b.start, break_end: b.end, is_test: practice });
  if (error && error.code !== '23505') throw new Error(`breakSkip.insert: ${error.code}`);
  return 'ok';
}

/** 관리자 처리 — 승인은 「휴게 안 함」 표시가 먼저 들어간 뒤에 부른다(화면이 순서대로 부른다) */
export async function decideBreakSkip(id: string, decision: 'approved' | 'rejected', actorId: string, practice = OFFICE.practiceMode): Promise<{ employeeId: string; workDate: string } | null> {
  const db = createAdminClient();
  const { data } = await db.from('break_skip_requests').update({ status: decision, decided_by: actorId, decided_at: new Date().toISOString() }).eq('id', id).eq('is_test', practice).eq('status', 'pending').select('employee_id, work_date');
  const row = data?.[0];
  return row ? { employeeId: row.employee_id as string, workDate: row.work_date as string } : null;
}
