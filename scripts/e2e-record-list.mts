// 출퇴근기록 목록 화면 검사 (2026-10-10) — 검사 전용 관리자(e2e-audit)로 열어 위 줄(검색·거르기·기간·내 기록)과 날짜 묶음을 본다. 읽기만 한다.
//   npx tsx scripts/e2e-record-list.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
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
const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;

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
  const ready = async () => {
    await p.getByRole('search').waitFor({ timeout: 30000 });
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(400);
  };
  const rows = () => p.locator('main li a[href^="/admin/records/"]');
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  // ── 하단 탭 → 목록 ──
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  await p.locator('nav.fixed').getByRole('link', { name: '출퇴근기록' }).click();
  await p.waitForURL(/\/admin\/records\/list/);
  await ready();
  check(true, '하단 「출퇴근기록」 탭 → 날짜별 기록 목록');
  const month1 = `${kst(0).slice(0, 8)}01`;
  check((await p.getByRole('button', { name: '기간 고르기' }).textContent())!.includes(`${md(month1)} - ${md(kst(0))}`), '기본 기간은 이번 달 1일 ~ 오늘', (await p.getByRole('button', { name: '기간 고르기' }).textContent()) ?? '');
  // 로고 줄 없이 ☰가 검색 줄 안에 있고, 누르면 왼쪽 메뉴가 열린다 (2026-10-11)
  check((await p.locator('header').locator('visible=true').count()) === 0, '목록 화면에는 로고 줄이 없음');
  await p.getByRole('button', { name: '메뉴', exact: true }).locator('visible=true').click();
  check(await p.getByRole('dialog').waitFor({ timeout: 5000 }).then(() => true, () => false), '검색 줄의 ☰로 왼쪽 메뉴가 열림');
  await p.keyboard.press('Escape');
  check((await p.getByRole('link', { name: '내 기록', exact: true }).count()) === 1 && (await p.getByRole('searchbox').count()) === 1 && (await p.getByRole('button', { name: '부서로 거르기' }).count()) <= 1, '위 줄에 검색 칸 · 기간 · [내 기록]');
  const n = await rows().count();
  const heads = await p.locator('main section > h2').count();
  check(n > 0 && heads > 0, '날짜 머리줄 아래에 기록이 한 줄씩', `${heads}일 · ${n}줄`);
  check(/\d+시간 \d+분/.test((await p.locator('main section > h2').first().textContent()) ?? ''), '날짜 머리줄 오른쪽에 그날 합계');
  check(/^\d{2}:\d{2}/.test(((await rows().first().textContent()) ?? '').trim()), '한 줄은 출근 시각으로 시작');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '01-출퇴근기록-목록.png') });

  // ── 줄을 누르면 상세 (2026-10-11) ──
  await rows().first().click();
  await p.waitForURL(/\/admin\/records\/[^/]+\/\d{4}-\d{2}-\d{2}/);
  await p.getByRole('heading', { name: '출퇴근기록', exact: true }).waitFor({ timeout: 20000 });
  check((await p.locator('header').locator('visible=true').count()) === 0 && (await p.getByRole('link', { name: '수정', exact: true }).count()) === 1 && (await p.getByRole('link', { name: '목록으로' }).count()) === 1, '상세: 로고 줄 없이 「← 출퇴근기록 … 수정」');
  check(/\d{2}:\d{2} -/.test((await p.locator('main p.text-3xl').textContent()) ?? '') && (await p.getByText(/근무 \d+시간 \d+분 \/ 휴게 \d+시간 \d+분/).count()) === 1, '상세: 큰 시각 · 근무/휴게', (await p.locator('main p.text-3xl').textContent()) ?? '');
  const labels = await p.locator('main dt').allTextContents();
  check(['직원', '지점', '직무', '휴게시간', '근무일정', '출근 장소', '퇴근 장소', '생성일자'].every((x) => labels.includes(x)), '상세: 항목 — 값 줄 8개', labels.join(','));
  await p.waitForTimeout(400);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '03-출퇴근기록-상세.png'), fullPage: true });
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= w, `상세: 가로 넘침 없음 @${w}`, `${sw}px`);
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.getByRole('link', { name: '수정', exact: true }).click();
  await p.waitForURL(/\/admin\/records\/[^/]+\?m=/);
  check(true, '상세의 [수정] → 그 직원의 그 달 기록');
  await p.goto(`${BASE}/admin/records/list`);
  await ready();

  // ── + 버튼 → 기록 추가 (2026-10-11). 열어 보기만 하고 저장하지 않는다 ──
  await p.locator('[data-fab]').click();
  const addSheet = p.getByRole('dialog');
  await addSheet.waitFor({ timeout: 10000 });
  const opts = await addSheet.getByLabel('직원').locator('option').count();
  check(opts >= 2, '+ 버튼 → 기록 추가 창에 직원 고르기', `${opts - 1}명`);
  await addSheet.getByLabel('직원').selectOption({ index: 1 });
  check(await addSheet.getByLabel('사유').first().waitFor({ timeout: 10000 }).then(() => true, () => false), '직원을 고르면 날짜·시각·사유 칸이 열림');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '04-기록-추가-창.png') });
  await p.keyboard.press('Escape');

  // ── 검색 ──
  const firstName = ((await rows().first().locator('span.flex-1 > span.font-bold').first().textContent()) ?? '').trim();
  await p.getByRole('searchbox').fill(firstName);
  await p.getByRole('searchbox').press('Enter');
  await p.waitForURL(/q=/);
  await ready();
  const names = await rows().locator('span.flex-1 > span.font-bold').allTextContents();
  check(names.length > 0 && names.every((x) => x.includes(firstName)), `이름으로 검색하면 그 사람 줄만 (${firstName})`, `${names.length}줄`);
  await p.getByRole('searchbox').fill('없는이름zz');
  await p.getByRole('searchbox').press('Enter');
  await p.waitForURL(/q=%EC%97%86/);
  await ready();
  check((await rows().count()) === 0 && (await p.getByText('이 기간에 기록이 없습니다.').count()) === 1, '없는 이름이면 안내 문구');

  // ── 기간 ──
  await p.goto(`${BASE}/admin/records/list`);
  await ready();
  await p.getByRole('button', { name: '기간 고르기' }).click();
  await p.getByLabel('시작일').fill(kst(-3));
  await p.getByRole('button', { name: '이 기간으로 보기' }).click();
  await p.waitForURL(new RegExp(`from=${kst(-3)}`));
  await ready();
  check((await p.getByRole('button', { name: '기간 고르기' }).textContent())!.includes(md(kst(-3))), '기간을 바꾸면 그 기간으로 다시 보임');
  check((await p.locator('main section > h2').count()) <= 4, '바꾼 기간(4일) 안의 날짜만 나옴');

  // ── 이어지는 길 · 가로 넘침 · PC ──
  await p.getByRole('link', { name: /월 집계/ }).click();
  await p.waitForURL(/\/admin\/records(\?|$)/);
  check((await p.getByRole('link', { name: /기록 목록/ }).first().waitFor({ timeout: 20000 }).then(() => true, () => false)), '「월 집계 · 내려받기」로 가고, 거기서 다시 목록으로 올 수 있음');
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.goto(`${BASE}/admin/records/list`);
    await ready();
    await p.getByRole('button', { name: '기간 고르기' }).click();
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= w, `가로 넘침 없음 @${w} (기간 칸을 펼친 채로)`, `${sw}px`);
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/records/list`);
  await ready();
  check((await p.locator('aside, nav').getByRole('link', { name: '기록 목록', exact: true }).count()) >= 1, 'PC 왼쪽 메뉴에 「기록 목록」');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '02-PC-출퇴근기록-목록.png') });
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
