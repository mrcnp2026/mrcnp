// 화면 사진 찍기 — 디자인을 눈으로 확인할 때. 검사 전용 직원(e2e-audit)으로 로그인해 주요 화면을 390px로 찍는다.
//   npx tsx scripts/shots.mts [저장 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 끝나면 이 스크립트가 만든 가짜 폰 등록을 해제하고 e2e-audit을 다시 끈다. 기록은 만들지 않는다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';

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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(`${BASE}/register?token=${token}`);
  await p.getByRole('button', { name: /이 폰 등록하기/ }).click();
  await p.getByText('폰이 등록되었습니다.').waitFor({ timeout: 20000 });
  const shot = async (name: string, url: string, full = true) => {
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    await p.waitForFunction("!document.querySelector('[aria-busy=true]')");
    await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
    console.log('찍음', name);
  };
  await shot('admin-home', '/admin');
  await shot('admin-members', '/admin/members');
  await shot('admin-records', '/admin/records');
  await shot('admin-inbox', '/admin/inbox');
  await shot('admin-more', '/admin/more');
  await shot('admin-leave', '/admin/leave');
  await shot('admin-punch-home', '/punch', false);
  await db.from('profiles').update({ role: 'employee' }).eq('id', emp!.id);
  await shot('punch-home', '/punch');
  await shot('punch-records', '/punch/records');
  await shot('punch-corrections', '/punch/corrections');
  await shot('punch-leave', '/punch/leave');
} finally {
  await browser.close();
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
}
