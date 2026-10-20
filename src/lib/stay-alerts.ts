// 외국인 직원 체류 기간 알림 (묶음 31, 2026-10-20 의뢰인) — 끝나기 60일 · 30일 전, 지났을 때 관리자 폰으로 한 번씩.
// 매일 09시 5분 작업(anomaly-overdue)에 붙여 돈다 — 새 예약 작업을 늘리지 않는다. 같은 사람 · 같은 끝나는 날 · 같은 단계는 한 번만.
import 'server-only';
import { OFFICE } from '@/config/office';
import { daysToStayEnd, STAY_ALERT_DAYS } from '@/lib/foreign-rules';
import { firstTime, pushConfigured, sendPush } from '@/lib/push';
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
  const due: { id: string; name: string; left: number; until: string }[] = [];
  for (const s of staff) {
    const name = alive.get(s.id);
    const left = daysToStayEnd(s.stayUntil, today);
    const stage = stayStage(left);
    if (!name || stage === null || !s.stayUntil) continue;
    if (!(await firstTime(`stay-end:${s.id}:${s.stayUntil}:${stage}`))) continue;
    due.push({ id: s.id, name, left: left!, until: s.stayUntil });
  }
  if (!due.length) return none;
  const { data: admins } = await db.from('profiles').select('id, employee_no').eq('role', 'admin').eq('active', true);
  const to = (admins ?? []).filter((a) => !a.employee_no?.startsWith('e2e-')).map((a) => a.id as string);
  let sent = 0;
  for (const d of due) {
    sent += await sendPush(to, {
      title: d.left < 0 ? `${d.name} 님 체류 기간이 지났습니다` : `${d.name} 님 체류 기간 ${d.left}일 남음`,
      body: `체류 기간 끝 ${d.until} — 연장 · 변경 신청을 확인해 주세요`,
      url: `/admin/members/${d.id}#foreign`,
      tag: `stay-end-${d.id}`,
    }).catch(() => 0);
  }
  return { due: due.length, sent };
}
