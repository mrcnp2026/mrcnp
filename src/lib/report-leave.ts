// 부서/전사 휴가 리포트 (PRD v1.3 37.5, L22). 서버 전용 — 관리자만 부른다.
// ★ 화면과 내려받기가 이 함수 하나를 쓴다. 숫자는 휴가 원장(지급 건 · 원장 줄)의 합이다 — 직원 내역의 합과 같다.
// ★ 소진율 = 사용 ÷ 받은 연차 (기준일에 쓸 수 있는 지급 건 기준). 받은 연차가 0이면 「계산 불가」로 둔다(0%로 적지 않는다).
// ★ 선사용 · 소멸은 따로 적는다. 숨겨서 비율을 맞추지 않는다.
// ★ 원장을 시작하지 않은 직원(승인된 지급 건이 없음)은 숫자를 비워 두고, 예전 계산의 잔여만 참고로 적는다.
import 'server-only';
import { OFFICE } from '@/config/office';
import ExcelJS from 'exceljs';
import { calcLeaveBalance } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests } from '@/lib/leave-data';
import { entriesFor, ledgerBalance, minutesToDays } from '@/lib/leave-ledger';
import { loadEntries, loadLots, loadPolicyGroups } from '@/lib/leave-ledger-data';
import { groupScope, topOf, type OrgGroup } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';

export type LeaveSum = { people: number; started: number; granted: number; used: number; expired: number; remaining: number; advance: number; upcoming: number };
export type LeaveEmp = LeaveSum & { employeeId: string; name: string; employeeNo: string | null; groupId: string | null; active: boolean; joinedOn: string | null; isStarted: boolean; rate: number | null; old: number | null };
export type LeaveGroup = LeaveSum & { groupId: string | null; name: string; rate: number | null };
export type LeavePolicyGroupSum = LeaveSum & { groupId: string; name: string; excluded: boolean; isDefault: boolean; rate: number | null };
export type LeaveTypeUse = { code: string; name: string; requests: number; days: number; people: number };
export type LeaveReport = { asOf: string; practice: boolean; groupId: string | null; withInactive: boolean; employees: LeaveEmp[]; groups: LeaveGroup[]; total: LeaveSum & { rate: number | null }; generatedAt: string; policyGroups: LeavePolicyGroupSum[]; typeUse: LeaveTypeUse[]; yearFrom: string };

const zero = (): LeaveSum => ({ people: 0, started: 0, granted: 0, used: 0, expired: 0, remaining: 0, advance: 0, upcoming: 0 });
const KEYS = Object.keys(zero()) as (keyof LeaveSum)[];
const rateOf = (s: Pick<LeaveSum, 'granted' | 'used'>): number | null => (s.granted > 0 ? Math.round((s.used / s.granted) * 1000) / 10 : null); // 퍼센트, 소수 한 자리

