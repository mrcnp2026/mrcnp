// 메뉴 구성표 한곳 — PC 틀(앱 띠 + 메뉴 판) · 폰 서랍 · 메뉴 검색 · 통합설정 전체 메뉴가 전부 이 표만 읽는다.
// 공간은 셋 (2026-10-14 의뢰인 결정, 결정 사항 개발-20 · 21 · 25):
//   my      = 내 화면 (직원 누구나 — 내 것)
//   admin   = 관리자 화면 (회사 것 처리 — 관리자 · 지점관리자)
//   console = 통합설정 (기준 — 관리자만) = 회사설정 + App 관리
// 화면 주소는 바꾸지 않았다 — 어느 주소가 어느 공간 · 앱 · 항목인지는 여기서 정한다(가장 길게 맞는 항목이 이긴다).
// 이름은 번역 파일 frame.app / frame.group / frame.item 의 열쇠다.
import { Building2, ChartColumn, Clock, Database, FileBarChart, House, type LucideIcon, Megaphone, MessagesSquare, Network, Plane, Send, ShieldCheck, SlidersHorizontal, UserRound, Users, Wallet } from 'lucide-react';
import { managerCanOpen } from '@/lib/manager-rules';

// how: 통합설정 화면 맨 위 「이 화면 쓰는 법」 띠의 종류 (2026-10-14 의뢰인: 이미 적용된 건지 · 저장해야 적용되는지 · 보기만인지 한눈에)
export type How = 'view' | 'instant' | 'versioned' | 'list' | 'review';
// pcOnly: 폰에서는 같은 화면이 다른 모양으로만 그려져 고를 의미가 없는 항목 — 폰 서랍에서 뺀다 (2026-10-15 의뢰인: 폰 근무일정 「달력형」이 눌러도 그대로)
export type Leaf = { href: string; key: string; exact?: boolean; also?: string[]; badge?: 'inbox'; how?: How; pcOnly?: boolean };
export type Group = { key: string | null; items: Leaf[] };
export type App = { key: string; icon: LucideIcon; groups: Group[]; section?: 'company' | 'apps' };
export type Space = 'my' | 'admin' | 'console';
export type NavRole = 'admin' | 'manager' | 'employee';

const one = (items: Leaf[]): Group[] => [{ key: null, items }];
const tab = (x: string) => `/admin/settings?tab=${x}`;
const pay = (x: string) => `/admin/settings?tab=pay&section=${x}`;

export const MY_APPS: App[] = [
  { key: 'home', icon: House, groups: one([{ href: '/punch', key: 'myHome', exact: true, also: ['/punch/home-settings'] }]) },
  // 직원에게는 근무일정이 곧 출퇴근 일정 — 직원 모드의 근무일정 메뉴는 없앴다(2026-10-15 의뢰인, 결정 사항 개발-37). 일정 요청은 내 근태현황 안에서
  { key: 'records', icon: Clock, groups: one([{ href: '/punch/records', key: 'myRecords', also: ['/punch/corrections', '/punch/schedule'] }]) },
  { key: 'leave', icon: Plane, groups: one([{ href: '/punch/leave', key: 'myLeave' }]) },
  { key: 'requests', icon: Send, groups: one([{ href: '/punch/requests', key: 'myRequests' }]) },
  { key: 'pay', icon: Wallet, groups: one([{ href: '/punch/payslips', key: 'payslips' }, { href: '/punch/retirement', key: 'myRetirement' }]) },
  // 「업무 메시지」는 2026-10-16 의뢰인 지시로 이름이 「사내게시판」이다(주소 · 코드 이름은 messages 그대로). 따로 만들었던 자유 게시판은 같은 날 지웠다
  { key: 'talk', icon: MessagesSquare, groups: one([{ href: '/punch/notices', key: 'notices' }, { href: '/punch/messages', key: 'messages' }]) },
  { key: 'people', icon: UserRound, groups: one([{ href: '/punch/org', key: 'orgChart' }, { href: '/punch/account', key: 'account' }]) },
];

export const ADMIN_APPS: App[] = [
  { key: 'mHome', icon: House, groups: one([{ href: '/admin', key: 'adminHome', exact: true }]) },
  { key: 'mHr', icon: Users, groups: one([{ href: '/admin/members', key: 'members' }, { href: '/admin/members/groups', key: 'orgGroups' }]) },
  {
    key: 'mAttendance',
    icon: Clock,
    groups: [
      { key: 'gSchedule', items: [{ href: '/admin/schedule', key: 'scheduleCal', pcOnly: true }, { href: '/admin/schedule?v=list', key: 'scheduleList' }] },
      { key: 'gRecords', items: [{ href: '/admin/records/calendar', key: 'recordsCal' }, { href: '/admin/records/list', key: 'recordsList' }, { href: '/admin/records', key: 'recordsMonthly' }] },
      { key: 'gCheck', items: [{ href: '/admin/missing', key: 'missing' }, { href: '/admin/anomalies', key: 'anomalies' }, { href: '/admin/closing', key: 'closing' }] },
    ],
  },
  { key: 'mLeave', icon: Plane, groups: one([{ href: '/admin/leave', key: 'leaveHistory' }, { href: '/admin/leave?v=accrual', key: 'leaveAccrual' }, { href: '/admin/leave/ledger', key: 'leaveLedger' }, { href: '/admin/leave/promotion', key: 'leavePromotion' }]) },
  { key: 'mRequests', icon: Send, groups: one([{ href: '/admin/inbox', key: 'inbox', badge: 'inbox' }]) },
  {
    key: 'mPay',
    icon: Wallet,
    groups: [
      { key: 'gPayPrep', items: [{ href: '/admin/payroll/staff', key: 'payStaff' }, { href: '/admin/payroll', key: 'payHours' }] },
      { key: 'gPayRun', items: [{ href: '/admin/payroll/runs', key: 'payRuns' }, { href: '/admin/payroll/slips', key: 'paySlips' }, { href: '/admin/payroll/daily', key: 'payDaily' }] },
      { key: 'gPaySettle', items: [{ href: '/admin/payroll/insurance', key: 'payInsurance' }, { href: '/admin/payroll/retirement', key: 'payRetirement' }] },
      { key: 'gPayView', items: [{ href: '/admin/payroll/labor-cost', key: 'payLabor' }] },
    ],
  },
  { key: 'mTalk', icon: Megaphone, groups: one([{ href: '/admin/notices', key: 'adminNotices' }, { href: '/admin/messages', key: 'adminMessages' }]) },
  { key: 'mReports', icon: ChartColumn, groups: one([{ href: '/admin/reports/attendance', key: 'reportAttendance' }, { href: '/admin/reports/leave', key: 'reportLeave' }, { href: '/admin/manage/report-snapshots', key: 'reportSnapshots' }]) },
];

