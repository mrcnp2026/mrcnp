// 홈 검사 (2026-10-11 의뢰인: 시프티 홈의 「현재 근무 상황」 · 주 고르기 · 홈 설정) — 검사 전용 관리자(e2e-audit)로 연다. 읽기만 한다(홈 설정은 이 브라우저의 쿠키만 바꾼다).
//   npx tsx scripts/e2e-home.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 기록·일정을 만들지 않는다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword, openDrawer, unlockConsole } from './lib/e2e-password.ts';

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
  await unlockConsole(p, db as never, emp!.id); // 통합설정 숫자 4자리 (2026-10-14)
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
  // ── 직원 탭: 현재직원 / 미합류 / 비활성 · 직원 상세의 ← 제목 줄 (2026-10-11) ──
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/admin/members`);
  await p.waitForLoadState('networkidle');
  const mt = (await p.locator('main nav').first().locator('a').allTextContents()).map((x) => x.replace(/\d+/g, '').trim());
  check(mt.join() === '현재직원,미합류,비활성' && (await p.locator('main nav a[aria-current="page"]').first().textContent())?.includes('현재직원') === true, '직원 탭: 현재직원 · 미합류 · 비활성 (숫자와 함께)', mt.join());
  await shot('45-직원-목록');
  await p.locator('main nav').first().getByRole('link', { name: /비활성/ }).click();
  await p.waitForURL(/f=inactive/);
  check(true, '비활성 탭으로 이동');
  await p.goto(`${BASE}/admin/members/${emp!.id}`);
  await p.waitForLoadState('networkidle');
  check((await p.locator('header.sticky').locator('visible=true').count()) === 0 && (await p.getByRole('link', { name: '뒤로' }).count()) >= 1 && (await p.getByRole('heading', { level: 1 }).count()) === 1, '직원 상세: 로고 줄 없이 ← 제목 줄, 머리글은 이름 하나');
  await shot('46-직원-상세');
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of ['/admin/members', `/admin/members/${emp!.id}`]) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const mw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(mw <= w + (w === 320 ? 3 : 0), `가로 넘침 없음 @${w} ${url.replace(emp!.id, '…')}`, `${mw}px`);
    }
  }

  // ── 내 근태현황(출퇴근기록 = 월간 · 근무일정 = 주간, 2026-10-15 달력 모양) ──
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 844 });
    for (const [url, name] of [['/punch/records', '47-내-기록'], ['/punch/schedule', '48-내-일정']] as const) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw3 = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw3 <= w, `가로 넘침 없음 @${w} ${url}`, `${sw3}px`);
      if (w === 390) await shot(name);
    }
  }
  check((await p.locator('[data-week-days] > li').count()) === 7 && (await p.locator('[data-day-detail]').count()) === 1, '근무일정: 주간 7일 칸 + 고른 날 상세', String(await p.locator('[data-week-days] > li').count()));

  // ── 왼쪽 메뉴: 대분류 강조 · 지금 화면 표시 (2026-10-11 의뢰인) ──
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  await openDrawer(p);
  const drawer = p.getByRole('dialog');
  await drawer.waitFor({ timeout: 10000 });
  // 2026-10-15 서랍 개편(의뢰인: 「메뉴가 너무 많아 한참 내려야 한다」): 모드 탭 · 지금 모드 메뉴만 · 앱 묶음은 접힘 · 메뉴 찾기
  const tabs = drawer.getByRole('tab');
  check((await tabs.count()) === 2 && (await drawer.getByRole('tab', { name: '직원 모드' }).getAttribute('aria-selected')) === 'true', '폰 메뉴: [직원 모드 | 관리자 모드] 탭, 직원 화면에서는 직원 모드가 골라져 있다');
  check((await drawer.locator('a[href^="/admin"]').count()) === 0, '폰 메뉴(직원 모드): 관리자 메뉴가 섞여 있지 않다');
  await shot('43-폰-메뉴');
  await drawer.getByRole('tab', { name: '관리자 모드' }).click();
  const folded = drawer.locator('[data-drawer-list] button[aria-expanded]');
  const fc = await folded.count();
  check(fc >= 4 && (await drawer.locator('[data-drawer-list] button[aria-expanded="true"]').count()) === 0, '폰 메뉴(관리자 모드): 앱 묶음은 접혀 있다(지금 앱이 아니므로)', `${fc}묶음`);
  const listH = await drawer.locator('[data-drawer-list]').evaluate((e) => [e.scrollHeight, e.clientHeight]);
  check(listH[0] <= listH[1], '폰 메뉴(관리자 모드): 스크롤 없이 한 화면에 다 보인다', `${listH[0]}/${listH[1]}px`);
  await folded.first().click();
  check((await folded.first().getAttribute('aria-expanded')) === 'true', '폰 메뉴: 묶음을 누르면 펼쳐진다');
  await drawer.getByRole('searchbox').fill('급여대장');
  check((await drawer.locator('[data-drawer-list] a').count()) >= 1 && (await drawer.locator('[data-drawer-list] button[aria-expanded]').count()) === 0, '폰 메뉴: 「메뉴 찾기」에 쓰면 맞는 항목만 한 목록으로');
  await drawer.getByRole('searchbox').fill('없는메뉴zz');
  check((await drawer.getByText('맞는 메뉴가 없습니다.').count()) === 1, '폰 메뉴: 맞는 것이 없으면 안내');
  await shot('43b-폰-메뉴-관리자');
  await p.keyboard.press('Escape');
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/jobs`);
  await p.waitForLoadState('networkidle');
  // PC 틀 (2026-10-14 결정 사항 개발-20 · 21 · 25): 위 띠 + 앱 띠 + 메뉴 판. 설정 화면(직무)은 통합설정 공간 — 묶음 목록 + 메뉴 판, 지금 화면이 메뉴 판에 표시된다
  const panelNow = p.locator('nav.sticky').nth(1).locator('a[aria-current="page"]');
  check((await p.locator('nav.sticky').count()) === 2 && (await panelNow.count()) === 1 && ((await panelNow.textContent()) ?? '').includes('직무') && (await p.locator('nav.sticky').first().getByRole('heading', { name: '통합설정' }).count()) === 1, 'PC 통합설정: 묶음 목록 옆 메뉴 판에 지금 화면(직무)이 표시됨');
  check(((await p.locator('main').locator('xpath=preceding-sibling::p[1]').textContent()) ?? '').replace(/\s+/g, '') === '통합설정회사설정조직직무', 'PC 통합설정: 본문 위 경로 「통합설정 › 회사설정 › 조직 › 직무」');
  await p.goto(`${BASE}/admin/console`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('heading', { level: 2, name: '회사설정' }).count()) === 1 && (await p.getByRole('heading', { level: 2, name: 'App 관리' }).count()) === 1 && (await p.locator('main a[href="/admin/leave/types"]').count()) === 1, '통합설정 첫 화면: 회사설정 · App 관리 전체 메뉴 한 장');
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  const rail = p.locator('nav.sticky').first();
  const labelsOf = async (n: typeof rail) => Promise.all((await n.locator('a').all()).map((a) => a.getAttribute('aria-label')));
  check((await labelsOf(rail)).join() === '오늘 현황,직원 · 조직,근무일정 · 출퇴근,휴가 관리,요청 처리,급여 관리,공지 · 메시지,근태 · 휴가 리포트' && (await p.locator('nav.sticky').count()) === 1, 'PC 관리자 모드: 앱 띠 8개(풀어 쓴 이름), 홈은 메뉴 판 없이 넓게');
  await rail.getByRole('link', { name: '근무일정 · 출퇴근', exact: true }).click();
  await p.waitForURL(/\/admin\/schedule/);
  await p.waitForLoadState('networkidle');
  check((await p.locator('nav.sticky').nth(1).locator('a').allTextContents()).map((x) => x.trim()).join() === '달력형,목록형,달력형,목록형,월 집계,누락 기록,이상자 관리,근태 마감', 'PC 관리자 화면: 근태 메뉴 판에 근무일정 · 출퇴근기록 · 점검/마감 묶음');
  await p.waitForTimeout(400);
  await shot('44-PC-메뉴-패널');
  // 위쪽 검색: 아래 화살표로 메뉴를 골라 Enter → 그 화면, 그냥 Enter → 통합 검색 결과 (2026-10-14)
  const box = p.getByRole('combobox', { name: '검색' });
  await box.fill('인건비');
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter');
  check(await p.waitForURL(/\/admin\/payroll\/labor-cost/, { timeout: 15000 }).then(() => true, () => false), 'PC 위쪽 검색: 「인건비」 → ↓ → Enter → 인건비 현황으로 이동');
  await box.fill('인건비');
  await p.keyboard.press('Enter');
  await p.waitForURL(/\/admin\/search\?q=/, { timeout: 15000 });
  await p.getByRole('heading', { name: '통합 검색' }).waitFor({ timeout: 15000 });
  const found = await p.locator('main').innerText();
  check(found.includes('「인건비」 정확히 일치') && found.includes('인건비 현황') && (await p.getByRole('link', { name: /^전체\(\d+\)$/ }).count()) === 1, 'PC 위쪽 검색: 그냥 Enter → 통합 검색 결과(전체 탭 · 정확히 일치 건수 · 메뉴 결과)');
  await shot('45-통합검색');
  // 내 화면(PC): 같은 틀 — 앱 띠 8개, 공간 전환 단추에서 「내 화면」이 켜짐 + 월 달력
  await p.getByRole('group', { name: '화면 전환' }).getByRole('link', { name: '직원 모드' }).click();
  await p.waitForURL(/\/punch$/);
  await p.getByText('내 근로 통계').waitFor({ timeout: 30000 }); // 화면 이동(클라이언트)이 끝나 새 본문이 그려질 때까지
  check((await labelsOf(p.locator('nav.sticky').first())).join() === '홈,근무일정,출퇴근기록,휴가,요청,급여,소통,조직 · 내 정보' && (await p.getByRole('group', { name: '화면 전환' }).locator('a[aria-current]').textContent()) === '직원 모드', 'PC 직원 모드: 같은 틀의 앱 띠 8개, 「직원 모드」가 켜짐');
  check((await p.getByText('내 근로 통계').isVisible()) && (await p.getByText('내 휴가 통계').isVisible()) && (await p.locator('main .grid-cols-7 > div').count()) >= 35, 'PC 직원 홈: 내 근로 통계 · 내 휴가 통계 · 월 달력');
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
