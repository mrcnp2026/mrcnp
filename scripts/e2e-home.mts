// 홈 검사 (2026-10-11 의뢰인: 시프티 홈의 「현재 근무 상황」 · 주 고르기 · 홈 설정) — 검사 전용 관리자(e2e-audit)로 연다. 읽기만 한다(홈 설정은 이 브라우저의 쿠키만 바꾼다).
//   npx tsx scripts/e2e-home.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 기록·일정을 만들지 않는다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', shift_template_id: null }).eq('id', emp!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name: string) => {
    if (!SHOTS) return;
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');

  // ── 현재 근무 상황 ──
  const card = p.getByRole('heading', { name: '현재 근무 상황' }).locator('xpath=ancestor::*[.//dl][1]');
  check((await p.getByRole('heading', { name: '현재 근무 상황' }).count()) === 1, '관리자 홈에 「현재 근무 상황」 카드');
  const names = await card.locator('dt').allTextContents();
  check(['근무중', '무일정', '간주근로', '지각', '휴가'].every((x) => names.includes(x)), '근무중 · 무일정 · 간주근로 · 지각 · 휴가 인원수', names.join(','));
  check((await card.locator('dd').allTextContents()).every((x) => /^\d+$/.test(x.trim())), '칸마다 숫자');
  check((await card.getByRole('link', { name: /자세히 보기/ }).getAttribute('href')) === '/admin' && (await card.getByText(/\d{2}:\d{2} 기준/).count()) === 1, '불러온 시각 · [자세히 보기] → 현황');
  await shot('40-홈');

  // ── 주 고르기 ──
  check((await p.getByRole('heading', { name: '이번주 근무' }).count()) === 1 && (await p.getByRole('link', { name: '지난 주' }).count()) === 1 && (await p.getByRole('link', { name: '다음 주' }).count()) === 1, '이번주 근무 카드에 지난 주 · 다음 주');
  await p.getByRole('link', { name: '지난 주' }).click();
  await p.waitForURL(/\/punch\?w=\d{4}-\d{2}-\d{2}/);
  await p.getByRole('heading', { name: '주간 근무' }).waitFor({ timeout: 20000 });
  const week = p.getByRole('heading', { name: '주간 근무' }).locator('xpath=ancestor::*[.//ol][1]');
  check((await week.locator('ol li').count()) === 7 && (await week.locator('ol').getByText('오늘', { exact: true }).count()) === 0, '지난 주: 요일 7칸 · 「오늘」 칸 없음');
  await shot('41-홈-지난주');
  await p.getByRole('link', { name: '다음 주' }).click();
  await p.waitForURL(/\/punch$/);
  check(await p.getByRole('heading', { name: '이번주 근무' }).waitFor({ timeout: 20000 }).then(() => true, () => false), '다음 주를 누르면 이번 주로 돌아옴');
  await p.goto(`${BASE}/punch?w=2019-01-01`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('link', { name: '지난 주' }).count()) === 0, '너무 먼 과거는 범위 끝에서 멈춤 (지난 주 화살표 없음)');

  // ── 홈 설정 ──
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  await p.getByRole('link', { name: '홈 설정' }).click();
  await p.waitForURL(/\/punch\/home-settings/);
  await p.getByRole('heading', { name: '홈 설정', exact: true }).waitFor({ timeout: 20000 });
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(500);
  const sw = p.getByRole('switch');
  check((await sw.count()) === 5 && (await p.locator('header').locator('visible=true').count()) === 0, '홈 설정: 카드 5개 스위치 (← 제목 줄)', String(await sw.count()));
  await shot('42-홈-설정');
  await p.getByRole('switch', { name: '현재 근무 상황 카드' }).click();
  await p.getByRole('switch', { name: '이번주 근무 카드' }).click();
  await p.waitForTimeout(500);
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('heading', { name: '현재 근무 상황' }).count()) === 0 && (await p.getByRole('heading', { name: '이번주 근무' }).count()) === 0 && (await p.getByRole('heading', { name: '오늘 근무' }).count()) === 1, '끈 카드는 홈에서 사라지고 「오늘 근무」는 남음');
  await p.goto(`${BASE}/punch/home-settings`);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(500);
  check(!(await p.getByRole('switch', { name: '현재 근무 상황 카드' }).isChecked()), '설정 화면에 꺼진 상태가 남아 있음');
  await p.getByRole('switch', { name: '현재 근무 상황 카드' }).click();
  await p.getByRole('switch', { name: '이번주 근무 카드' }).click();
  await p.waitForTimeout(500);
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('heading', { name: '현재 근무 상황' }).count()) === 1 && (await p.getByRole('heading', { name: '이번주 근무' }).count()) === 1, '다시 켜면 돌아옴');

  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of ['/punch', '/punch/home-settings']) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw2 = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw2 <= w, `가로 넘침 없음 @${w} ${url}`, `${sw2}px`);
    }
  }
  // ── 왼쪽 메뉴: 대분류 강조 · 지금 화면 표시 (2026-10-11 의뢰인) ──
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  await p.locator('[data-menu-open]').click();
  const drawer = p.getByRole('dialog');
  await drawer.waitFor({ timeout: 10000 });
  const heads = await drawer.locator('p.font-extrabold').count();
  check(heads >= 4, '폰 메뉴: 대분류 제목이 굵은 글자 + 색 막대', `${heads}개`);
  await shot('43-폰-메뉴');
  await p.keyboard.press('Escape');
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/jobs`);
  await p.waitForLoadState('networkidle');
  const side = p.locator('nav.sticky');
  check((await side.locator('p.font-extrabold').count()) >= 4 && (await side.locator('a[aria-current="page"]').count()) === 1 && ((await side.locator('a[aria-current="page"]').getAttribute('class')) ?? '').includes('border-primary'), 'PC 메뉴: 대분류 강조 · 지금 화면은 왼쪽 색 막대 + 바탕색');
  await shot('44-PC-메뉴');
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
