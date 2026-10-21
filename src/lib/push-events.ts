// 폰 알림을 보내는 일 (2026-10-16 의뢰인: 휴가 신청 · 미출근자 · 정정 요청 / 2026-10-19: 매주 미처리 요청 다시 알림). 서버 전용.
// 요청 두 가지는 저장 API가 응답을 돌려준 뒤(after) 부르고, 출퇴근 알림(직원 본인 · 관리자)은 정기 작업 /api/cron/absent-watch가 부른다.
// 2026-10-21 의뢰인: 외근 · 출장 · 재택 신청을 바로 알림 · 지각 · 조퇴를 찍는 순간 관리자에게 · 승인 · 거절 결과를 직원 본인에게 (결정 사항 알림-10 ~ 12).
// 관리자에게 가는 알림은 받는 사람을 알림-9 규칙으로 거른다(lib/push-recipients.ts — notifyApprovers · sendStaffPush가 거친다).
import 'server-only';
import { resolveDayType } from '@/config/labor-rules';
import { collectAnomalies, loadAnomalyPolicy } from '@/lib/anomaly-data';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { fullLeaveSet } from '@/lib/leave';
import { findMissingPunches } from '@/lib/missing-punch';
import { hiddenTestIds, leaveDaysFor, loadPeriod, workDaysFor } from '@/lib/period-data';
import { planPunchAlerts, type PersonMisses } from '@/lib/punch-alerts';
import { firstTime, notifyApprovers, pushConfigured, sendPush } from '@/lib/push';
import { staffPushFilter } from '@/lib/push-recipients';
import { loadRejectReasons } from '@/lib/reject-reason';
import { approverIdsFor } from '@/lib/scope';
import { switchOn } from '@/lib/switches';
import { createAdminClient } from '@/lib/supabase/admin';
import { hhmm, toKstDate, toKstTime } from '@/lib/time';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

async function nameOf(employeeId: string): Promise<string> {
  const { data } = await createAdminClient().from('profiles').select('name').eq('id', employeeId).maybeSingle();
  return (data?.name as string | undefined) ?? '직원';
}

// 통합설정 › 알림의 「폰 알림」 스위치를 끄면 셋 다 보내지 않는다 (2026-10-19). 「시험 보내기」는 그대로 된다
const pushOn = async () => pushConfigured() && (await switchOn('notify.push'));