export async function buildLeaveReport(args: { asOf: string; practice: boolean; groupId: string | null; withInactive: boolean }): Promise<LeaveReport> {
  const [lots, entries, groups, grants, requests, types, { data: staff }, pgroups] = await Promise.all([
    loadLots(), loadEntries(), loadOrgGroups(), loadLeaveGrants(), loadLeaveRequests({ practice: args.practice }), loadAllLeaveTypes(),
    createAdminClient().from('profiles').select('id, name, employee_no, group_id, joined_on, active').order('name'),
    loadPolicyGroups(args.asOf),
  ]);
  const shown = entriesFor(entries, args.practice);
  const scope = args.groupId ? groupScope(groups, args.groupId) : null;
  const d = (m: number) => minutesToDays(m);
  const employees: LeaveEmp[] = [];
  for (const p of staff ?? []) {
    if ((p.employee_no as string | null)?.startsWith('e2e-')) continue;
    if (p.employee_no === OFFICE.ownerEmployeeNo) continue; // 시스템관리자(admin)는 직원이 아니다 (2026-10-17)
    if (!p.active && !args.withInactive) continue;
    if (scope && !(p.group_id && scope.has(p.group_id as string))) continue;
    const mine = lots.filter((l) => l.employeeId === p.id);
    const isStarted = mine.some((l) => l.state === 'APPROVED');
    const b = ledgerBalance(mine, shown.filter((e) => e.employeeId === p.id), args.asOf);
    const old = calcLeaveBalance({ grants: grants.filter((g) => g.employeeId === p.id), requests: requests.filter((r) => r.employeeId === p.id), types, asOf: args.asOf });
    const row = { people: 1, started: isStarted ? 1 : 0, granted: isStarted ? d(b.granted) : 0, used: isStarted ? d(b.used) : 0, expired: isStarted ? d(b.expired) : 0, remaining: isStarted ? d(b.remaining) : 0, advance: isStarted ? d(b.advance) : 0, upcoming: isStarted ? d(b.upcoming) : 0 };
    employees.push({ ...row, employeeId: p.id as string, name: p.name as string, employeeNo: p.employee_no as string | null, groupId: p.group_id as string | null, active: p.active as boolean, joinedOn: p.joined_on as string | null, isStarted, rate: isStarted ? rateOf(row) : null, old: old.grant ? old.remaining : null });
  }
  const top = (g: OrgGroup | undefined): OrgGroup | undefined => topOf(groups, g?.id); // 맨 위 조직 (3단계여도)
  const by = new Map<string, LeaveSum & { groupId: string | null; name: string }>();
  const total = zero();
  const round = (s: LeaveSum) => { for (const k of KEYS) s[k] = Math.round(s[k] * 10000) / 10000; };
  for (const e of employees) {
    const g = top(groups.find((x) => x.id === e.groupId));
    const key = g?.id ?? '';
    if (!by.has(key)) by.set(key, { ...zero(), groupId: g?.id ?? null, name: g?.name ?? '' });
    for (const k of KEYS) { by.get(key)![k] += e[k]; total[k] += e[k]; }
  }
  round(total);
  const outGroups = [...by.values()].map((g) => { round(g); return { ...g, rate: rateOf(g) }; }).sort((a, b) => (a.groupId === null ? 1 : b.groupId === null ? -1 : a.name.localeCompare(b.name)));
  // 휴가 정책 그룹별 (L22 · 37.5, 2026-10-15): 기준일의 소속. 그룹에 넣지 않은 직원은 기본 그룹
  const def = pgroups.find((g) => g.isDefault);
  const memberOf = new Map(pgroups.filter((g) => !g.isDefault).flatMap((g) => g.members.map((m) => [m.employeeId, g.id] as const)));
  const pg = new Map(pgroups.map((g) => [g.id, { ...zero(), groupId: g.id, name: g.name, excluded: g.excluded, isDefault: g.isDefault }]));
  for (const e of employees) {
    const gid = memberOf.get(e.employeeId) ?? def?.id;
    const sum = gid ? pg.get(gid) : undefined;
    if (sum) for (const k of KEYS) sum[k] += e[k];
  }
  const policyGroups = [...pg.values()].map((g) => { round(g); return { ...g, rate: rateOf(g) }; });
  // 휴가 종류별 사용: 기준일이 든 해의 1월 1일 ~ 기준일에 시작한 승인 휴가 (연차 밖 종류도 — 원장은 연차만 센다)
  const yearFrom = `${args.asOf.slice(0, 4)}-01-01`;
  const inScope = new Set(employees.map((e) => e.employeeId));
  const use = new Map<string, { requests: number; days: number; people: Set<string> }>();
  for (const q of requests) {
    if (q.status !== 'approved' || q.startDate < yearFrom || q.startDate > args.asOf || !inScope.has(q.employeeId)) continue;
    const u = use.get(q.typeCode) ?? use.set(q.typeCode, { requests: 0, days: 0, people: new Set() }).get(q.typeCode)!;
    u.requests++;
    u.days += q.days;
    u.people.add(q.employeeId);
  }
  const typeUse = [...use].map(([code, u]) => ({ code, name: types.find((x) => x.code === code)?.name ?? code, requests: u.requests, days: Math.round(u.days * 10000) / 10000, people: u.people.size })).sort((a, b) => b.days - a.days);
  return { asOf: args.asOf, practice: args.practice, groupId: args.groupId, withInactive: args.withInactive, employees, groups: outGroups, total: { ...total, rate: rateOf(total) }, generatedAt: new Date().toISOString(), policyGroups, typeUse, yearFrom };
}