// 통합설정 — 문서 07의 6장 분류 표. section: company = 회사설정, apps = App 관리
export const CONSOLE_HOME = '/admin/console';
export const CONSOLE_APPS: App[] = [
  { key: 'cBasic', section: 'company', icon: Building2, groups: one([{ href: '/admin/settings', key: 'setGeneral', how: 'instant' }, { href: tab('notify'), key: 'setNotify', how: 'view' }, { href: tab('advanced'), key: 'setAdvanced', how: 'view' }]) },
  { key: 'cOrg', section: 'company', icon: Network, groups: one([{ href: '/admin/branches', key: 'branches', how: 'list' }, { href: '/admin/jobs', key: 'jobs', how: 'list' }, { href: tab('branch'), key: 'setBranch', how: 'view' }]) },
  { key: 'cAccess', section: 'company', icon: ShieldCheck, groups: one([{ href: tab('access'), key: 'setAccess', how: 'view' }, { href: tab('security'), key: 'setSecurity', how: 'view' }]) },
  { key: 'cData', section: 'company', icon: Database, groups: one([{ href: '/admin/diag', key: 'diag', how: 'view' }]) },
  {
    key: 'aAttendance',
    section: 'apps',
    icon: Clock,
    groups: [
      { key: 'gRule', items: [{ href: tab('work'), key: 'setWork', how: 'versioned' }, { href: tab('punch'), key: 'setPunch', how: 'instant' }, { href: tab('break'), key: 'setBreak', how: 'versioned' }, { href: tab('closing'), key: 'setClosing', how: 'view' }] },
      { key: 'gPlace', items: [{ href: '/admin/places', key: 'places', how: 'list' }] },
      { key: 'gShift', items: [{ href: '/admin/manage/shift-kinds', key: 'shiftKinds', how: 'view' }, { href: '/admin/shifts', key: 'shifts', how: 'list' }, { href: '/admin/manage/schedule-patterns', key: 'schedulePatterns', how: 'view' }] },
    ],
  },
  { key: 'aLeave', section: 'apps', icon: Plane, groups: one([{ href: tab('leave'), key: 'setLeave', how: 'view' }, { href: '/admin/leave/types', key: 'leaveTypes', how: 'list' }, { href: '/admin/manage/leave-groups', key: 'leaveGroups', how: 'view' }, { href: '/admin/manage/accrual-rule', key: 'accrualRule', how: 'view' }]) },
  { key: 'aRequests', section: 'apps', icon: Send, groups: one([{ href: tab('request'), key: 'setRequest', how: 'view' }, { href: '/admin/manage/approval-rules', key: 'approvalRules', how: 'view' }]) },
  { key: 'aTalk', section: 'apps', icon: Megaphone, groups: one([{ href: tab('message'), key: 'setMessage', how: 'view' }, { href: '/admin/manage/message-templates', key: 'messageTemplates', how: 'view' }, { href: '/admin/manage/message-rules', key: 'messageRules', how: 'view' }]) },
  { key: 'aReports', section: 'apps', icon: FileBarChart, groups: one([{ href: tab('report'), key: 'setReport', how: 'view' }, { href: '/admin/manage/report-templates', key: 'reportTemplates', how: 'view' }]) },
  {
    key: 'aPay',
    section: 'apps',
    icon: Wallet,
    groups: [
      { key: 'gPayBase', items: [{ href: tab('pay'), key: 'payEmployeeDefaults', how: 'versioned' }, { href: pay('ledger'), key: 'payLedger', how: 'versioned' }, { href: pay('working-time'), key: 'payWorkingTime', how: 'versioned' }, { href: pay('masking'), key: 'payMasking', how: 'versioned' }] },
      { key: 'gPayItems', items: [{ href: pay('payment-items'), key: 'payPaymentItems', how: 'list' }, { href: pay('deduction-items'), key: 'payDeductionItems', how: 'list' }, { href: pay('allowances'), key: 'payAllowances', how: 'versioned' }] },
      { key: 'gPayRates', items: [{ href: pay('insurance-rates'), key: 'payInsuranceRates', how: 'review' }, { href: pay('income-tax'), key: 'payIncomeTax', how: 'review' }] },
    ],
  },
  { key: 'aHr', section: 'apps', icon: SlidersHorizontal, groups: one([{ href: tab('staff'), key: 'setStaff', how: 'view' }, { href: '/admin/manage/work-info', key: 'workInfo', how: 'view' }, { href: tab('esign'), key: 'setEsign', how: 'view' }]) },
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
