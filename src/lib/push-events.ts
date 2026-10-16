// 폰 알림을 보내는 일 3가지 (2026-10-16 의뢰인: 휴가 신청 · 미출근자 · 정정 요청). 서버 전용.
// 요청 두 가지는 저장 API가 응답을 돌려준 뒤(after) 부르고, 출퇴근 알림(직원 본인 · 관리자)은 정기 작업 /api/cron/absent-watch가 부른다.
import 'server-only';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { fullLeaveSet } from '@/lib/leave';
import { findMissingPunches } from '@/lib/missing-punch';
import { leaveDaysFor, loadPeriod, workDaysFor } from '@/lib/period-data';
import { planPunchAlerts, type PersonMisses } from '@/lib/punch-alerts';
import { firstTime, notifyApprovers, pushConfigured, sendPush } from '@/lib/push';
import { approverIdsFor } from '@/lib/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

async function nameOf(employeeId: string): Promise<string> {
  const { data } = await createAdminClient().from('profiles').select('name').eq('id', employeeId).maybeSingle();
  return (data?.name as string | undefined) ?? '직원';
}

export async function notifyLeaveRequest(id: string): Promise<void> {
  if (!pushConfigured()) return;
  const db = createAdminClient();
  const { data: r } = await db.from('leave_requests').select('employee_id, type_code, start_date, end_date, days, start_time').eq('id', id).maybeSingle();
  if (!r) return;
  const { data: type } = await db.from('leave_types').select('name').eq('code', r.type_code).maybeSingle();
  const span = r.start_date === r.end_date ? md(r.start_date) : `${md(r.start_date)}~${md(r.end_date)}`;
  await notifyApprovers(r.employee_id, {
    title: `${await nameOf(r.employee_id)} 님이 휴가를 신청했습니다`,
    body: `${(type?.name as string | undefined) ?? r.type_code} · ${span}${r.start_time ? ` ${String(r.start_time).slice(0, 5)}` : ''} (${Number(r.days)}일)`,
    url: `/admin/inbox?k=leave&id=${id}`,
    tag: `leave-${id}`,
  });
}

export async function notifyCorrectionRequest(id: string): Promise<void> {
  if (!pushConfigured()) return;
  const { data: r } = await createAdminClient().from('punch_corrections').select('employee_id, correction_type, work_date, kind, reason').eq('id', id).maybeSingle();
  if (!r) return;
  const what = r.correction_type === 'add_missing' ? '빠진 기록 추가' : r.correction_type === 'void' ? '기록 지우기' : '시각 고치기';
  await notifyApprovers(r.employee_id, {
    title: `${await nameOf(r.employee_id)} 님이 출퇴근 정정을 요청했습니다`,
    body: `${md(r.work_date)} ${r.kind === 'in' ? '출근' : '퇴근'} · ${what} — ${String(r.reason).slice(0, 60)}`,
    url: `/admin/inbox?k=corrections&id=${id}`,
    tag: `correction-${id}`,
  });
}

/**
 * 출퇴근 폰 알림 (2026-10-16 의뢰인: 직원 본인 미출근 · 미퇴근 + 관리자 전일 미기록 묶음) — 정기 작업 /api/cron/absent-watch가 부른다.
 * 판정은 관리자 홈 · 「출근/퇴근 누락」 화면과 같은 findMissingPunches(근무 시작 + 30분 출근 없음 / 퇴근 + 2시간 퇴근 없음,
 * 하루 휴가 · 승인된 외근 · 간주 근무 · 입사 전은 빼고). 무엇을 누구에게 보낼지는 lib/punch-alerts.ts planPunchAlerts.
 * 같은 알림은 한 번만(push_sent). 연습 모드에서는 보내지 않는다(연습 기간엔 모두 미출근으로 보여 알림이 쏟아진다).
 */
export async function notifyPunchAlerts(now = new Date()): Promise<{ checked: number; planned: number; sent: number }> {
  if (!pushConfigured() || OFFICE.practiceMode) return { checked: 0, planned: 0, sent: 0 };
  const today = toKstDate(now);
  const yesterday = addDays(today, -1);
  const data = await loadPeriod(addDays(today, -2), today, false);
  if (!data.rule) return { checked: 0, planned: 0, sent: 0 };
  const dayType = (d: string) => (data.ruleAt(d) ? resolveDayType(d, data.ruleAt(d)!, data.holidays) : 'workday');
  const dayTypes = { [yesterday]: dayType(yesterday), [today]: dayType(today) };
  // 아직 가입하지 않은 직원(비밀번호도 폰 등록도 없음)은 이 앱으로 찍을 수 없으니 뺀다 —
  // 운영 전환 직후 링크를 돌리는 며칠 동안 미가입자 미출근 알림이 쏟아지지 않게 (2026-10-17 운영 전환 준비)
  const db = createAdminClient();
  const [{ data: pw }, { data: keys }] = await Promise.all([
    db.from('profiles').select('id').not('password_set_at', 'is', null),
    db.from('user_passkeys').select('employee_id').is('revoked_at', null),
  ]);
  const joined = new Set([...(pw ?? []).map((x) => x.id), ...(keys ?? []).map((x) => x.employee_id)]);
  const people: PersonMisses[] = [];
  for (const p of data.people.filter((x) => x.active && joined.has(x.id) && !x.employeeNo?.startsWith('e2e-'))) {
    if (data.templateOf(p.id)?.kind === 'deemed') continue;
    const rule = data.ruleFor(p.id, today) ?? data.rule;
    const misses = findMissingPunches({
      employeeId: p.id, events: data.events.filter((e) => e.employeeId === p.id),
      approvedCorrections: data.corrections.filter((c) => c.status === 'approved'),
      pendingCorrections: data.corrections.filter((c) => c.status === 'pending'),
      rule, dayTypes, now,
      outGraceHours: OFFICE.missingOutGraceHours, inGraceMin: OFFICE.missingInGraceMin, joinedOn: p.startsOn,
      fullLeaveDates: new Set([...fullLeaveSet(leaveDaysFor(data, p.id)), ...workDaysFor(data, p.id).keys()]),
      lookbackDays: 2, includeToday: true,
    });
    people.push({ id: p.id, name: p.name, startTime: rule.startTime.slice(0, 5), endTime: rule.endTime.slice(0, 5), misses });
  }
  const approvers = new Map<string, string[]>();
  for (const p of people.filter((x) => x.misses.length > 0)) approvers.set(p.id, await approverIdsFor(p.id));
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(now));
  const plan = planPunchAlerts({ people, today, yesterday, hour, approversOf: (id) => approvers.get(id) ?? [] });
  let sent = 0;
  for (const a of plan) {
    if (!(await firstTime(a.key))) continue;
    sent += await sendPush(a.to, a.payload);
  }
  // 30일 지난 「보냄」 표시는 지운다
  await db.from('push_sent').delete().lt('sent_at', new Date(now.getTime() - 30 * 86_400_000).toISOString());
  return { checked: people.length, planned: plan.length, sent };
}
