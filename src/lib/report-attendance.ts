// 부서/전사 근태 리포트 (PRD v1.3 35.4, A21). 서버 전용 — 관리자만 부른다.
// ★ 화면과 내려받기가 이 함수 하나를 쓴다 → 같은 조건이면 같은 숫자다.
// ★ 마감한 직원의 숫자는 「확정」, 마감하지 않은 직원의 숫자는 「잠정」이다. 섞인 합계에는 잠정이 몇 명인지 같이 적는다.
// ★ 소속은 기본으로 「그 달 마지막 날의 소속」(소속 이력)으로 묶는다. 이력이 없는 직원은 지금 소속으로 본다(이력은 2026-10-13부터 쌓였다). basis='current'면 전부 지금 소속.
// ★ 근태 리포트에는 금액이 없다.
import 'server-only';
import ExcelJS from 'exceljs';
import { OFFICE } from '@/config/office';
import { summarizeAnomalies } from '@/lib/anomaly';
import { collectAnomalies, loadAnomalyPolicy, loadAnomalyReviews } from '@/lib/anomaly-data';
import { loadCloseBoard } from '@/lib/close-data';
import { summarizeMonth } from '@/lib/monthly';
import { groupScope, type OrgGroup } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, leaveDaysFor, workDaysFor } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export type AttSum = { people: number; closed: number; netMinutes: number; payableMinutes: number; regularMinutes: number; overtimeMinutes: number; nightMinutes: number; holidayMinutes: number; lateCount: number; absentDays: number; paidLeaveDays: number; unpaidLeaveDays: number; anomalyBlock: number; anomalyCheck: number; pending: number; unconfirmedDays: number };
export type AttEmp = AttSum & { employeeId: string; name: string; employeeNo: string | null; groupId: string | null; isClosed: boolean };
export type AttGroup = AttSum & { groupId: string | null; name: string };
export type AttReport = { month: string; practice: boolean; basis: 'at_month_end' | 'current'; groupId: string | null; employees: AttEmp[]; groups: AttGroup[]; total: AttSum; generatedAt: string };

const zero = (): AttSum => ({ people: 0, closed: 0, netMinutes: 0, payableMinutes: 0, regularMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, lateCount: 0, absentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, anomalyBlock: 0, anomalyCheck: 0, pending: 0, unconfirmedDays: 0 });
const KEYS = Object.keys(zero()) as (keyof AttSum)[];
const addTo = (a: AttSum, b: AttSum) => { for (const k of KEYS) a[k] += b[k]; };

export async function buildAttendanceDeptReport(args: { ym: string; practice: boolean; groupId: string | null; basis: 'at_month_end' | 'current' }): Promise<AttReport> {
  const [{ lines, data, from, last }, groups, policy, { data: hist }] = await Promise.all([
    loadCloseBoard(args.ym, args.practice),
    loadOrgGroups(),
    loadAnomalyPolicy(),
    createAdminClient().from('staff_assignment_history').select('employee_id, group_id, valid_from, valid_to').eq('active', true),
  ]);
  const anomalies = summarizeAnomalies(collectAnomalies(data, from, last), policy.policy, new Set((await loadAnomalyReviews(from, last, args.practice)).keys())).byEmployee;
  const now = new Date();
  const today = toKstDate(now);
  const upTo = today < last ? today : last;
  // 그 달 마지막 날의 소속 (이력이 그 날을 덮는 줄이 있으면 그것, 없으면 지금 소속)
  const groupAt = (id: string, current: string | null) => {
    if (args.basis === 'current') return current;
    const h = (hist ?? []).find((x) => x.employee_id === id && (x.valid_from as string) <= last && (x.valid_to === null || (x.valid_to as string) > last));
    return h ? (h.group_id as string | null) : current;
  };
  const scope = args.groupId ? groupScope(groups, args.groupId) : null;
  const employees: AttEmp[] = [];
  for (const l of lines) {
    const gid = groupAt(l.employeeId, l.groupId);
    if (scope && !(gid && scope.has(gid))) continue;
    const p = data.people.find((x) => x.id === l.employeeId);
    const row: AttEmp = { ...zero(), employeeId: l.employeeId, name: l.name, employeeNo: l.employeeNo, groupId: gid, isClosed: !!l.close, people: 1, closed: l.close ? 1 : 0 };
    if (data.rule && upTo >= from) {
      const s = summarizeMonth({
        employeeNo: l.employeeNo, name: l.name, yearMonth: args.ym, days: daysFor(data, l.employeeId, from, upTo),
        requests: data.overtime.filter((o) => o.employeeId === l.employeeId).map((o) => ({ ...o })),
        pendingCorrections: l.review.pending.correction, rule: data.ruleFor(l.employeeId, last) ?? data.rule, ruleAt: (d) => data.ruleFor(l.employeeId, d), joinedOn: p?.startsOn ?? null, now, today,
        thresholdMinutes: OFFICE.overtimeReviewThresholdMin, leave: leaveDaysFor(data, l.employeeId), work: workDaysFor(data, l.employeeId),
      });
      const n = (k: keyof typeof s.row) => Number(s.row[k] ?? 0);
      Object.assign(row, {
        netMinutes: s.netMinutes, payableMinutes: s.payableMinutes, regularMinutes: n('regular_minutes'), overtimeMinutes: n('approved_overtime_minutes'), nightMinutes: n('approved_night_minutes'),
        holidayMinutes: n('approved_holiday_within8_minutes') + n('approved_holiday_over8_minutes'), lateCount: n('late_count'), absentDays: n('absent_days'), paidLeaveDays: s.paidLeaveDays, unpaidLeaveDays: n('unpaid_leave_days'),
      });
    }
    const a = anomalies.get(l.employeeId);
    row.anomalyBlock = a?.block ?? 0;
    row.anomalyCheck = a?.check ?? 0;
    row.pending = l.review.pendingTotal;
    row.unconfirmedDays = l.review.unconfirmed.length;
    employees.push(row);
  }
  employees.sort((a, b) => a.name.localeCompare(b.name));
  // 부서(맨 위 그룹)로 묶는다. 팀 소속은 그 부서에 더한다
  const top = (g: OrgGroup | undefined): OrgGroup | undefined => (g?.parentId ? groups.find((x) => x.id === g.parentId) : g);
  const by = new Map<string, AttGroup>();
  const total = zero();
  for (const e of employees) {
    const g = top(groups.find((x) => x.id === e.groupId));
    const key = g?.id ?? '';
    if (!by.has(key)) by.set(key, { ...zero(), groupId: g?.id ?? null, name: g?.name ?? '' });
    addTo(by.get(key)!, e);
    addTo(total, e);
  }
  return { month: args.ym, practice: args.practice, basis: args.basis, groupId: args.groupId, employees, groups: [...by.values()].sort((a, b) => (a.groupId === null ? 1 : b.groupId === null ? -1 : a.name.localeCompare(b.name))), total, generatedAt: now.toISOString() };
}

