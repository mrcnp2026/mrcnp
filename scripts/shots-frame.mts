// 새 틀(위 띠 + 앱 띠 + 메뉴 판 · 통합설정) 사진 — 검사 전용 관리자(e2e-audit)로 연다. 읽기만 한다.
//   npx tsx scripts/shots-frame.mts <사진 폴더> [주소,주소…]   (앱이 localhost:4123에 켜져 있어야 한다)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const PAGES = (process.argv[3] ?? '/admin,/admin/anomalies,/admin/payroll/runs,/admin/inbox,/admin/members,/admin/console,/admin/settings?tab=punch,/admin/settings?tab=pay&section=ledger,/admin/leave/types,/punch,/punch/payslips').split(',');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id, can_view_payroll').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', can_view_payroll: true }).eq('id', emp!.id); // 급여 화면도 찍는다 — 끝나면 되돌린다
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  p.on('console', (m) => m.type() === 'error' && console.log('console', m.text().slice(0, 200)));
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  let i = 0;
  for (const u of PAGES) {
    await p.goto(BASE + u);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(SHOTS, `pc-${String(++i).padStart(2, '0')}${u.replace(/[/?&=]/g, '_')}.png`) });
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/admin/console`);
  await p.waitForLoadState('networkidle');
  await p.screenshot({ path: path.join(SHOTS, 'ph-console.png') });
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  await p.locator('[data-menu-open]').first().click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOTS, 'ph-drawer.png') });
} finally {
  await browser.close();
  await db.from('profiles').update({ locale: 'en', can_view_payroll: emp!.can_view_payroll }).eq('id', emp!.id);
}
