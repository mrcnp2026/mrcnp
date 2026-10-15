// 화면 확인 사진 — 폭|주소|이름 을 쉼표로 여러 개: npx tsx scripts/shots-pages.mts <폴더> "390|/punch|홈,1440|/admin|관리자"
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
const CODE = path.join(import.meta.dirname, '..');
import { createPassword } from './lib/e2e-password.ts';
config({ path: path.join(CODE, '.env.local'), quiet: true });
const BASE = 'http://localhost:4123';
const OUT = process.argv[2];
const PAGES = (process.argv[3] ?? '').split(',').filter(Boolean);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: adm } = await db.from('profiles').select('id').eq('employee_no', process.env.SHOT_EMP ?? 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: process.env.SHOT_ROLE ?? 'admin', locale: 'ko', can_view_payroll: !process.env.SHOT_ROLE }).eq('id', adm!.id);
const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: adm!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: adm!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const br = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  for (const spec of PAGES) {
    const [w, url, name, click] = spec.split('|'); // 넷째 칸: 찍기 전에 누를 곳(CSS 선택자, 선택)
    await p.setViewportSize({ width: Number(w), height: Number(w) < 800 ? 844 : 900 });
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(400);
    if (click) {
      await p.locator(click).first().click();
      await p.waitForTimeout(400);
    }
    console.log(name, 'h', await p.evaluate(() => document.documentElement.scrollHeight), 'w', await p.evaluate(() => document.documentElement.scrollWidth));
    await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  }
  console.log('errors', errs.join(' | '));
} finally {
  await br.close();
  await db.from('profiles').update({ active: false, role: 'employee', can_view_payroll: false }).eq('id', adm!.id);
}
