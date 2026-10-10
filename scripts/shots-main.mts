// 주요 화면 사진 (시프티 스샷과 나란히 비교용, 2026-10-10) — 검사 전용 관리자(e2e-audit)로 폰 폭 화면을 찍는다. 읽기만 한다.
//   npx tsx scripts/shots-main.mts <사진 폴더>   (앱이 localhost:4123에 켜져 있어야 한다)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
if (!SHOTS) throw new Error('사진 폴더를 적어 주세요');
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

const PAGES: [string, string][] = (process.argv[3] ? [['01-홈', '/punch']] as [string, string][] : [
  ['01-홈', '/punch'],
  ['02-요청-전체', '/admin/inbox'],
  ['03-요청-내것', '/punch/requests?tab=done'],
  ['04-근무일정', '/admin/schedule'],
  ['05-출퇴근기록-전체', '/admin/records'],
  ['06-출퇴근기록-내것', '/punch/records'],
  ['07-휴가-전체', '/admin/leave'],
  ['08-휴가-내것', '/punch/leave'],
  ['09-현황', '/admin'],
  ['10-직원', '/admin/members'],
]);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1.5 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  for (const [name, url] of PAGES) {
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: !!process.argv[3] });
    console.log(name);
  }
  await p.goto(`${BASE}/punch`);
  await p.locator('[data-menu-open]').click();
  await p.getByRole('dialog').waitFor();
  await p.screenshot({ path: path.join(SHOTS, '11-메뉴.png') });
} finally {
  await browser.close();
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
}