const FONT = 'Malgun Gothic';
const HEAD: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const safe = (v: string | number | null) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
const hours = (m: number) => Math.round((m / 60) * 100) / 100;

/** 리포트 → 엑셀. 화면과 같은 리포트 값을 그대로 적는다(여기서 다시 계산하지 않는다) */
export function attendanceReportWorkbook(r: AttReport, args: { company: string; by: string; groupName: string; unassigned: string }): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = args.company;
  const cols = ['대상(명)', '마감(명)', '실제(시간)', '급여용(시간)', '소정(시간)', '인정 연장(시간)', '인정 야간(시간)', '인정 휴일(시간)', '지각(회)', '결근(일)', '유급휴가(일)', '무급휴가(일)', '이상-차단(일)', '이상-확인(일)', '대기 요청(건)', '미확정(일)'];
  const vals = (s: AttSum) => [s.people, s.closed, hours(s.netMinutes), hours(s.payableMinutes), hours(s.regularMinutes), hours(s.overtimeMinutes), hours(s.nightMinutes), hours(s.holidayMinutes), s.lateCount, s.absentDays, s.paidLeaveDays, s.unpaidLeaveDays, s.anomalyBlock, s.anomalyCheck, s.pending, s.unconfirmedDays];
  const banner = `${args.company} · ${r.month} 근태 리포트 · ${r.total.closed === r.total.people && r.total.people > 0 ? '확정(전원 마감)' : `잠정 ${r.total.people - r.total.closed}명 포함`}`;
  const sheet = (name: string, lead: string[], rows: (string | number | null)[][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] });
    const head = [...lead, ...cols];
    ws.columns = head.map((_, i) => ({ width: i < lead.length ? 18 : 13 }));
    ws.mergeCells(1, 1, 1, head.length);
    ws.getCell(1, 1).value = banner;
    ws.getCell(1, 1).font = { name: FONT, size: 10, bold: true };
    head.forEach((h, i) => {
      const c = ws.getRow(2).getCell(i + 1);
      c.value = h;
      c.font = { name: FONT, size: 10, bold: true };
      c.fill = HEAD;
      c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    });
    rows.forEach((row, ri) => row.forEach((v, i) => {
      const c = ws.getRow(ri + 3).getCell(i + 1);
      c.value = safe(v);
      c.font = { name: FONT, size: 10 };
      if (typeof v === 'number') c.numFmt = '#,##0.##';
    }));
  };
  sheet('부서별', ['부서'], [...r.groups.map((g) => [g.groupId === null ? args.unassigned : g.name, ...vals(g)]), ['합계', ...vals(r.total)]]);
  sheet('직원별', ['사번', '이름', '마감'], r.employees.map((e) => [e.employeeNo ?? '', e.name, e.isClosed ? '확정' : '잠정', ...vals(e)]));
  const meta = wb.addWorksheet('메타');
  meta.columns = [{ width: 22 }, { width: 70 }];
  [
    ['귀속 달', r.month], ['부서 조건', args.groupName], ['소속 기준', r.basis === 'current' ? '지금 소속' : '그 달 마지막 날의 소속(이력이 없으면 지금 소속)'], ['기록', r.practice ? '연습' : '운영'],
    ['확정/잠정', `마감 ${r.total.closed}명 · 마감 전 ${r.total.people - r.total.closed}명`], ['생성 일시', r.generatedAt], ['내보낸 사람', args.by],
    ['안내', '마감한 직원의 값은 확정, 마감 전 직원의 값은 바뀔 수 있는 잠정치입니다. 연장 · 야간 · 휴일은 인정(승인)된 시간만 셉니다. 금액은 들어 있지 않습니다.'],
  ].forEach((row, i) => row.forEach((v, j) => { const c = meta.getRow(i + 1).getCell(j + 1); c.value = safe(v); c.font = { name: FONT, size: 10, bold: j === 0 }; c.alignment = { wrapText: true, vertical: 'top' }; }));
  return wb;
}
