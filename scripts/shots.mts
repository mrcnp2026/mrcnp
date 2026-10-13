// 화면 사진 찍기 — 디자인을 눈으로 확인할 때. 검사 전용 직원(e2e-audit)으로 로그인해 주요 화면을 390px로 찍는다.
//   npx tsx scripts/shots.mts [저장 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 끝나면 이 스크립트가 만든 가짜 폰 등록을 해제하고 e2e-audit을 다시 끈다. 기록은 만들지 않는다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const OUT = process.argv[2] ?? path.join(import.meta.dirname, '..', 'shots');
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
// 이미 게시된 실제 공지는 검사 계정이 "확인함"으로 둔다 — 팝업이 화면을 가려 검사가 멈추지 않게 (검사 계정 것만, 실제 직원 확인 현황과 무관)
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) {
    await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
  }
}

const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844) }, deviceScaleFactor: process.env.W ? 1 : 2 }); // W=1440 H=900 으로 PC 화면도 찍는다
  const p = await ctx.newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  const shot = async (name: string, url: string, full = true) => {
    if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return; // ONLY=정규식 — 그 이름의 화면만 찍는다
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    await p.waitForFunction("!document.querySelector('[aria-busy=true]')");
    await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
    console.log('찍음', name);
  };
  // 왼쪽 위 메뉴를 연 모습 (폰 폭에서만 있다)
  const menu = async (name: string, url: string) => {
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    const open = p.locator('[data-menu-open]');
    if (!(await open.isVisible())) return;
    await open.click();
    await p.getByRole('dialog').waitFor();
    await p.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('찍음', name);
  };
  await shot('admin-home', '/admin');
  await menu('admin-menu', '/admin');
  await shot('admin-members', '/admin/members');
  await shot('admin-schedule', '/admin/schedule');
  await shot('admin-schedule-month', '/admin/schedule?v=month&from=' + new Date().toISOString().slice(0, 7) + '-01&to=' + new Date().toISOString().slice(0, 7) + '-28');
  await shot('admin-record-list', '/admin/records/list');
  await shot('admin-record-calendar', '/admin/records/calendar');
  await shot('admin-jobs', '/admin/jobs');
  await shot('admin-branches', '/admin/branches');
  await shot('admin-places', '/admin/places');
  await shot('admin-leave-types', '/admin/leave/types');
  await shot('admin-shifts', '/admin/shifts');
  await shot('admin-records', '/admin/records');
  await shot('admin-inbox', '/admin/inbox');
  // 요청 한 건을 열었을 때의 오른쪽 상세 패널 (PC) · 메뉴에 마우스를 올렸을 때의 확장 패널
  if (!process.env.ONLY || /inbox-panel/.test(process.env.ONLY)) {
    await p.goto(BASE + '/admin/inbox');
    const open = p.getByRole('link', { name: '처리', exact: true }).filter({ visible: true }).first();
    if (await open.count()) {
      await open.click();
      await p.waitForURL(/id=/);
      await p.waitForTimeout(600);
      await p.screenshot({ path: path.join(OUT, 'admin-inbox-panel.png') });
      console.log('찍음 admin-inbox-panel');
    }
    const side = p.locator('nav.sticky').first().getByRole('link', { name: '관리', exact: true });
    if (await side.count()) {
      await p.goto(BASE + '/admin');
      await side.hover();
      await p.waitForTimeout(1000);
      await p.screenshot({ path: path.join(OUT, 'admin-menu-panel.png') });
      console.log('찍음 admin-menu-panel');
    }
  }
  await shot('admin-leave', '/admin/leave');
  await shot('admin-leave-month', '/admin/leave?v=month');
  await shot('admin-leave-accrual', '/admin/leave?v=accrual');
  await shot('admin-org', '/admin/members/groups');
  await shot('admin-notice-new', '/admin/notices/new');
  await shot('admin-notices', '/admin/notices');
  await shot('admin-settings', '/admin/settings');
  await shot('admin-settings-work', '/admin/settings?tab=work');
  await shot('admin-settings-punch', '/admin/settings?tab=punch');
  await shot('admin-settings-break', '/admin/settings?tab=break');
  await shot('admin-settings-request', '/admin/settings?tab=request');
  await shot('admin-manage-approval', '/admin/manage/approval-rules');
  await shot('admin-manage-kinds', '/admin/manage/shift-kinds');
  await shot('admin-manage-workinfo', '/admin/manage/work-info');
  await shot('admin-schedule-day', '/admin/schedule?v=day&from=' + new Date().toISOString().slice(0, 8) + '06&to=' + new Date().toISOString().slice(0, 8) + '06');
  await shot('admin-schedule-list', '/admin/schedule?v=list');
  await shot('admin-payroll', '/admin/payroll');
  await shot('admin-member-new', '/admin/members/new');
  await shot('admin-member-detail', '/admin/members/' + emp!.id);
  await shot('admin-record-detail', '/admin/records/' + emp!.id);
  await shot('admin-punch-home', '/punch', false);
  await db.from('profiles').update({ role: 'employee' }).eq('id', emp!.id);
  await shot('punch-home', '/punch');
  await menu('punch-menu', '/punch');
  await shot('punch-schedule', '/punch/schedule');
  await shot('punch-requests', '/punch/requests');
  await shot('punch-records', '/punch/records');
  await shot('punch-corrections', '/punch/corrections');
  await shot('punch-corrections-new', '/punch/corrections?new=1', false);
  // 정정 요청의 둘째 단계 「요청사항 검토」 — 칸을 채우고 [다음]을 누른 모습 (보내지는 않는다)
  if (!process.env.ONLY || new RegExp(process.env.ONLY).test('punch-corrections-review')) {
    await p.goto(BASE + '/punch/corrections?new=1');
    await p.waitForLoadState('networkidle');
    await p.locator('input[name=workDate]').fill(new Date(Date.now() - 15 * 3600e3).toISOString().slice(0, 10));
    await p.locator('input[name=time]').fill('18:00');
    await p.getByRole('button', { name: '다음: 요청사항 검토' }).click();
    await p.locator('textarea[name=reason]').waitFor();
    await p.screenshot({ path: path.join(OUT, 'punch-corrections-review.png') });
    console.log('찍음', 'punch-corrections-review');
  }
  await shot('punch-leave', '/punch/leave');
  await shot('punch-leave-new', '/punch/leave?new=leave', false);
  await shot('punch-account', '/punch/account');
  await shot('punch-notices', '/punch/notices');
} finally {
  await browser.close();
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
}