const FONT = 'Malgun Gothic';
const HEAD: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const safe = (v: string | number | null) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

export function leaveReportWorkbook(r: LeaveReport, args: { company: string; by: string; groupName: string; unassigned: string }): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = args.company;
  const cols = ['대상(명)', '원장 시작(명)', '받은 연차(일)', '사용(일)', '소멸(일)', '잔여(일)', '선사용(일)', '시작 전(일)', '소진율(%)'];
  const vals = (s: LeaveSum & { rate: number | null }) => [s.people, s.started, s.granted, s.used, s.expired, s.remaining, s.advance, s.upcoming, s.rate === null ? '계산 불가' : s.rate];
  const banner = `${args.company} · 휴가 리포트 · 기준일 ${r.asOf}`;
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
      if (typeof v === 'number') c.numFmt = '#,##0.####';
    }));
  };
  sheet('부서별', ['부서'], [...r.groups.map((g) => [g.groupId === null ? args.unassigned : g.name, ...vals(g)]), ['합계', ...vals(r.total)]]);
  sheet('직원별', ['사번', '이름', '입사일', '재직', '예전 계산 잔여(일)'], r.employees.map((e) => [e.employeeNo ?? '', e.name, e.joinedOn ?? '', e.active ? '재직' : '퇴사', e.old, ...(e.isStarted ? vals(e) : [1, 0, null, null, null, null, null, null, '원장 시작 전'])]));
  sheet('정책그룹별', ['휴가 정책 그룹'], r.policyGroups.map((g) => [`${g.name}${g.excluded ? ' (생성 제외)' : ''}`, ...vals(g)]));
  {
    const ws = wb.addWorksheet('종류별 사용');
    ws.columns = [{ width: 18 }, { width: 12 }, { width: 12 }, { width: 12 }];
    ws.addRow([`${banner} · ${r.yearFrom} ~ ${r.asOf} 승인 휴가`]).font = { name: FONT, size: 10, bold: true };
    ws.addRow(['휴가 종류', '건수', '일수', '사용한 사람']).font = { name: FONT, size: 10, bold: true };
    for (const x of r.typeUse) ws.addRow([safe(x.name), x.requests, x.days, x.people]);
  }
  const meta = wb.addWorksheet('메타');
  meta.columns = [{ width: 22 }, { width: 70 }];
  [
    ['기준일', r.asOf], ['부서 조건', args.groupName], ['퇴사자', r.withInactive ? '포함' : '제외'], ['사용 내역', r.practice ? '연습 신청 기준' : '운영 신청 기준'], ['생성 일시', r.generatedAt], ['내보낸 사람', args.by],
    ['소진율', '사용 ÷ 받은 연차 (기준일에 쓸 수 있는 지급 건 기준). 받은 연차가 0이면 계산 불가.'],
    ['안내', '숫자는 휴가 원장의 합입니다. 원장을 시작하지 않은 직원(승인된 지급 건 없음)은 합계에 들어가지 않고 예전 계산의 잔여만 참고로 적습니다. 일 단위(하루 = 8시간)입니다.'],
  ].forEach((row, i) => row.forEach((v, j) => { const c = meta.getRow(i + 1).getCell(j + 1); c.value = safe(v); c.font = { name: FONT, size: 10, bold: j === 0 }; c.alignment = { wrapText: true, vertical: 'top' }; }));
  return wb;
}
