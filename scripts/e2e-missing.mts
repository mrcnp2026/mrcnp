// 출근/퇴근 누락 기록 화면 검사 (2026-10-10) — 검사 전용 관리자(e2e-audit)로 화면을 열어 탭·기간·줄을 본다.
//   npx tsx scripts/e2e-missing.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 읽기만 한다 — 기록·요청을 만들지 않는다. (검사 계정은 목록에서 빠지므로 판정 자체는 tests/missing-list.test.ts가 본다)
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
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const kst = (off: number) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);

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
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  const ready = () => p.getByRole('heading', { name: '출근/퇴근 누락 기록' }).waitFor({ timeout: 30000 });
  const tabN = async (name: string) => Number(((await p.getByRole('link', { name: new RegExp(`^${name}`) }).first().textContent()) ?? '').replace(/\D/g, ''));
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  // ── 메뉴 → 화면 ──
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  await p.locator('[data-menu-open]').click();
  await p.getByRole('dialog').waitFor();
  await p.getByRole('dialog').getByRole('link', { name: '누락 기록', exact: true }).click();
  await p.waitForURL(/\/admin\/missing/);
  await ready();
  check(true, '왼쪽 메뉴 「누락 기록」 → 화면이 열림');
  check((await p.getByRole('link', { name: /^퇴근 누락/ }).getAttribute('aria-current')) === 'page', '처음에는 「퇴근 누락」 탭');
  check((await p.getByLabel('시작일').inputValue()) === kst(-13) && (await p.getByLabel('종료일').inputValue()) === kst(0), '기본 기간은 오늘까지 14일', `${await p.getByLabel('시작일').inputValue()} ~ ${await p.getByLabel('종료일').inputValue()}`);
  check(await p.getByRole('button', { name: '이 기간으로 보기' }).isDisabled(), '기간을 바꾸기 전에는 「보기」 버튼이 꺼져 있음');

  // ── 탭: 건수 = 줄 수 ──
  for (const [name, key] of [['퇴근 누락', 'out'], ['출근 누락', 'in']] as const) {
    await p.goto(`${BASE}/admin/missing?tab=${key}`);
    await ready();
    const n = await tabN(name);
    const rows = await p.locator('main li a[href^="/admin/records/"]').count();
    check(n === rows, `「${name}」 탭의 건수와 줄 수가 같음`, `${n}건 / ${rows}줄`);
    if (rows === 0) check((await p.getByText(new RegExp(`이 기간에 ${name}이 없습니다`)).count()) === 1, `「${name}」이 없으면 안내 문구`);
    else check((await p.locator('main li a[href^="/admin/records/"]').first().getAttribute('href'))!.includes('?m='), '줄을 누르면 그 직원의 그 달 기록으로');
    await shot(`0${key === 'out' ? 1 : 2}-${name.replace(' ', '-')}`);
  }
  check((await p.getByText(emp!.name, { exact: true }).count()) === 0, '검사 전용 계정은 목록에 나오지 않음');

  // ── 기간 바꾸기 ──
  await p.getByLabel('시작일').fill(kst(-40));
  await p.getByRole('button', { name: '이 기간으로 보기' }).click();
  await p.waitForURL(new RegExp(`from=${kst(-40)}`));
  await ready();
  check(p.url().includes('tab=in'), '기간을 바꿔도 보던 탭 그대로');
  await p.goto(`${BASE}/admin/missing?from=2020-01-01&to=2099-01-01`);
  await ready();
  check((await p.getByLabel('종료일').inputValue()) === kst(0) && (await p.getByLabel('시작일').inputValue()) === kst(-61), '너무 긴 기간·앞날은 오늘까지 62일로 줄어듦', `${await p.getByLabel('시작일').inputValue()} ~ ${await p.getByLabel('종료일').inputValue()}`);

  // ── 현황판의 「미기록」 → 여기로 · 가로 넘침 · PC ──
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  check((await p.locator('a[href="/admin/missing"]').count()) >= 1, '현황판의 「미기록이 있는 직원」이 이 화면으로 이어짐');
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.goto(`${BASE}/admin/missing?tab=in&from=${kst(-40)}`);
    await ready();
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= w, `가로 넘침 없음 @${w}`, `${sw}px`);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/missing`);
  await ready();
  check((await p.locator('aside, nav').getByRole('link', { name: '누락 기록', exact: true }).count()) >= 1, 'PC 왼쪽 메뉴에 「누락 기록」');
  await shot('03-PC-누락-기록');
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
