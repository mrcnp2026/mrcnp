// 가로 넘침 검수 — 모든 화면 × 여러 폭 × 언어. 마스터 4-9·5장: 가로 스크롤은 버그다 (월간 표만 자기 상자 안 예외였지만 지금은 그것도 없앰).
//   npm run audit:overflow        (앱이 켜져 있어야 한다)
// 사번 test 직원을 잠깐 관리자로 바꿔 관리자 화면도 본다 — 끝나면 되돌린다. 기록은 만들지 않는다.
// 찾는 것: ① 페이지 가로 스크롤 ② 상자 안 가로 스크롤 ③ 화면 밖으로 나간 요소 ④ 글자가 잘린 버튼·칩·링크
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = 'http://localhost:4123';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280];

// 브라우저 안에서 도는 검사. 문자열로 넘긴다 — tsx가 함수에 끼워 넣는 __name 도우미가 브라우저에는 없어서
const SCAN = `(() => {
  const out = [];
  const vw = window.innerWidth;
  const label = (el) => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return '<' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '> "' + t + '"';
  };
  if (document.documentElement.scrollWidth > vw + 1) out.push('PAGE scrollWidth ' + document.documentElement.scrollWidth + ' > ' + vw);
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 && cs.position !== 'fixed') out.push('OUTSIDE ' + Math.round(r.right) + 'px ' + label(el));
    const ox = cs.overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) out.push('INNER-SCROLL ' + el.scrollWidth + '>' + el.clientWidth + ' ' + label(el));
    const isControl = ['BUTTON', 'A', 'LABEL', 'SELECT'].includes(el.tagName) || el.classList.contains('rounded-chip');
    if (isControl && el.scrollWidth > el.clientWidth + 1) out.push((ox === 'visible' ? 'TEXT-OVERFLOW ' : 'CLIPPED ') + label(el));
  }
  return [...new Set(out)];
})()`;

async function scan(p: Page): Promise<string[]> {
  return p.evaluate(SCAN);
}

async function invite(id: string) {
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
  await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return token;
}

const { data: emp } = await db.from('profiles').select('id, role, locale').eq('employee_no', 'test').single();
const original = { role: emp!.role, locale: emp!.locale };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const findings: string[] = [];
let checked = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

  const run = async (label: string, url: string, prep?: (p: Page) => Promise<void>) => {
    for (const w of WIDTHS) {
      await p.setViewportSize({ width: w, height: 800 });
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      if (prep) await prep(p);
      for (const f of await scan(p)) findings.push(`[${label} @${w}] ${f}`);
      checked++;
    }
  };

  // 로그아웃 상태 화면
  await run('로그인(en)', '/login');
  await run('등록-잘못된 초대(en)', '/register?token=nope');
  const tok = await invite(emp!.id);
  await run('등록(en)', `/register?token=${tok}`);
  // 등록 → 직원 화면 (영어)
  await p.setViewportSize({ width: 360, height: 800 });
  await p.goto(`${BASE}/register?token=${tok}`);
  await p.getByRole('button', { name: /Register this phone/ }).click();
  await p.getByText('Your phone is registered.').waitFor();
  for (const f of await scan(p)) findings.push(`[등록 완료+설치 안내(en) @360] ${f}`);
  for (const loc of ['en', 'ko'] as const) {
    await db.from('profiles').update({ locale: loc }).eq('id', emp!.id);
    await run(`직원 홈(${loc})`, '/punch');
    await run(`내 기록(${loc})`, '/punch/records');
    await run(`정정 요청(${loc})`, '/punch/corrections');
    await run(`정정 요청-시각수정(${loc})`, '/punch/corrections', async (pg) => {
      await pg.locator('input[type=radio]').nth(1).check();
    });
  }
  // 관리자 화면 (한국어·영어)
  await db.from('profiles').update({ role: 'admin' }).eq('id', emp!.id);
  for (const loc of ['ko', 'en'] as const) {
    await db.from('profiles').update({ locale: loc }).eq('id', emp!.id);
    await run(`관리자 홈(${loc})`, '/admin?practice=1', async (pg) => {
      await pg.locator('[role=tablist] button').nth(1).click();
    });
    await run(`처리함(${loc})`, '/admin/inbox?practice=1');
    await run(`기록(${loc})`, '/admin/records?practice=1');
    await run(`직원(${loc})`, '/admin/members');
    await run(`더보기(${loc})`, '/admin/more');
    await run(`진단(${loc})`, '/admin/diag');
  }
  // 초대 창 (직원 카드의 "초대 링크 보내기" → 확인)
  await db.from('profiles').update({ locale: 'ko' }).eq('id', emp!.id);
  for (const w of [320, 360, 1280]) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.goto(`${BASE}/admin/members`);
    await p.getByRole('button', { name: /초대 링크 보내기/ }).first().click();
    for (const f of await scan(p)) findings.push(`[직원-초대 확인 @${w}] ${f}`);
    await p.getByRole('button', { name: '만들기' }).first().click();
    await p.locator('text=링크 보내기 (문자·카카오톡)').first().waitFor({ timeout: 15000 });
    for (const f of await scan(p)) findings.push(`[직원-초대 QR 창 @${w}] ${f}`);
    checked += 2;
  }
} catch (e) {
  findings.push(`검수 중단: ${(e as Error).message.split('\n')[0]}`);
} finally {
  await browser.close();
  await db.from('profiles').update(original).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`검사한 화면×폭: ${checked}`);
  console.log(findings.length ? findings.join('\n') : '넘치는 곳 없음');
  if (findings.length) process.exitCode = 1;
}
