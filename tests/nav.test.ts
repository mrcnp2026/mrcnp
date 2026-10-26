// 메뉴 구성표(config/nav.ts) — 틀 · 서랍 · 검색 · 통합설정이 전부 이 표를 읽는다.
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_APPS, appLeaves, appsFor, CONSOLE_APPS, locate, locateHref, MY_APPS } from '@/config/nav';
import en from '../messages/en.json';
import ko from '../messages/ko.json';

const ROOT = path.join(__dirname, '..');
const q = (s = '') => new URLSearchParams(s);
const all = [...MY_APPS, ...ADMIN_APPS, ...CONSOLE_APPS];

function pages(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (f === 'page.tsx') out.push(path.relative(path.join(ROOT, 'src', 'app'), dir).split(path.sep).join('/'));
  }
  return out;
}

describe('메뉴 구성표', () => {
  it('모든 이름이 한국어 · 영어 번역 파일에 있다', () => {
    const missing: string[] = [];
    for (const m of [ko, en] as unknown as { frame: Record<string, Record<string, string>> }[]) {
      for (const a of all) {
        if (!m.frame.app[a.key]) missing.push(`app.${a.key}`);
        if (!a.section && !m.frame.appFull[a.key]) missing.push(`appFull.${a.key}`);
        for (const g of a.groups) if (g.key && !m.frame.group[g.key]) missing.push(`group.${g.key}`);
        for (const l of appLeaves(a)) if (!m.frame.item[l.key]) missing.push(`item.${l.key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('모든 항목의 주소에 실제 화면이 있다', () => {
    const bad = all.flatMap(appLeaves).filter((l) => {
      const p = l.href.split('?')[0];
      const dir = path.join(ROOT, 'src', 'app', ...p.split('/').filter(Boolean));
      return !existsSync(path.join(dir, 'page.tsx')) && !(p.startsWith('/admin/manage/') && existsSync(path.join(ROOT, 'src', 'app', 'admin', 'manage', '[topic]', 'page.tsx')));
    });
    expect(bad.map((l) => l.href)).toEqual([]);
  });

  it('통합설정의 모든 항목에 「이 화면 쓰는 법」 종류가 있고, 번역이 있다 (2026-10-14 의뢰인)', () => {
    expect(CONSOLE_APPS.flatMap(appLeaves).filter((l) => !l.how).map((l) => l.key)).toEqual([]);
    for (const m of [ko, en] as unknown as { frame: { how: Record<string, { tag: string; text: string }> } }[]) for (const l of CONSOLE_APPS.flatMap(appLeaves)) expect(m.frame.how[l.how!]?.text).toBeTruthy();
  });

  it('관리자 모드와 통합설정의 앱 이름이 겹치지 않는다 (2026-10-14 의뢰인)', () => {
    const fr = (ko as unknown as { frame: { app: Record<string, string>; appFull: Record<string, string> } }).frame;
    const admin = new Set(ADMIN_APPS.flatMap((a) => [fr.app[a.key], fr.appFull[a.key]]));
    expect(CONSOLE_APPS.map((a) => fr.app[a.key]).filter((x) => admin.has(x))).toEqual([]);
  });

  it('같은 주소가 두 항목에 들어 있지 않다', () => {
    const hrefs = all.flatMap(appLeaves).map((l) => l.href);
    expect(hrefs.filter((h, i) => hrefs.indexOf(h) !== i)).toEqual([]);
  });

  it('관리 화면(/admin) · 직원 화면(/punch)의 모든 화면이 어느 항목엔가 속한다 — 메뉴에서 길을 잃는 화면이 없다', () => {
    const lost = pages(path.join(ROOT, 'src', 'app', 'admin'))
      .concat(pages(path.join(ROOT, 'src', 'app', 'punch')))
      .map((p) => `/${p.replace(/\[[^\]]+\]/g, 'x')}`)
      .filter((p) => p !== '/admin/console' && p !== '/admin/console-lock' && !p.startsWith('/admin/manage/')) // 잠금 화면은 다른 주소를 대신 그린다
      .filter((p) => p !== '/admin/search' && p !== '/punch/search') // 통합 검색은 위쪽 검색창에서 연다(메뉴 항목 아님)
      .filter((p) => p !== '/admin/help' && p !== '/punch/help') // 도움말은 위 띠의 물음표에서 연다(메뉴 항목 아님, 2026-10-26)
      .filter((p) => p !== '/admin/ops' && !p.startsWith('/admin/ops/')) // 운영 현황과 그 안의 화면(메일 발송 현황 등)은 시스템관리자 한 사람만 — 메뉴 표가 아니라 내 메뉴(AccountMenu) · 운영 현황 안에서만 연다(2026-10-24 의뢰인)
      .filter((p) => !locate(p, q(), 'admin').leaf);
    expect(lost).toEqual([]);
  });

  it('주소가 길게 맞는 쪽이 이긴다 — 설정 화면은 통합설정, 처리 화면은 관리자 화면', () => {
    const at = (p: string, s = '') => {
      const r = locate(p, q(s), 'admin');
      return `${r.space}/${r.app?.key}/${r.leaf?.key}`;
    };
    expect(at('/admin/leave')).toBe('admin/mLeave/leaveHistory');
    expect(at('/admin/leave', 'v=accrual')).toBe('admin/mLeave/leaveAccrual');
    expect(at('/admin/leave/req/abc')).toBe('admin/mLeave/leaveHistory');
    expect(at('/admin/leave/types/annual')).toBe('console/aLeave/leaveTypes');
    expect(at('/admin/members/groups')).toBe('admin/mHr/orgGroups');
    expect(at('/admin/members/abc')).toBe('admin/mHr/members');
    expect(at('/admin')).toBe('admin/mHome/adminHome');
    expect(at('/admin/settings')).toBe('console/cBasic/setGeneral');
    expect(at('/admin/settings', 'tab=punch')).toBe('console/aAttendance/setPunch');
    expect(at('/admin/settings', 'tab=pay')).toBe('console/aPay/payEmployeeDefaults');
    expect(at('/admin/settings', 'tab=pay&section=income-tax&year=2026')).toBe('console/aPay/payIncomeTax');
    expect(at('/admin/payroll/runs/abc/def')).toBe('admin/mPay/payRuns');
    expect(at('/admin/payroll/daily/runs/abc')).toBe('admin/mPay/payDaily');
    expect(at('/admin/console')).toBe('console/undefined/undefined');
    expect(at('/punch')).toBe('my/home/myHome');
    expect(at('/punch/home-settings')).toBe('my/home/myHome');
    expect(at('/punch/corrections')).toBe('my/records/myRecords');
    expect(at('/punch/leave/promotion/abc')).toBe('my/leave/myLeave');
  });

  it('지점관리자는 허용한 화면만, 직원은 내 화면만 본다', () => {
    const m = appsFor('admin', 'manager').flatMap(appLeaves).map((l) => l.href);
    expect(m).toEqual(['/admin/schedule', '/admin/schedule?v=day', '/admin/records/calendar', '/admin/records/list', '/admin/records', '/admin/missing', '/admin/leave', '/admin/inbox']);
    expect(appsFor('console', 'manager')).toEqual([]);
    expect(appsFor('admin', 'employee')).toEqual([]);
    expect(appsFor('console', 'employee')).toEqual([]);
    expect(locateHref('/admin/settings', 'manager')).toBeUndefined();
    expect(locate('/admin/payroll', q(), 'employee').leaf).toBeUndefined();
  });
});
