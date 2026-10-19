// 하루 한 번에 승인의 마지막 단계 (2026-10-18 의뢰인: 관리자는 [승인] 한 번 — 출퇴근 요청을 승인하면 생기는 연장 · 야간 · 휴일 시간도 계산된 그대로 함께 인정).
// 출근 · 퇴근 요청을 승인한 직후에 부른다. 그날 기록으로 연장근로 확인을 만들거나 다시 세고(syncOvertimeRequests), 대기 중이면 계산값 그대로 승인한다.
// 줄여서 인정하려면 요청함의 「연장근로 확인」 카드에서 부분 승인을 쓴다(이 함수는 전부 인정만 한다). 서버 전용.
import 'server-only';
import { OFFICE } from '@/config/office';
import { loadPeriod, syncOvertimeRequests } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export type DayOvertimeResult = { result: 'none' | 'ok' | 'already'; overtime: number; night: number; holiday: number };

export async function approveDayOvertime(args: { employeeId: string; workDate: string; actorId: string; requestId: string }): Promise<DayOvertimeResult> {
  const today = toKstDate(new Date());
  // 주 40시간 계산 때문에 그 주 전체를 읽는다(loadPeriod가 from이 속한 주 월요일부터 읽는다)
  const day = args.workDate < today ? args.workDate : today;
  const data = await loadPeriod(day, day);
  await syncOvertimeRequests(data, day);
  const db = createAdminClient();
  const { data: row } = await db
    .from('overtime_requests')
    .select('id, status, overtime_minutes, night_minutes, holiday_minutes')
    .eq('employee_id', args.employeeId).eq('work_date', args.workDate).eq('is_test', OFFICE.practiceMode)
    .maybeSingle();
  if (!row) return { result: 'none', overtime: 0, night: 0, holiday: 0 };
  const facts = { overtime: row.overtime_minutes as number, night: row.night_minutes as number, holiday: row.holiday_minutes as number };
  if (row.status !== 'pending') return { result: 'already', ...facts };
  const { data: r, error } = await db.rpc('decide_overtime', {
    p_id: row.id, p_decision: 'approved', p_approved_minutes: null, p_approved_night: null, p_approved_holiday: null,
    p_decided_by: args.actorId, p_reason: null, p_request_id: args.requestId,
  });
  if (error) throw new Error(`approveDayOvertime: ${error.code}`);
  return { result: r === 'ok' ? 'ok' : 'already', ...facts };
}
