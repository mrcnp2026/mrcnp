// 두 단계 승인 (결정 사항 권한-13, 2026-11-03 의뢰인). 서버 전용.
//   지점에 지점관리자가 있으면 그 지점 일반직원의 요청(휴가 · 정정 · 출퇴근 · 외근 · 일정 · 연장 · 휴가 변경)은
//   ① 지점관리자가 「승인」 → 1차 확인만 남기고(first_approvals) 최고관리자에게 「지점관리자 확인 완료」 알림
//   ② 최고관리자가 승인 · 거절 → 지금까지와 같은 결정 함수로 DB에 반영(최종).
//   지점관리자가 「거절」하면 그것으로 끝(최종 거절). 최고관리자는 1차 확인 전이라도 바로 처리할 수 있다.
//   지점관리자가 오래 확인하지 않으면 매일 아침 최고관리자에게 지연 알림(cron/first-approval-delay).
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { OFFICE } from '@/config/office';
import { firstTime, sendStaffPush } from '@/lib/push';
import { branchManagersFor, topApproversFor } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export const FIRST_TABLES = ['overtime_requests', 'punch_corrections', 'leave_requests', 'work_requests', 'punch_requests', 'shift_requests', 'leave_change_requests'] as const;
export type FirstTable = (typeof FIRST_TABLES)[number];
// 폰 알림 글 (다른 관리자 알림과 같이 한국어 고정 — push-events)
const KIND: Record<FirstTable, string> = {
  overtime_requests: '연장근로', punch_corrections: '출퇴근 정정', leave_requests: '휴가', work_requests: '외근 · 출장 · 재택',
  punch_requests: '출퇴근 요청', shift_requests: '근무일정 요청', leave_change_requests: '휴가 변경 · 취소',
};
/** 지점관리자가 이만큼 확인하지 않으면 최고관리자에게 알린다 */
export const FIRST_DELAY_HOURS = 24;

const nameOf = async (id: string) => ((await createAdminClient().from('profiles').select('name').eq('id', id).maybeSingle()).data?.name as string | undefined) ?? '';

/** 그 요청들의 1차 확인 (id → 누가 · 언제) */
export async function loadFirstApprovals(table: FirstTable, ids: string[]): Promise<Map<string, { by: string; at: string }>> {
  const out = new Map<string, { by: string; at: string }>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await createAdminClient().from('first_approvals').select('subject_id, approved_by, created_at').eq('subject_table', table).in('subject_id', ids.slice(i, i + 300));
    if (error) throw new Error(`loadFirstApprovals: ${error.code}`);
    for (const r of data ?? []) out.set(r.subject_id as string, { by: r.approved_by as string, at: r.created_at as string });
  }
  return out;
}

/**
 * 결정 API 맨 앞에서 부른다. 지점관리자의 「승인」이면 1차 확인만 남기고 결과를 돌려준다(호출한 쪽은 그대로 돌려주고 끝).
 * 그 밖(최고관리자 · 지점관리자의 거절)은 null — 원래 결정을 이어서 한다.
 */
export async function firstGate(me: Me, table: FirstTable, id: string, employeeId: string, decision: string): Promise<{ result: 'first_ok' | 'already' } | null> {
  if (me.role !== 'manager' || decision !== 'approved') return null;
  const db = createAdminClient();
  const { data: cur } = await db.from(table).select('status').eq('id', id).maybeSingle();
  if (!cur || cur.status !== 'pending') return { result: 'already' }; // 그사이 최고관리자가 처리했다
  const { error } = await db.from('first_approvals').insert({ subject_table: table, subject_id: id, employee_id: employeeId, approved_by: me.id, is_test: OFFICE.practiceMode });
  if (error?.code === '23505') return { result: 'already' }; // 다른 지점관리자가 먼저 확인했다
  if (error) throw new ApiError(500, 'internal');
  // 최고관리자에게 — 켜 둔 사람만(알림-9, sendStaffPush가 거른다)
  const [who, mgr] = await Promise.all([nameOf(employeeId), nameOf(me.id)]);
  await sendStaffPush(await topApproversFor(employeeId), { title: `[지점관리자 확인 완료] ${who} ${KIND[table]}`, body: `${mgr} 지점관리자가 확인했습니다. 최종 승인해 주세요.`, url: '/admin/inbox', tag: `first-${table}-${id}` }).catch(() => 0);
  return { result: 'first_ok' };
}

/** 새 요청 알림을 받을 사람 — 맡은 지점관리자가 있으면 그 사람만, 없으면 최고관리자 */
export async function newRequestRecipients(employeeId: string): Promise<{ ids: string[]; staged: boolean }> {
  const managers = await branchManagersFor(employeeId);
  if (managers.length) return { ids: managers, staged: true };
  return { ids: await topApproversFor(employeeId), staged: false };
}

/** 지연 알림 (매일 아침) — 지점관리자가 FIRST_DELAY_HOURS 넘게 확인하지 않은 대기 요청을 최고관리자에게. 같은 요청은 한 번만 */
export async function notifyFirstDelays(now = new Date()): Promise<number> {
  const db = createAdminClient();
  const before = new Date(now.getTime() - FIRST_DELAY_HOURS * 3600_000).toISOString();
  const late: { table: FirstTable; id: string; employeeId: string; at: string }[] = [];
  for (const table of FIRST_TABLES) {
    const { data } = await db.from(table).select('id, employee_id, created_at').eq('status', 'pending').eq('is_test', OFFICE.practiceMode).lt('created_at', before);
    const rows = (data ?? []) as { id: string; employee_id: string; created_at: string }[];
    const done = await loadFirstApprovals(table, rows.map((r) => r.id));
    for (const r of rows) if (!done.has(r.id)) late.push({ table, id: r.id, employeeId: r.employee_id, at: r.created_at });
  }
  // 맡은 지점관리자가 있는 직원 것만 (없으면 처음부터 최고관리자에게 갔다)
  const byEmployee = new Map<string, typeof late>();
  for (const x of late) if ((await branchManagersFor(x.employeeId)).length) byEmployee.set(x.employeeId, [...(byEmployee.get(x.employeeId) ?? []), x]);
  let sent = 0;
  for (const [employeeId, items] of byEmployee) {
    const fresh: typeof items = [];
    for (const x of items) if (await firstTime(`first-delay:${x.table}:${x.id}`)) fresh.push(x);
    if (!fresh.length) continue;
    const who = await nameOf(employeeId);
    const days = Math.max(1, Math.floor((now.getTime() - Math.min(...fresh.map((x) => Date.parse(x.at)))) / 86_400_000));
    const kinds = [...new Set(fresh.map((x) => KIND[x.table]))].join(' · ');
    sent += await sendStaffPush(await topApproversFor(employeeId), { title: `[지점관리자 확인 지연] ${who} ${kinds}`, body: `${fresh.length}건이 ${days}일째 지점관리자 확인을 기다리고 있습니다.`, url: '/admin/inbox', tag: `first-delay-${employeeId}` }).catch(() => 0);
  }
  return sent;
}
