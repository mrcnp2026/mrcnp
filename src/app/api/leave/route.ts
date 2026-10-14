// 직원의 휴가 신청 (②-2 7-3, 4-7·4-11). 일수·상태·작성자는 서버가 정한다 (요청 본문의 days·status 무시).
// 사유는 선택 (4-7). 차감 대상(연차·반차·반반차)은 잔여 − 대기보다 많이 신청할 수 없다.
import { checkTypeRule, isTypeTarget, offWeekday } from '@/lib/leave-ledger';
import { groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadTypeRules } from '@/lib/leave-ledger-data';
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { calcLeaveBalance, countLeaveDays, leaveWindow, roundDays } from '@/lib/leave';
import { dayTypeResolver, loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests, loadLeaveTypes } from '@/lib/leave-data';
import { ledgerFor } from '@/lib/leave-ledger-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';
import { toKstDate } from '@/lib/time';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31; // 한 번에 한 달까지
const PAST_LIMIT_DAYS = 31; // 지난 날 사후 신청은 한 달 안

export const POST = api('leave.create', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  const type = (await loadLeaveTypes()).find((t) => t.code === b.typeCode);
  if (!type) throw new ApiError(400, 'invalid_input');
  const start = typeof b.startDate === 'string' && DATE.test(b.startDate) ? b.startDate : null;
  const end = type.dayUnit < 1 ? start : typeof b.endDate === 'string' && DATE.test(b.endDate) ? b.endDate : null;
  if (!start || !end || end < start) throw new ApiError(400, 'invalid_input');
  if (end > addDays(start, MAX_RANGE_DAYS - 1)) throw new ApiError(400, 'range_too_long');
  const today = toKstDate(new Date());
  if (start < addDays(today, -PAST_LIMIT_DAYS)) throw new ApiError(400, 'too_old');
  // 시각: 종류에 정해져 있으면 그것, 아니면 하루보다 짧은 종류에 한해 직원이 적은 시작 시각 (안 적어도 된다)
  const win = leaveWindow(type, b.startTime);
  if (!win.ok) throw new ApiError(400, 'invalid_time');
  const reason = cleanText(b.reason);
  if (reason.length > 200) throw new ApiError(400, 'invalid_input');

  const dayTypeOf = await dayTypeResolver(start, end);
  if (!dayTypeOf) throw new ApiError(409, 'no_rule');
  const days = countLeaveDays({ type, startDate: start, endDate: end, dayTypeOf });
  if (days <= 0) throw new ApiError(400, 'no_workdays');

  // 종류별 신청 규칙 (한 번에 낼 수 있는 일수 · 며칠 전까지 · 사유 필수) — 정해 둔 종류만
  const rule = (await loadTypeRules()).get(type.code)?.rule;
  const broke = rule ? checkTypeRule(rule, { days, startDate: start, today, reason }) : null;
  if (broke) throw new ApiError(400, broke);
  if (rule) {
    // 적용 대상(L13) · 허용 요일(L12) — 화면에서 고르지 못하게 해도 서버가 다시 막는다
    const [{ data: prof }, groups] = await Promise.all([createAdminClient().from('profiles').select('group_id').eq('id', me.id).maybeSingle(), loadOrgGroups()]);
    const scopes = new Map(rule.targets.groupIds.map((g) => [g, groupScope(groups, g)]));
    if (!isTypeTarget(rule, { id: me.id, groupId: (prof?.group_id as string | null) ?? null }, scopes)) throw new ApiError(403, 'leave_not_target');
    const workdays: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) if (dayTypeOf(d) === 'workday') workdays.push(d);
    if (offWeekday(rule, workdays)) throw new ApiError(400, 'leave_weekday');
  }

  const mine = await loadLeaveRequests({ employeeId: me.id, from: start, to: end });
  // 겹침: 같은 날 대기·승인 휴가의 단위 합이 하루를 넘으면 막는다 (반차 두 번 = 하루는 허용)
  const types = await loadAllLeaveTypes(); // 꺼 둔 종류로 낸 휴가도 겹침·잔여에 든다
  const unitOf = (code: string) => types.find((t) => t.code === code)?.dayUnit ?? 1;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (dayTypeOf(d) !== 'workday') continue;
    const taken = mine.filter((r) => (r.status === 'pending' || r.status === 'approved') && r.startDate <= d && r.endDate >= d).reduce((a, r) => a + unitOf(r.typeCode), 0);
    if (roundDays(taken + type.dayUnit) > 1) throw new ApiError(409, 'duplicate_request');
  }

  if (type.deductsBalance) {
    const all = await loadLeaveRequests({ employeeId: me.id });
    // 원장을 시작한 직원은 원장 잔여로 본다(2026-10-15). 아직이면 예전 계산(받은 연차 입력)
    const led = await ledgerFor(me.id, start, OFFICE.practiceMode);
    if (led) {
      const pending = all.filter((r) => r.status === 'pending' && types.find((x) => x.code === r.typeCode)?.deductsBalance).reduce((a, r) => a + r.days, 0);
      if (roundDays(led.remainingDays - pending - days) < -led.advanceMaxDays) throw new ApiError(409, 'insufficient_balance');
    } else {
      const bal = calcLeaveBalance({ grants: await loadLeaveGrants(me.id), requests: all, types, asOf: start });
      if (!bal.grant) throw new ApiError(409, 'no_grant');
      if (roundDays(bal.remaining - bal.pending - days) < 0) throw new ApiError(409, 'insufficient_balance');
    }
  }

  const { data, error } = await createAdminClient()
    .from('leave_requests')
    .insert({
      employee_id: me.id, type_code: type.code, start_date: start, end_date: end, days, reason: reason || null, start_time: win.startTime, end_time: win.endTime,
      status: 'pending', requested_by: me.id, is_test: OFFICE.practiceMode,
    })
    .select('id')
    .single();
  if (error) throw new Error(`leave.insert: ${error.code}`);
  return { id: data.id, days };
});
