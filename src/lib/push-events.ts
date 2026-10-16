// 폰 알림을 보내는 일 3가지 (2026-10-16 의뢰인: 휴가 신청 · 미출근자 · 정정 요청). 서버 전용.
// 요청 두 가지는 저장 API가 응답을 돌려준 뒤(after) 부르고, 미출근은 정기 작업 /api/cron/absent-watch가 부른다.
import 'server-only';
import { resolveDayType } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { fullLeaveSet } from '@/lib/leave';
import { findMissingPunches } from '@/lib/missing-punch';
import { leaveDaysFor, loadPeriod, workDaysFor } from '@/lib/period-data';
import { firstTime, notifyApprovers, pushConfigured } from '@/lib/push';
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
 * 오늘 미출근 — 관리자 홈의 「출근 미기록」과 같은 판정(findMissingPunches: 근무 시작 + 30분이 지나도 출근 기록 없음,
 * 하루 휴가 · 승인된 외근 · 간주 근무 · 입사 전은 빼고). 한 사람에 하루 한 번만. 연습 모드에서는 보내지 않는다(연습 기간엔 모두 미출근으로 보여 알림이 쏟아진다).
 */
export async function notifyAbsentToday(now = new Date()): Promise<{ checked: number; sent: number }> {
  if (!pushConfigured() || OFFICE.practiceMode) return { checked: 0, sent: 0 };
  const today = toKstDate(now);
  const data = await loadPeriod(addDays(today, -1), today, false);
  if (!data.rule) return { checked: 0, sent: 0 };
  const dayTypes = { [today]: data.ruleAt(today) ? resolveDayType(today, data.ruleAt(today)!, data.holidays) : 'workday' } as const;
  let checked = 0;
  let sent = 0;
  for (const p of data.people.filter((x) => x.active && !x.employeeNo?.startsWith('e2e-'))) {
    if (data.templateOf(p.id)?.kind === 'deemed') continue;
    checked++;
    const miss = findMissingPunches({
      employeeId: p.id, events: data.events.filter((e) => e.employeeId === p.id),
      approvedCorrections: data.corrections.filter((c) => c.status === 'approved'),
      pendingCorrections: data.corrections.filter((c) => c.status === 'pending'),
      rule: data.ruleFor(p.id, today) ?? data.rule, dayTypes, now,
      outGraceHours: OFFICE.missingOutGraceHours, inGraceMin: OFFICE.missingInGraceMin, joinedOn: p.startsOn,
      fullLeaveDates: new Set([...fullLeaveSet(leaveDaysFor(data, p.id)), ...workDaysFor(data, p.id).keys()]),
      lookbackDays: 1,
    }).filter((m) => m.workDate === today && m.kind === 'in');
    if (miss.length === 0) continue;
    if (!(await firstTime(`absent:${p.id}:${today}`))) continue;
    const start = (data.ruleFor(p.id, today) ?? data.rule).startTime.slice(0, 5);
    await notifyApprovers(p.id, {
      title: `${p.name} 님이 아직 출근하지 않았습니다`,
      body: `오늘 ${md(today)} 근무 시작 ${start} · 출근 기록 없음${miss[0].hasPendingRequest ? ' (정정 요청 있음)' : ''}`,
      url: '/admin',
      tag: `absent-${p.id}-${today}`,
    });
    sent++;
  }
  // 30일 지난 「보냄」 표시는 지운다
  await createAdminClient().from('push_sent').delete().lt('sent_at', new Date(now.getTime() - 30 * 86_400_000).toISOString());
  return { checked, sent };
}
