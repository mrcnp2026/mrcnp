// 화면 이동 속도 재기 — 하단 탭을 실제로 눌러 ① 화면이 바뀌기 시작할 때까지 ② 내용이 다 찰 때까지 시간을 잰다.
//   BASE=https://mrcnp-saas.vercel.app npx tsx scripts/measure-nav.mts   (기본: http://localhost:4123)
// 검사 전용 직원(e2e-audit)만 쓴다. 끝나면 이 스크립트가 만든 가짜 폰 등록을 해제하고 e2e-audit을 다시 끈다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
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
const out: string[] = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  // 탭 누르기: 주소가 바뀌거나 불러오는 자리가 보이면 ①, 서버 응답이 끝나 화면이 조용해지면 ②
  const tap = async (label: string, href: string) => {
    const t0 = Date.now();
    await p.locator(`nav a[href="${href}"]`).first().click();
    await Promise.race([p.waitForURL((u) => u.pathname === href, { timeout: 15000 }), p.locator('[aria-busy=true]').first().waitFor({ timeout: 15000 })]);
    const first = Date.now() - t0;
    await p.waitForURL((u) => u.pathname === href, { timeout: 15000 });
    // 불러오는 자리가 사라지고 실제 내용(h1 또는 카드)이 보이면 "다 참". networkidle은 0.5초 조용함을 기다려 숫자를 부풀리므로 쓰지 않는다
    await p.waitForFunction("!document.querySelector('[aria-busy=true]') && !!document.querySelector('main h1, h1, section')", null, { timeout: 15000, polling: 16 });
    out.push(`${label.padEnd(14)} 반응 ${String(first).padStart(5)}ms · 다 참 ${String(Date.now() - t0).padStart(5)}ms`);
  };
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  // 서버 응답만 따로: 화면 이동 때 브라우저가 받는 RSC 응답 시간 (서버 처리 + 왕복)
  for (const h of ['/login', '/login', '/brand/x', '/admin/more', '/admin/more', '/punch/corrections']) {
    const ms = await p.evaluate(
      (href) => fetch(href, { headers: { RSC: '1' } }).then(async (r) => { const t = performance.now(); await r.text(); return `${r.status} ${Math.round(performance.now() - t)}`; }),
      h,
    );
    const t0 = Date.now();
    const st = await p.evaluate((href) => fetch(href, { headers: { RSC: '1' } }).then((r) => r.text().then(() => r.status)), h);
    void ms;
    out.push(`RSC ${h.padEnd(18)} ${st} ${Date.now() - t0}ms`);
  }
  for (let round = 1; round <= 2; round++) {
    out.push(`── 관리자 ${round}회차`);
    for (const [l, h] of [['처리함', '/admin/inbox'], ['기록', '/admin/records'], ['직원', '/admin/members'], ['더보기', '/admin/more'], ['홈', '/admin']]) await tap(l, h);
  }
  await db.from('profiles').update({ role: 'employee' }).eq('id', emp!.id);
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  for (let round = 1; round <= 2; round++) {
    out.push(`── 직원 ${round}회차`);
    for (const [l, h] of [['내 기록', '/punch/records'], ['정정 요청', '/punch/corrections'], ['홈', '/punch']]) await tap(l, h);
  }
} catch (e) {
  out.push(`중단: ${(e as Error).message.split('\n')[0]}`);
} finally {
  await browser.close();
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`${BASE}\n${out.join('\n')}`);
}