export async function notifyLeaveRequest(id: string): Promise<void> {
  if (!(await pushOn())) return;
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
  if (!(await pushOn())) return;
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

const WORK_LABEL: Record<string, string> = { outside: '외근', business_trip: '출장', remote: '재택' };

/** 외근 · 출장 · 재택 신청 — 승인할 관리자에게 바로 (알림-10). 직원이 출근 화면에서 바로 낸 「장소 밖 외근」도 같은 길이다 */
export async function notifyWorkRequest(id: string): Promise<void> {
  if (!(await pushOn())) return;
  const { data: r } = await createAdminClient().from('work_requests').select('employee_id, kind, start_date, end_date, start_time, end_time, place, reason, status').eq('id', id).maybeSingle();
  if (!r || r.status !== 'pending') return; // 관리자가 대신 넣어 바로 승인된 것은 알리지 않는다
  const span = r.start_date === r.end_date ? md(r.start_date) : `${md(r.start_date)}~${md(r.end_date)}`;
  const time = r.start_time && r.end_time ? ` ${String(r.start_time).slice(0, 5)}~${String(r.end_time).slice(0, 5)}` : '';
  const label = WORK_LABEL[r.kind as string] ?? '외근';
  await notifyApprovers(r.employee_id, {
    title: `${await nameOf(r.employee_id)} 님이 ${label}을 신청했습니다`,
    body: `${span}${time} · ${String(r.place ?? '').slice(0, 40)}${r.reason ? ` — ${String(r.reason).slice(0, 50)}` : ''}`,
    url: `/admin/inbox?k=work&id=${id}`,
    tag: `work-${id}`,
  });
}

/**
 * 지각 · 조퇴 — 출근 · 퇴근을 찍은 직후 승인할 관리자에게 (알림-11). 출퇴근 API가 응답을 돌려준 뒤(after) 부른다.
 * 판정은 「이상 기록」 화면과 같은 collectAnomalies(근무 시작 + 지각 유예 뒤 첫 출근 = 지각 / 근무 끝 전 마지막 퇴근 = 조퇴,
 * 휴가 · 승인된 외근 · 간주 근무는 빼고). 이상 기록 설정에서 그 유형을 「안 봄」으로 두면 보내지 않는다.
 * 최고관리자 · 시스템관리자는 보내지 않는다(출퇴근 알림과 같다). 같은 날 같은 종류는 한 번만. 연습 모드에서는 보내지 않는다.
 */
// ★ 2026-10-21 의뢰인(알림-13): 지각 · 조퇴 푸시는 보내지 않는다 — 관리자 홈 · 이상 기록 화면으로만. 다시 켜려면 LATE_EARLY_PUSH를 true로
const LATE_EARLY_PUSH = false;
export async function notifyLateEarly(employeeId: string, workDate: string, kind: 'in' | 'out', now = new Date()): Promise<void> {
  try {
    if (!LATE_EARLY_PUSH || !(await pushOn()) || OFFICE.practiceMode) return;
    const data = await loadPeriod(workDate, workDate, false);
    const p = data.people.find((x) => x.id === employeeId);
    if (!p || !p.active || p.role === 'admin' || p.employeeNo === OFFICE.ownerEmployeeNo || p.employeeNo?.startsWith('e2e-')) return;
    const type = kind === 'in' ? 'late' : 'early';
    const hit = collectAnomalies(data, workDate, workDate, now).find((x) => x.employeeId === employeeId)?.types.includes(type);
    if (!hit || (await loadAnomalyPolicy()).policy[type] === 'off') return;
    const plan = data.planFor(employeeId, workDate).rule;
    const mine = data.events.filter((e) => e.employeeId === employeeId && e.workDate === workDate && e.kind === kind).map((e) => e.punchedAt.getTime());
    if (!plan || mine.length === 0) return;
    const at = toKstTime(new Date(kind === 'in' ? Math.min(...mine) : Math.max(...mine))).slice(0, 5);
    const to = await staffPushFilter(await approverIdsFor(employeeId));
    if (to.length === 0 || !(await firstTime(`${type}:${employeeId}:${workDate}`))) return;
    await sendPush(to, {
      title: `${p.name} 님 ${kind === 'in' ? '지각 출근' : '조퇴'}`,
      body: kind === 'in' ? `${md(workDate)} 출근 ${at} · 근무 시작 ${hhmm(plan.startTime)}` : `${md(workDate)} 퇴근 ${at} · 근무 끝 ${hhmm(plan.endTime)}`,
      url: `/admin/anomalies?m=${workDate.slice(0, 7)}`,
      tag: `${type}-${employeeId}-${workDate}`,
    });
  } catch (e) {
    console.error(JSON.stringify({ route: 'push.lateEarly', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
  }
}

/** 승인 · 거절 결과를 알릴 요청 종류 — 표 이름 · 화면에 쓰는 이름 */
export const DECISION_KINDS = {
  leave_requests: '휴가 신청',
  punch_corrections: '출퇴근 정정 요청',
  overtime_requests: '연장근로',
  punch_requests: '출근 · 퇴근 요청',
  work_requests: '외근 · 출장 · 재택 신청',
  shift_requests: '근무일정 요청',
  leave_change_requests: '휴가 취소 요청',
} as const;
export type DecisionTable = keyof typeof DECISION_KINDS;
const DECIDED: Record<string, string> = { approved: '승인', rejected: '거절', cancelled: '취소' };
/** 받침이 있으면 「이」, 없으면 「가」 (연장근로가 · 휴가 신청이) */
const iGa = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? '이' : '가';
};

/**
 * 요청이 승인 · 거절 · 취소되면 요청한 직원 본인에게 (알림-12). 결정 API가 응답을 돌려준 뒤(after) 부른다.
 * 결정 뒤의 상태를 다시 읽어 실제로 바뀐 것만 보낸다(이미 처리된 요청 · 충돌로 그대로인 요청은 보내지 않는다). 같은 결정은 한 번만.
 * 본인이 자기 요청을 처리한 경우(최고관리자)는 보내지 않는다.
 */
export async function notifyDecision(table: DecisionTable, id: string): Promise<void> {
  try {
    if (!(await pushOn())) return;
    const db = createAdminClient();
    const { data: r } = await db.from(table).select('*').eq('id', id).maybeSingle();
    if (!r || !DECIDED[r.status as string]) return;
    const decidedBy = (r.approved_by ?? r.decided_by ?? null) as string | null;
    if (decidedBy && decidedBy === r.employee_id) return;
    const { data: who } = await db.from('profiles').select('employee_no').eq('id', r.employee_id).maybeSingle();
    if (who?.employee_no?.startsWith('e2e-')) return;
    if (!(await firstTime(`decided:${table}:${id}:${r.status}`))) return;
    const start = (r.work_date ?? r.start_date ?? null) as string | null;
    const end = (r.end_date ?? null) as string | null;
    const span = start ? (end && end !== start ? `${md(start)}~${md(end)}` : md(start)) : '';
    const what = DECISION_KINDS[table];
    const verdict = DECIDED[r.status as string];
    const why = r.status === 'rejected' ? ((await loadRejectReasons([{ table, id }])).get(`${table}:${id}`) ?? null) : null; // 관리자가 적은 거절 사유 (2026-10-21)
    await sendPush([r.employee_id as string], {
      title: `${what}${iGa(what)} ${verdict}되었습니다`,
      body: r.status === 'rejected' ? `${span ? `${span} · ` : ''}${why ? `사유: ${why.slice(0, 80)}` : '자세한 내용은 요청 목록에서 확인해 주세요.'} 필요하면 다시 요청해 주세요.` : `${span ? `${span} · ` : ''}요청 목록에서 확인할 수 있습니다.`,
      url: '/punch/requests?tab=done',
      tag: `decided-${table}-${id}`,
    });
  } catch (e) {
    console.error(JSON.stringify({ route: 'push.decision', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
  }
}

/**
 * 출퇴근 폰 알림 (2026-10-16 의뢰인: 직원 본인 미출근 · 미퇴근 + 관리자 전일 미기록 묶음) — 정기 작업 /api/cron/absent-watch가 부른다.
 * 판정은 관리자 홈 · 「출근/퇴근 누락」 화면과 같은 findMissingPunches(근무 시작 + 30분 출근 없음 / 퇴근 + 2시간 퇴근 없음,
 * 하루 휴가 · 승인된 외근 · 간주 근무 · 입사 전은 빼고). 무엇을 누구에게 보낼지는 lib/punch-alerts.ts planPunchAlerts.
 * 같은 알림은 한 번만(push_sent). 연습 모드에서는 보내지 않는다(연습 기간엔 모두 미출근으로 보여 알림이 쏟아진다).
 */
export async function notifyPunchAlerts(now = new Date()): Promise<{ checked: number; planned: number; sent: number }> {
  if (!(await pushOn()) || OFFICE.practiceMode) return { checked: 0, planned: 0, sent: 0 };
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
  // 최고관리자(관리자 전원, 권한-10) · 시스템관리자 · 간주근무자는 출퇴근 기록이 없어도 알림을 보내지 않는다 (2026-10-19 의뢰인)
  for (const p of data.people.filter((x) => x.active && joined.has(x.id) && !x.employeeNo?.startsWith('e2e-') && x.employeeNo !== OFFICE.ownerEmployeeNo && x.role !== 'admin')) {
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
    // 그날 일정이 간주 근무인 날도 뺀다
    people.push({ id: p.id, name: p.name, startTime: rule.startTime.slice(0, 5), endTime: rule.endTime.slice(0, 5), misses: misses.filter((m) => !data.planFor(p.id, m.workDate).deemed) });
  }
  const approvers = new Map<string, string[]>();
  // 받을 관리자는 알림-9 규칙으로 거른다 (이상준 최고관리자 항상 · 대표자 안 받음 · 나머지는 켠 사람만, 2026-10-21)
  for (const p of people.filter((x) => x.misses.length > 0)) approvers.set(p.id, await staffPushFilter(await approverIdsFor(p.id)));
  const [hour, minute] = toKstTime(now).slice(0, 5).split(':').map(Number);
  const plan = planPunchAlerts({ people, today, yesterday, hour, minute: hour * 60 + minute, approversOf: (id) => approvers.get(id) ?? [] });
  let sent = 0;
  for (const a of plan) {
    if (a.members && a.build) {
      // 묶음(오늘 미출근): 이미 알린 사람은 빼고, 새로 생긴 사람만 한 통으로
      const fresh: string[] = [];
      for (const m of a.members) if (await firstTime(m.key)) fresh.push(m.name);
      if (fresh.length > 0) sent += await sendPush(a.to, a.build(fresh));
      continue;
    }
    if (!(await firstTime(a.key))) continue;
    sent += await sendPush(a.to, a.payload);
  }
  // 30일 지난 「보냄」 표시는 지운다
  await db.from('push_sent').delete().lt('sent_at', new Date(now.getTime() - 30 * 86_400_000).toISOString());
  return { checked: people.length, planned: plan.length, sent };
}

/**
 * 매주 월요일 아침 — 아직 처리하지 않은 요청을 승인할 관리자에게 한 번 더 알린다 (2026-10-19 의뢰인: 알림을 받아도 잊을 수 있다).
 * 관리자마다 한 통: 「처리하지 않은 요청 5건」 · 「휴가 2 · 정정 1 · 연장근로 2 — 가장 오래된 것 9일 전」. 정기 작업 /api/cron/weekly-pending이 부른다.
 */
export async function notifyWeeklyPending(now = new Date()): Promise<{ approvers: number; sent: number }> {
  if (!(await pushOn()) || OFFICE.practiceMode) return { approvers: 0, sent: 0 };
  const db = createAdminClient();
  const hidden = new Set(await hiddenTestIds());
  const KINDS = [
    { table: 'leave_requests', label: '휴가' },
    { table: 'punch_corrections', label: '정정' },
    { table: 'overtime_requests', label: '연장근로' },
    { table: 'punch_requests', label: '출퇴근 요청' },
    { table: 'work_requests', label: '외근 · 출장' },
    { table: 'shift_requests', label: '일정' },
    { table: 'leave_change_requests', label: '휴가 취소' },
  ] as const;
  const rows = await Promise.all(KINDS.map(async (k) => {
    const { data, error } = await db.from(k.table).select('employee_id, created_at').eq('is_test', false).eq('status', 'pending');
    if (error) throw new Error(`weeklyPending.${k.table}: ${error.code}`);
    return (data ?? []).filter((r) => !hidden.has(r.employee_id as string)).map((r) => ({ label: k.label, employeeId: r.employee_id as string, at: r.created_at as string }));
  }));
  const items = rows.flat();
  const approvers = new Map<string, string[]>();
  for (const id of new Set(items.map((x) => x.employeeId))) approvers.set(id, await staffPushFilter(await approverIdsFor(id))); // 알림-9
  const per = new Map<string, { byKind: Map<string, number>; oldest: string }>();
  for (const it of items) {
    for (const a of approvers.get(it.employeeId) ?? []) {
      const p = per.get(a) ?? { byKind: new Map(), oldest: it.at };
      p.byKind.set(it.label, (p.byKind.get(it.label) ?? 0) + 1);
      if (it.at < p.oldest) p.oldest = it.at;
      per.set(a, p);
    }
  }
  const today = toKstDate(now);
  let sent = 0;
  for (const [a, p] of per) {
    if (!(await firstTime(`weekly:${a}:${today}`))) continue;
    const total = [...p.byKind.values()].reduce((x, y) => x + y, 0);
    const days = Math.max(0, Math.floor((now.getTime() - Date.parse(p.oldest)) / 86_400_000));
    const kinds = KINDS.map((k) => k.label).filter((l) => p.byKind.has(l)).map((l) => `${l} ${p.byKind.get(l)}`).join(' · ');
    sent += await sendPush([a], {
      title: `처리하지 않은 요청 ${total}건이 남아 있습니다`,
      body: `${kinds}${days > 0 ? ` — 가장 오래된 것 ${days}일 전` : ''}`,
      url: '/admin/inbox',
      tag: `weekly-pending-${today}`,
    });
  }
  return { approvers: per.size, sent };
}
