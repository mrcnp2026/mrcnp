// 메뉴 구성표 한곳 — PC 틀(앱 띠 + 메뉴 판) · 폰 서랍 · 메뉴 검색 · 통합설정 전체 메뉴가 전부 이 표만 읽는다.
// 공간은 셋 (2026-10-14 의뢰인 결정, 결정 사항 개발-20 · 21 · 25):
//   my      = 내 화면 (직원 누구나 — 내 것)
//   admin   = 관리자 화면 (회사 것 처리 — 관리자 · 지점관리자)
//   console = 통합설정 (기준 — 관리자만) = 회사설정 + App 관리
// 화면 주소는 바꾸지 않았다 — 어느 주소가 어느 공간 · 앱 · 항목인지는 여기서 정한다(가장 길게 맞는 항목이 이긴다).
// 이름은 번역 파일 frame.app / frame.group / frame.item 의 열쇠다.
import { Building2, CalendarRange, ChartColumn, Clock, Database, FileBarChart, House, type LucideIcon, Megaphone, MessagesSquare, Network, Plane, Send, ShieldCheck, SlidersHorizontal, UserRound, Users, Wallet } from 'lucide-react';
import { managerCanOpen } from '@/lib/manager-rules';

export type Leaf = { href: string; key: string; exact?: boolean; also?: string[]; badge?: 'inbox' };
export type Group = { key: string | null; items: Leaf[] };
export type App = { key: string; icon: LucideIcon; groups: Group[]; section?: 'company' | 'apps' };
export type Space = 'my' | 'admin' | 'console';
export type NavRole = 'admin' | 'manager' | 'employee';

const one = (items: Leaf[]): Group[] => [{ key: null, items }];
const tab = (x: string) => `/admin/settings?tab=${x}`;
const pay = (x: string) => `/admin/settings?tab=pay&section=${x}`;

export const MY_APPS: App[] = [
  { key: 'home', icon: House, groups: one([{ href: '/punch', key: 'myHome', exact: true, also: ['/punch/home-settings'] }]) },
  { key: 'schedule', icon: CalendarRange, groups: one([{ href: '/punch/schedule', key: 'mySchedule' }]) },
  { key: 'records', icon: Clock, groups: one([{ href: '/punch/records', key: 'myRecords', also: ['/punch/corrections'] }]) },
  { key: 'leave', icon: Plane, groups: one([{ href: '/punch/leave', key: 'myLeave' }]) },
  { key: 'requests', icon: Send, groups: one([{ href: '/punch/requests', key: 'myRequests' }]) },
  { key: 'pay', icon: Wallet, groups: one([{ href: '/punch/payslips', key: 'payslips' }, { href: '/punch/retirement', key: 'myRetirement' }]) },
  { key: 'talk', icon: MessagesSquare, groups: one([{ href: '/punch/notices', key: 'notices' }, { href: '/punch/messages', key: 'messages' }]) },
  { key: 'people', icon: UserRound, groups: one([{ href: '/punch/org', key: 'orgChart' }, { href: '/punch/account', key: 'account' }]) },
];

