// 외국인 직원 체류 기간 알림 (묶음 31, 2026-10-20 의뢰인) — 끝나기 60일 · 30일 전, 지났을 때 관리자 폰으로 한 번씩.
// 매일 09시 5분 작업(anomaly-overdue)에 붙여 돈다 — 새 예약 작업을 늘리지 않는다. 같은 사람 · 같은 끝나는 날 · 같은 단계는 한 번만.
import 'server-only';
import { OFFICE } from '@/config/office';
import { daysToStayEnd, STAY_ALERT_DAYS } from '@/lib/foreign-rules';
import { firstTime, pushConfigured, sendStaffPush } from '@/lib/push';
import { loadForeignStaff } from '@/lib/staff-details';
import { createAdminClient } from '@/lib/supabase/admin';
import { switchOn } from '@/lib/switches';
import { toKstDate } from '@/lib/time';

/** 오늘 알릴 단계: 지남(0) · 30일 · 60일 중 가장 급한 것. 60일보다 많이 남았으면 null */
export function stayStage(left: number | null): number | null {
  if (left === null) return null;
  if (left < 0) return 0;
  const hit = [...STAY_ALERT_DAYS].sort((a, b) => a - b).find((d) => left <= d);
  return hit ?? null;
}

export async function notifyStayEnding(now = new Date()): Promise<{ due: number; sent: number }> {
  const none = { due: 0, sent: 0 };
  if (!pushConfigured() || OFFICE.practiceMode || !(await switchOn('notify.push'))) return none;
  const today = toKstDate(now);
  const staff = await loadForeignStaff();
  const db = createAdminClient();
  const { data: people } = await db.from('profiles').select('id, name, active, employee_no, role').in('id', staff.map((s) => s.id).concat(['00000000-0000-0000-0000-000000000000']));
  const alive = new Map((people ?? []).filter((p) => p.active && !p.employee_no?.startsWith('e2e-')).map((p) => [p.id as string, p.name as string]));
  // 체류 기간 끝 · 체류자격외 활동허가 만료(60 · 30일 전 · 지남) · 출입국 방문 예약(3일 전 · 당일) — 묶음 32
  const due: { id: string; name: string; left: number; until: string; what: 'stay' | 'permit' | 'visit' }[] = [];
  for (const s of staff) {
    const name = alive.get(s.id);
    if (!name) continue;
    for (const [what, date] of [['stay', s.stayUntil], ['permit', s.activityPermitUntil ?? null]] as const) {
      const left = daysToStayEnd(date, today);
      const stage = stayStage(left);
      if (stage === null || !date) continue;
      if (!(await firstTime(`${what === 'stay' ? 'stay-end' : 'permit-end'}:${s.id}:${date}:${stage}`))) continue;
      due.push({ id: s.id, name, left: left!, until: date, what });
    }
    const v = daysToStayEnd(s.immigrationVisitOn ?? null, today);
    const vStage = v === null ? null : v === 0 ? 0 : v > 0 && v <= 3 ? 3 : null;
    if (vStage !== null && (await firstTime(`visit:${s.id}:${s.immigrationVisitOn}:${vStage}`))) due.push({ id: s.id, name, left: v!, until: s.immigrationVisitOn!, what: 'visit' });
  }
  if (!due.length) return none;
  const { data: admins } = await db.from('profiles').select('id, employee_no').eq('role', 'admin').eq('active', true);
  const to = (admins ?? []).filter((a) => !a.employee_no?.startsWith('e2e-')).map((a) => a.id as string);
  let sent = 0;
  for (const d of due) {
    sent += await sendStaffPush(to, { // 알림-9
      title: d.what === 'visit' ? (d.left === 0 ? `${d.name} 님 오늘 출입국 방문 예약` : `${d.name} 님 출입국 방문 예약 ${d.left}일 남음`) : d.left < 0 ? `${d.name} 님 ${d.what === 'stay' ? '체류 기간' : '활동허가'}이 지났습니다` : `${d.name} 님 ${d.what === 'stay' ? '체류 기간' : '활동허가'} ${d.left}일 남음`,
      body: d.what === 'visit' ? `예약일 ${d.until} — 서류를 챙겨 주세요` : `${d.what === 'stay' ? '체류 기간 끝' : '체류자격외 활동허가 만료'} ${d.until} — 연장 · 변경 신청을 확인해 주세요`,
      url: `/admin/members/${d.id}#foreign`,
      tag: `${d.what}-end-${d.id}`,
    }).catch(() => 0);
  }
  return { due: due.length, sent };
}
