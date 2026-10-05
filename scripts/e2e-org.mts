// 조직도 · 직원 등록/수정 실제 서버 검사 (2026-10-05).
//   npx tsx scripts/e2e-org.mts [사진 저장 폴더]   (앱이 켜져 있어야 한다)
// 검사 전용 계정 e2e-audit(검사 동안만 관리자)과 검사 전용 그룹 'e2e-부서' › 'e2e-팀'을 쓴다.
// 그룹은 지울 수 없으므로(숨기기만) 한 번 만든 것을 다시 쓴다 — 끝나면 숨기고, 숨긴 목록 화면에서도 e2e- 이름은 보이지 않는다.
// 새 직원 계정은 만들지 않는다 (계정은 지울 수 없다) — 등록은 서버가 막는 입력까지만 확인한다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`);
  if (!ok) fails++;
};
const groupByName = async (name: string) => (await db.from('org_groups').select('id, active, parent_id').eq('name', name).maybeSingle()).data;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  // 화면 오류(콘솔 error·예외)를 모은다 — 서버가 일부러 돌려준 4xx 응답 줄은 뺀다
  const pageErrors: string[] = [];
  // FULL_ERRORS=1 이면 오류 전문을 본다 (원인 찾을 때)
  const firstLine = (s: string) => (process.env.FULL_ERRORS ? s.slice(0, 2500) : s.split(/\r?\n/)[0].slice(0, 200));
  p.on('pageerror', (e) => pageErrors.push(`${new URL(p.url()).pathname}: ${firstLine(e.message)}`));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && pageErrors.push(`${new URL(p.url()).pathname}: ${firstLine(m.text())}`));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(`${BASE}/register?token=${token}`);
  await p.getByRole('button', { name: /이 폰 등록하기/ }).click();
  await p.getByText('폰이 등록되었습니다.').waitFor({ timeout: 30000 });
  const post = (url: string, body?: unknown) =>
    p.evaluate(async ([u, b]) => {
      const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    }, [url, body] as const);
  // 사진은 화면이 다 살아난 뒤에 찍는다 — 그 전에 찍으면 사진 도구가 입력칸에 붙이는 임시 스타일 때문에 '서버와 화면이 다르다'는 가짜 경고가 뜬다
  const shot = async (name: string) => {
    if (!SHOTS) return;
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };

  // ── 조직도: 부서 → 팀 ──
  let dept = await groupByName('e2e-부서');
  if (dept) {
    if (!dept.active) await post(`/api/admin/groups/${dept.id}`, { active: true });
    check(true, '전에 만든 검사용 부서를 다시 씀');
  } else {
    await p.goto(`${BASE}/admin/members/groups`);
    await p.getByRole('button', { name: '부서 추가' }).click();
    await p.getByPlaceholder('부서 이름').fill('e2e-부서');
    await p.getByRole('button', { name: '저장' }).click();
    await p.getByText('e2e-부서').first().waitFor({ timeout: 20000 });
    dept = await groupByName('e2e-부서');
    check(!!dept?.active && dept.parent_id === null, '화면에서 부서 추가');
  }
  let team = await groupByName('e2e-팀');
  if (team) {
    if (!team.active) await post(`/api/admin/groups/${team.id}`, { active: true });
    check(true, '전에 만든 검사용 팀을 다시 씀');
  } else {
    await p.goto(`${BASE}/admin/members/groups`);
    const card = p.locator('section', { hasText: 'e2e-부서' });
    await card.getByRole('button', { name: '팀 추가' }).click();
    await card.getByPlaceholder('팀 이름').fill('e2e-팀');
    await card.getByRole('button', { name: '저장' }).click();
    await card.getByText('e2e-팀').waitFor({ timeout: 20000 });
    team = await groupByName('e2e-팀');
    check(!!team?.active && team.parent_id === dept!.id, '화면에서 팀 추가 (부서 밑)');
  }
  let r = await post('/api/admin/groups', { name: 'e2e-부서' });
  check(r.status === 409 && r.json.error === 'duplicate_group', '같은 이름 부서는 차단', JSON.stringify(r.json.error));
  r = await post('/api/admin/groups', { name: 'e2e-3단계', parentId: team!.id });
  check(r.status === 400 && r.json.error === 'invalid_group', '팀 밑에 또 그룹(3단계)은 차단');
  r = await post('/api/admin/groups', { name: '   ' });
  check(r.status === 400 && r.json.error === 'invalid_group_name', '빈 이름 차단');

  // ── 직원 정보 수정: 소속·휴대폰·직급 ──
  const profile = (over: Record<string, unknown>) => ({ name: '검사용(자동)', employeeNo: 'e2e-audit', locale: 'ko', phone: '', jobTitle: '', groupId: '', joinedOn: '', ...over });
  r = await post(`/api/admin/employees/${emp!.id}/profile`, profile({ phone: '010-abcd' }));
  check(r.status === 400 && r.json.error === 'invalid_phone', '틀린 휴대폰 번호 차단');
  r = await post(`/api/admin/employees/${emp!.id}/profile`, profile({ groupId: '11111111-1111-1111-1111-111111111111' }));
  check(r.status === 400 && r.json.error === 'invalid_group', '없는 그룹 차단');
  r = await post(`/api/admin/employees/${emp!.id}/profile`, profile({ employeeNo: 'admin' }));
  check(r.status === 409 && r.json.error === 'duplicate_no', '다른 직원의 사번으로는 못 바꿈');
  await p.goto(`${BASE}/admin/members/${emp!.id}`);
  await p.locator('input[name=phone]').fill('010 1234 5678');
  await p.locator('input[name=jobTitle]').fill('대리');
  await p.locator('select[name=groupId]').selectOption(team!.id);
  await p.getByRole('button', { name: '저장', exact: true }).click();
  await p.getByText('저장했습니다.').waitFor({ timeout: 20000 });
  const { data: saved } = await db.from('profiles').select('phone, job_title, group_id, updated_by').eq('id', emp!.id).single();
  check(saved?.phone === '01012345678' && saved.job_title === '대리' && saved.group_id === team!.id && saved.updated_by === emp!.id, '화면에서 저장: 휴대폰·직급·소속·고친 사람', JSON.stringify(saved));
  await p.reload();
  check((await p.getByText('대리 · e2e-부서 › e2e-팀').count()) > 0, '상세 머리에 "직급 · 부서 › 팀"');
  await shot('org-detail');

  // ── 직원 목록이 부서 › 팀으로 묶인다 ──
  await p.goto(`${BASE}/admin/members`);
  const sec = p.locator('section', { hasText: 'e2e-부서' }).first();
  check((await sec.getByRole('heading', { name: /e2e-팀/ }).count()) > 0 && (await sec.getByText('검사용(자동)').count()) > 0, '직원 목록: 부서 묶음 › 팀 › 직원');
  await shot('org-members');
  r = await post(`/api/admin/groups/${team!.id}`, { active: false });
  check(r.status === 409 && r.json.error === 'group_in_use', '직원이 있는 팀은 숨길 수 없음');
  r = await post(`/api/admin/groups/${dept!.id}`, { active: false });
  check(r.status === 409 && r.json.error === 'group_in_use', '팀이 남은 부서는 숨길 수 없음');

  // ── 기록 탭: 부서로 걸러 보기 ──
  await p.goto(`${BASE}/admin/records`);
  check((await p.getByRole('combobox', { name: '부서·팀으로 보기' }).count()) === 1, '기록 탭에 부서 고르기');
  await p.getByRole('combobox', { name: '부서·팀으로 보기' }).selectOption(dept!.id);
  await p.waitForURL(/g=/);
  await p.waitForLoadState('networkidle');
  const names = await p.locator('summary span.font-medium').allInnerTexts();
  check(names.length === 1 && names[0] === '검사용(자동)', '부서를 고르면 그 부서(와 팀) 직원만', names.join(','));

  // ── 직원 등록 화면 ──
  await p.goto(`${BASE}/admin/members/new`);
  check((await p.getByText('정보 입력').count()) > 0 && (await p.getByText('초대 보내기').count()) > 0, '등록 화면: 2단계 표시');
  check((await p.locator('select[name=groupId] option').allInnerTexts()).includes('e2e-부서 › e2e-팀'), '등록 화면: 소속 그룹 고르기');
  await shot('org-new');
  r = await post('/api/admin/employees', { name: '검사', employeeNo: 'e2e-never', locale: 'ko', phone: 'abc' });
  check(r.status === 400 && r.json.error === 'invalid_phone', '등록: 틀린 휴대폰 번호면 계정을 만들지 않음');
  const { count: never } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('employee_no', 'e2e-never');
  check(never === 0, '등록 실패 때 직원이 생기지 않음');

  // ── 조직도 화면 + 넘침 ──
  await p.goto(`${BASE}/admin/members/groups`);
  await p.getByText('e2e-팀').first().waitFor();
  await shot('org-groups');
  for (const url of ['/admin/members', '/admin/members/groups', '/admin/members/new', `/admin/members/${emp!.id}`]) {
    await p.setViewportSize({ width: 320, height: 800 });
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= 320, `가로 넘침 없음 @320 ${url.replace(emp!.id, '[id]')}`, `${sw}px`);
  }
  check(pageErrors.length === 0, '화면 오류(콘솔) 없음', [...new Set(pageErrors)].join(' | '));
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  // 정리: 소속·연락처를 비우고, 검사용 그룹을 숨긴다 (팀 → 부서 순서)
  await db.from('profiles').update({ group_id: null, phone: null, job_title: null, role: 'employee', locale: 'en', active: false, updated_by: null }).eq('id', emp!.id);
  for (const name of ['e2e-팀', 'e2e-부서']) await db.from('org_groups').update({ active: false }).eq('name', name);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