export const ADMIN_APPS: App[] = [
  { key: 'home', icon: House, groups: one([{ href: '/admin', key: 'adminHome', exact: true }]) },
  { key: 'hr', icon: Users, groups: one([{ href: '/admin/members', key: 'members' }, { href: '/admin/members/groups', key: 'orgGroups' }]) },
  {
    key: 'attendance',
    icon: Clock,
    groups: [
      { key: 'gSchedule', items: [{ href: '/admin/schedule', key: 'scheduleCal' }, { href: '/admin/schedule?v=list', key: 'scheduleList' }] },
      { key: 'gRecords', items: [{ href: '/admin/records/calendar', key: 'recordsCal' }, { href: '/admin/records/list', key: 'recordsList' }, { href: '/admin/records', key: 'recordsMonthly' }] },
      { key: 'gCheck', items: [{ href: '/admin/missing', key: 'missing' }, { href: '/admin/anomalies', key: 'anomalies' }, { href: '/admin/closing', key: 'closing' }] },
    ],
  },
  { key: 'leave', icon: Plane, groups: one([{ href: '/admin/leave', key: 'leaveHistory' }, { href: '/admin/leave?v=accrual', key: 'leaveAccrual' }, { href: '/admin/leave/ledger', key: 'leaveLedger' }, { href: '/admin/leave/promotion', key: 'leavePromotion' }]) },
  { key: 'requests', icon: Send, groups: one([{ href: '/admin/inbox', key: 'inbox', badge: 'inbox' }]) },
  {
    key: 'pay',
    icon: Wallet,
    groups: [
      { key: 'gPayPrep', items: [{ href: '/admin/payroll/staff', key: 'payStaff' }, { href: '/admin/payroll', key: 'payHours' }] },
      { key: 'gPayRun', items: [{ href: '/admin/payroll/runs', key: 'payRuns' }, { href: '/admin/payroll/daily', key: 'payDaily' }] },
      { key: 'gPaySettle', items: [{ href: '/admin/payroll/insurance', key: 'payInsurance' }, { href: '/admin/payroll/retirement', key: 'payRetirement' }] },
      { key: 'gPayView', items: [{ href: '/admin/payroll/labor-cost', key: 'payLabor' }] },
    ],
  },
  { key: 'talk', icon: Megaphone, groups: one([{ href: '/admin/notices', key: 'adminNotices' }, { href: '/admin/messages', key: 'adminMessages' }]) },
  { key: 'reports', icon: ChartColumn, groups: one([{ href: '/admin/reports/attendance', key: 'reportAttendance' }, { href: '/admin/reports/leave', key: 'reportLeave' }, { href: '/admin/manage/report-snapshots', key: 'reportSnapshots' }]) },
];

// 통합설정 — 문서 07의 6장 분류 표. section: company = 회사설정, apps = App 관리
export const CONSOLE_HOME = '/admin/console';
export const CONSOLE_APPS: App[] = [
  { key: 'cBasic', section: 'company', icon: Building2, groups: one([{ href: '/admin/settings', key: 'setGeneral' }, { href: tab('notify'), key: 'setNotify' }, { href: tab('advanced'), key: 'setAdvanced' }]) },
  { key: 'cOrg', section: 'company', icon: Network, groups: one([{ href: '/admin/branches', key: 'branches' }, { href: '/admin/jobs', key: 'jobs' }, { href: tab('branch'), key: 'setBranch' }]) },
  { key: 'cAccess', section: 'company', icon: ShieldCheck, groups: one([{ href: tab('access'), key: 'setAccess' }, { href: tab('security'), key: 'setSecurity' }]) },
  { key: 'cData', section: 'company', icon: Database, groups: one([{ href: '/admin/diag', key: 'diag' }]) },
  {
    key: 'aAttendance',
    section: 'apps',
    icon: Clock,
    groups: [
      { key: 'gRule', items: [{ href: tab('work'), key: 'setWork' }, { href: tab('punch'), key: 'setPunch' }, { href: tab('break'), key: 'setBreak' }, { href: tab('closing'), key: 'setClosing' }] },
      { key: 'gPlace', items: [{ href: '/admin/places', key: 'places' }] },
      { key: 'gShift', items: [{ href: '/admin/manage/shift-kinds', key: 'shiftKinds' }, { href: '/admin/shifts', key: 'shifts' }, { href: '/admin/manage/schedule-patterns', key: 'schedulePatterns' }] },
    ],
  },
  { key: 'aLeave', section: 'apps', icon: Plane, groups: one([{ href: tab('leave'), key: 'setLeave' }, { href: '/admin/leave/types', key: 'leaveTypes' }, { href: '/admin/manage/leave-groups', key: 'leaveGroups' }, { href: '/admin/manage/accrual-rule', key: 'accrualRule' }]) },
  { key: 'aRequests', section: 'apps', icon: Send, groups: one([{ href: tab('request'), key: 'setRequest' }, { href: '/admin/manage/approval-rules', key: 'approvalRules' }]) },
  { key: 'aTalk', section: 'apps', icon: Megaphone, groups: one([{ href: tab('message'), key: 'setMessage' }, { href: '/admin/manage/message-templates', key: 'messageTemplates' }, { href: '/admin/manage/message-rules', key: 'messageRules' }]) },
  { key: 'aReports', section: 'apps', icon: FileBarChart, groups: one([{ href: tab('report'), key: 'setReport' }, { href: '/admin/manage/report-templates', key: 'reportTemplates' }]) },
  {
    key: 'aPay',
    section: 'apps',
    icon: Wallet,
    groups: [
      { key: 'gPayBase', items: [{ href: tab('pay'), key: 'payEmployeeDefaults' }, { href: pay('ledger'), key: 'payLedger' }, { href: pay('working-time'), key: 'payWorkingTime' }, { href: pay('masking'), key: 'payMasking' }] },
      { key: 'gPayItems', items: [{ href: pay('payment-items'), key: 'payPaymentItems' }, { href: pay('deduction-items'), key: 'payDeductionItems' }, { href: pay('allowances'), key: 'payAllowances' }] },
      { key: 'gPayRates', items: [{ href: pay('insurance-rates'), key: 'payInsuranceRates' }, { href: pay('income-tax'), key: 'payIncomeTax' }] },
    ],
  },
  { key: 'aHr', section: 'apps', icon: SlidersHorizontal, groups: one([{ href: tab('staff'), key: 'setStaff' }, { href: '/admin/manage/work-info', key: 'workInfo' }, { href: tab('esign'), key: 'setEsign' }]) },
];

