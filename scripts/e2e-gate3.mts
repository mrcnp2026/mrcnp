// 게이트 3 실제 브라우저 확인 — Chrome(이 PC에 설치된 것)을 자동으로 열고, Chrome의 "가상 인증기"를 폰 대신 쓴다.
// 가상 인증기는 진짜 폰과 같은 패스키 절차를 밟는다 (화면 잠금 확인 = 통과로 설정).
//   npm run e2e:gate3 -- <관리자 초대 링크>
// 앱이 켜져 있어야 한다 (npm run start). 360px 화면 캡처를 checks/화면-캡처/ 에 남긴다 (가짜 데이터만).
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';

const adminInvite = process.argv[2];
if (!adminInvite) throw new Error('관리자 초대 링크를 넘기세요');
const BASE = new URL(adminInvite).origin;
const SHOTS = path.join(import.meta.dirname, '..', '..', 'checks', '화면-캡처');
const results: string[] = [];
const ok = (m: string) => results.push(`PASS ${m}`);
const bad = (m: string) => results.push(`FAIL ${m}`);
const check = (cond: boolean, m: string) => (cond ? ok(m) : bad(m));

async function phone(ctx: BrowserContext, page: Page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
}

async function noHorizontalScroll(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!over, `${label}: 360px에서 가로 스크롤 없음`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `①-2_게이트3_${name}.png`), fullPage: true });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const viewport = { width: 360, height: 780 };
try {
  // ── 1. 관리자: 초대 링크로 폰 등록 → 직원 탭 ──
  const adminCtx = await browser.newContext({ viewport, locale: 'ko-KR' });
  const a = await adminCtx.newPage();
  await phone(adminCtx, a);
  await a.goto(adminInvite);
  await shot(a, '01_관리자_폰등록');
  check((await a.locator('h1').innerText()).length > 0, '관리자 초대 화면이 열림');
  await a.getByRole('button').filter({ hasText: /등록|Register/ }).click();
  await a.getByText(/등록되었습니다|registered/).waitFor({ timeout: 15000 });
  ok('관리자 폰 등록 완료 (가상 인증기)');
  await a.getByRole('button').filter({ hasText: /계속|Continue/ }).click();
  await a.waitForURL('**/admin/members', { timeout: 15000 });
  ok('등록 직후 로그인되어 관리자 직원 탭으로 이동');
  await noHorizontalScroll(a, '관리자 직원 탭');
  await shot(a, '02_관리자_직원탭');

  // 같은 초대 링크 재사용 → 거부
  const again = await adminCtx.newPage();
  await again.goto(adminInvite);
  check(/만료|사용|expired|used/.test(await again.locator('main').innerText()), '쓴 초대 링크를 다시 열면 사용할 수 없다고 나옴');
  await again.close();

  // ── 2. 직원 추가 (사번 test, 영어) → 초대 QR ──
  await a.locator('input[name=name]').fill('시험 직원');
  await a.locator('input[name=employeeNo]').fill('test');
  await a.locator('select[name=locale]').selectOption('en');
  await a.getByRole('button').filter({ hasText: /초대 QR 만들기/ }).click();
  const linkEl = a.locator('p.break-all');
  await linkEl.waitFor({ timeout: 15000 });
  const testInvite = (await linkEl.innerText()).trim();
  check(testInvite.startsWith(`${BASE}/register?token=`), '직원 추가 후 초대 QR·링크가 나옴');
  await shot(a, '03_관리자_초대QR');
  await noHorizontalScroll(a, '초대 QR 화면');

  // 같은 사번 다시 추가 → 거부
  await a.getByRole('button').filter({ hasText: /닫기/ }).click();
  await a.locator('input[name=name]').fill('중복');
  await a.locator('input[name=employeeNo]').fill('test');
  await a.getByRole('button').filter({ hasText: /초대 QR 만들기/ }).click();
  await a.getByText('이미 있는 사번입니다.').waitFor({ timeout: 10000 });
  ok('같은 사번은 다시 추가되지 않음');

  // ── 3. 시험 직원: 다른 폰(새 가상 인증기)으로 등록 → 영어 홈 ──
  const empCtx = await browser.newContext({ viewport, locale: 'ko-KR' }); // 브라우저가 한국어여도 직원 언어(en)로 나와야 함
  const e = await empCtx.newPage();
  await phone(empCtx, e);
  await e.goto(testInvite);
  const regText = await e.locator('main').innerText();
  check(regText.includes('Register your phone') && regText.includes('시험 직원'), '직원 초대 화면이 직원 언어(영어)로 열림');
  check(!/[가-힣]/.test(regText.replace('시험 직원', '')), '직원 초대 화면에 이름 말고는 한국어가 없음');
  await noHorizontalScroll(e, '직원 폰 등록 화면(영어)');
  await shot(e, '04_직원_폰등록_영어');
  await e.getByRole('button', { name: /Register this phone/ }).click();
  await e.getByText('Your phone is registered.').waitFor({ timeout: 15000 });
  await e.getByRole('button', { name: 'Continue' }).click();
  await e.waitForURL('**/punch', { timeout: 15000 });
  check((await e.locator('main').innerText()).includes('Hello, 시험 직원'), '직원 홈이 영어로 뜸');
  await noHorizontalScroll(e, '직원 홈(영어)');
  await shot(e, '05_직원_홈_영어');

  // 언어 목록: 검수된 언어만 (English, 한국어). vi·th 없음
  const opts = await e.locator('select option').allInnerTexts();
  check(JSON.stringify(opts.sort()) === JSON.stringify(['English', '한국어'].sort()), `언어 목록에 검수된 언어만 (${opts.join(', ')})`);

  // ── 4. 로그아웃 → 같은 폰으로 다시 로그인 ──
  await e.getByRole('button', { name: /Sign out/ }).click();
  await e.waitForURL('**/login');
  await noHorizontalScroll(e, '로그인 화면(영어)');
  await shot(e, '06_로그인_영어');
  await e.getByRole('button', { name: /Sign in with my phone/ }).click();
  await e.waitForURL('**/punch', { timeout: 15000 });
  ok('로그아웃 후 같은 폰으로 다시 로그인됨 (사번 입력 없음)');

  // 직원은 관리자 화면에 못 들어감
  await e.goto(`${BASE}/admin/members`);
  check(e.url().endsWith('/punch'), '직원이 관리자 주소를 열면 직원 홈으로 돌려보냄');
  const r = await e.request.post(`${BASE}/api/admin/employees`, { data: { name: 'x', employeeNo: 'zz1', locale: 'en' } });
  check(r.status() === 403 && !!r.headers()['x-request-id'], `직원이 직원 추가 API를 부르면 거부 (${r.status()}) + 문의번호 있음`);

  // ── 5. 등록 안 된 폰으로 로그인 → 거부 ──
  const strangerCtx = await browser.newContext({ viewport });
  const s = await strangerCtx.newPage();
  await phone(strangerCtx, s);
  await s.goto(`${BASE}/login`);
  await s.getByRole('button', { name: /Sign in with my phone/ }).click();
  await s.locator('[role=alert].rounded-card').waitFor({ timeout: 15000 });
  check(s.url().endsWith('/login'), '등록된 패스키가 없는 폰은 로그인되지 않음');
  check((await s.locator('[role=alert].rounded-card').innerText()).includes('not registered'), '등록 안 된 폰에 "등록되지 않았을 수 있음" 안내가 나옴');
  await s.getByRole('button', { name: /Sign in with my phone/ }).waitFor();
  await shot(s, '07_로그인_실패_안내');

  // ── 6. 한국어로 바꾸기 → 시각과 무관, 화면만 바뀜 ──
  await e.goto(`${BASE}/punch`);
  await e.locator('select').selectOption('ko');
  await e.getByText('시험 직원님, 안녕하세요').waitFor({ timeout: 10000 });
  ok('직원이 언어를 한국어로 바꾸면 화면이 바뀜');
  await shot(e, '08_직원_홈_한국어');
  await e.locator('select').selectOption('en');
  await e.getByText('Hello, 시험 직원').waitFor({ timeout: 10000 });
} catch (err) {
  bad(`중단: ${(err as Error).message.split('\n')[0]}`);
} finally {
  await browser.close();
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
}
