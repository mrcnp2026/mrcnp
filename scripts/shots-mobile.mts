// 폰 화면 점검 사진 (2026-10-15 의뢰인: 「모바일에서 쓰기 너무 힘들다」) — 390×844로 주요 화면 + 메뉴 서랍을 찍는다
//   npx tsx scripts/shots-mobile.mts <사진 폴더>
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword, unlockConsole } from './lib/e2e-password.ts';
config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const OUT = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: adm } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', can_view_payroll: true }).eq('id', adm!.id);
const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: adm!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: adm!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const br = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await (await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  const shot = async (url: string, name: string, drawer = false) => {
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(500);
    if (drawer) {
      await p.locator('[data-menu-open]').first().click();
      await p.waitForTimeout(300);
      const nav = p.locator('nav[role=dialog]');
      const scrollH = await nav.locator('div.overflow-y-auto').evaluate((e) => e.scrollHeight);
      console.log(name, 'drawer scrollHeight', scrollH, 'items', await nav.locator('a').count());
      await p.screenshot({ path: path.join(OUT, `${name}.png`) });
      await nav.locator('div.overflow-y-auto').evaluate((e) => e.scrollTo(0, 99999));
      await p.screenshot({ path: path.join(OUT, `${name}-bottom.png`) });
      return;
    }
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(name, 'height', h, 'width', w);
    await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  };
  await shot('/punch', '01-직원-홈');
  await shot('/punch', '02-직원-메뉴', true);
  await shot('/admin', '03-관리자-홈');
  await shot('/admin', '04-관리자-메뉴', true);
  await shot('/admin/inbox', '05-요청');
  await shot('/admin/records/list', '06-출퇴근기록');
  await shot('/admin/leave', '07-휴가');
  await shot('/admin/members', '08-직원');
  await shot('/admin/payroll/runs', '09-급여대장');
  await shot('/admin/payroll/staff', '10-사원별급여');
  await shot('/admin/reports/attendance', '11-근태리포트');
  await shot('/punch/payslips', '12-내급여');
  await shot('/punch/leave', '13-내휴가');
  await shot('/admin/schedule', '14-근무일정');
  await unlockConsole(p, db, adm!.id);
  await shot('/admin/console', '15-통합설정');
  await shot('/admin/settings?tab=work', '16-설정-근무');
} finally {
  await br.close();
  await db.from('console_pins').delete().eq('employee_id', adm!.id);
  await db.from('profiles').update({ active: false, role: 'employee', can_view_payroll: false }).eq('id', adm!.id);
}