const leavesOf = (app: App) => app.groups.flatMap((g) => g.items);
const mayOpen = (href: string) => managerCanOpen(href.split('?')[0]) && !href.includes('v=accrual');

/** 그 사람이 열 수 있는 앱만 (지점관리자는 허용한 화면만, 통합설정은 관리자만) */
export function appsFor(space: Space, role: NavRole): App[] {
  if (space === 'my') return MY_APPS;
  if (role === 'employee') return [];
  if (space === 'console') return role === 'admin' ? CONSOLE_APPS : [];
  if (role === 'admin') return ADMIN_APPS;
  return ADMIN_APPS.map((a) => ({ ...a, groups: a.groups.map((g) => ({ ...g, items: g.items.filter((i) => mayOpen(i.href)) })).filter((g) => g.items.length > 0) })).filter((a) => a.groups.length > 0);
}

export const appHref = (app: App) => leavesOf(app)[0].href;
export const appLeaves = leavesOf;

type Query = { get(name: string): string | null };

// 주소의 길이 길게 맞을수록, 그리고 ?v= · ?tab= · ?section= 까지 맞으면 그쪽이 이긴다
function score(leaf: Leaf, path: string, query: Query): number {
  const [p, qs] = leaf.href.split('?');
  let best = -1;
  if (!qs) {
    if (path === p || (!leaf.exact && path.startsWith(`${p}/`))) best = p.length * 4;
  } else if (path === p) {
    const pairs = [...new URLSearchParams(qs)];
    if (pairs.every(([k, v]) => query.get(k) === v)) best = p.length * 4 + pairs.length;
  }
  for (const a of leaf.also ?? []) if (path === a || path.startsWith(`${a}/`)) best = Math.max(best, a.length * 4);
  return best;
}

export type Located = { space: Space; app?: App; leaf?: Leaf };

/** 지금 주소가 어느 공간 · 앱 · 항목인가 */
export function locate(path: string, query: Query, role: NavRole): Located {
  let hit: Located | undefined;
  let top = -1;
  for (const space of ['my', 'admin', 'console'] as const) {
    for (const app of appsFor(space, role)) {
      for (const leaf of leavesOf(app)) {
        const s = score(leaf, path, query);
        if (s > top) [top, hit] = [s, { space, app, leaf }];
      }
    }
  }
  if (hit) return hit;
  return { space: path === CONSOLE_HOME || path.startsWith(`${CONSOLE_HOME}/`) ? 'console' : path.startsWith('/admin') ? 'admin' : 'my' };
}

/** 방금 누른 메뉴(주소 그대로)가 어느 항목인가 — 화면이 바뀌기 전에 먼저 켜 보인다 */
export function locateHref(href: string, role: NavRole): Located | undefined {
  for (const space of ['my', 'admin', 'console'] as const) {
    for (const app of appsFor(space, role)) {
      const leaf = leavesOf(app).find((l) => l.href === href);
      if (leaf) return { space, app, leaf };
    }
  }
  return href === CONSOLE_HOME ? { space: 'console' } : undefined;
}
