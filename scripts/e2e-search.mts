// 통합 검색 검사 (2026-10-14, 미구현 목록 48번) — 메뉴 · 직원 · 요청 · 공지 · 업무 메시지를 찾고, 권한 밖의 것은 안 나오는지.
//   npx tsx scripts/e2e-search.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
//   ADM = e2e-audit(관리자) · A = e2e-audit2(직원, 자료 주인) · B = e2e-audit3(다른 직원 — A의 것이 보이면 안 된다)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const who = async (no: string) => (await db.from('profiles').select('id, name').eq('employee_no', no).single()).data!;
const [ADM, A, B] = await Promise.all([who('e2e-audit'), who('e2e-audit2'), who('e2e-audit3')]);
const TAG = `찾기${randomBytes(3).toString('hex')}`;
const STARTED = new Date().toISOString();
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
let noticeId: string | null = null;
let leaveId: string | null = null;
try {
  for (const [p, role] of [[ADM, 'admin'], [A, 'employee'], [B, 'employee']] as const) {
    await db.auth.admin.updateUserById(p.id, { ban_duration: 'none' });
    await db.from('profiles').update({ active: true, role, locale: 'ko' }).eq('id', p.id);
  }
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  const login = async (id: string, width = 1440): Promise<Page> => {
    for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
    const token = randomBytes(32).toString('base64url');
    await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
    const pg = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(`${BASE}/register?token=${token}`);
    await createPassword(pg);
    return pg;
  };
  const p = await login(ADM.id);
  const qa = await login(A.id);
  const qb = await login(B.id, 390);
  const post = (pg: Page, url: string, body: unknown) => pg.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  const search = async (pg: Page, base: string, q: string, extra = '') => {
    await pg.goto(`${BASE}${base}/search?q=${encodeURIComponent(q)}${extra}`);
    await pg.getByRole('heading', { name: '통합 검색' }).waitFor({ timeout: 20000 });
    return pg.locator('main').innerText();
  };

  // ── 자료 만들기: A의 휴가 신청(사유에 TAG) · A에게만 가는 공지 · A에게만 가는 업무 메시지 ──
  const d = new Date(Date.now() + 400 * 86400e3);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  let r = await post(qa, '/api/leave', { typeCode: 'sick', startDate: d.toISOString().slice(0, 10), endDate: d.toISOString().slice(0, 10), reason: `${TAG} 병원 진료` });
  leaveId = (r.json.id as string) ?? null;
  check(r.status === 200, `${A.name}: 사유에 「${TAG}」를 넣은 휴가 신청`, JSON.stringify(r.json));
  r = await post(p, '/api/admin/notices', { title: `[점검] ${TAG} 공지`, body: `검색 검사용 공지입니다. ${TAG}`, audience: 'selected', targets: [A.id] });
  noticeId = (r.json.id as string) ?? null;
  await post(p, `/api/admin/notices/${noticeId}/status`, { action: 'publish' });
  r = await post(p, '/api/messages', { action: 'send', to: 'people', employeeIds: [A.id], title: `${TAG} 확인 부탁`, body: `본문에도 ${TAG}가 있습니다.`, needsReply: false });
  check(r.status === 200, `관리자 → ${A.name}: 업무 메시지`, JSON.stringify(r.json));

  // ── 관리자 ──
  let page = await search(p, '/admin', TAG);
  check(page.includes(`「${TAG}」 정확히 일치`) && page.includes('요청') && page.includes('공지') && page.includes('업무 메시지'), '관리자: 요청 · 공지 · 업무 메시지에서 찾는다', page.slice(0, 200).replace(/\n/g, ' / '));
  check(page.includes(`${A.name} · 휴가`), '관리자: 요청 결과에 「누구 · 무슨 요청」');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'search-1-admin.png'), fullPage: true });
  await p.getByRole('link', { name: /^요청\(\d+\)$/ }).click();
  await p.waitForURL(/s=requests/);
  const reqLink = p.locator('main a[href*="/admin/inbox?k=leave&id="]').first();
  check((await reqLink.count()) === 1, '관리자: 「요청」 탭 → 결과를 누르면 그 요청 처리 화면으로');
  page = await search(p, '/admin', '인건비');
  check(page.includes('인건비 현황') && page.includes('메뉴'), '관리자: 메뉴 이름으로 찾는다');
  // 초성 · 관련결과
  page = await search(p, '/admin', 'ㄱㅅㅇ');
  check(page.includes('「ㄱㅅㅇ」 정확히 일치 0건') && page.includes('관련결과 더보기'), '초성(ㄱㅅㅇ)은 정확히 일치 0건 + 「관련결과 더보기」');
  page = await search(p, '/admin', 'ㄱㅅㅇ', '&more=1');
  check(page.includes(A.name) && page.includes('관련'), '「관련결과 더보기」 → 초성으로 맞는 직원(검사용…)이 「관련」 표시와 함께');

  // ── 직원 A (자료 주인) ──
  page = await search(qa, '/punch', TAG);
  check(page.includes(`${TAG} 공지`) && page.includes(`${TAG} 확인 부탁`) && page.includes('휴가'), `${A.name}: 나에게 온 공지 · 메시지 · 내 요청을 찾는다`);
  check(!page.includes(`${A.name} · 휴가`), `${A.name}: 내 요청에는 내 이름을 붙이지 않는다`);
  if (SHOTS) await qa.screenshot({ path: path.join(SHOTS, 'search-2-employee.png'), fullPage: true });
  page = await search(qa, '/punch', '급여대장');
  check(!page.includes('/admin/payroll/runs') && !(await qa.locator('main a[href^="/admin/"]').count()), `${A.name}: 직원 검색 결과에 관리 화면 길이 없다`);

  // ── 다른 직원 B: A의 것이 보이면 안 된다 ──
  page = await search(qb, '/punch', TAG);
  check(page.includes(`「${TAG}」 정확히 일치 0건`) && !page.includes(`${TAG} 공지`) && !page.includes(`${TAG} 확인 부탁`), `${B.name}(다른 직원): A의 휴가 · 공지 · 메시지가 나오지 않는다`);
  if (SHOTS) await qb.screenshot({ path: path.join(SHOTS, 'search-3-other-phone.png'), fullPage: true });
  const sw = await qb.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 390, '폰 폭에서 가로로 넘치지 않는다', `${sw}px`);
  check((await qb.locator('header a[href="/punch/search"]').count()) >= 1, '폰 위 띠에 돋보기(통합 검색)');

  // ── PC 위쪽 검색창: 찾을 곳 고르기 → Enter → 결과 ──
  await qa.goto(`${BASE}/punch`);
  await qa.waitForLoadState('networkidle');
  await qa.getByRole('combobox', { name: '찾을 곳' }).first().selectOption('notices');
  await qa.getByRole('combobox', { name: '검색' }).fill(TAG);
  await qa.keyboard.press('Enter');
  await qa.waitForURL(/\/punch\/search\?q=.*&s=notices/, { timeout: 15000 });
  page = await qa.locator('main').innerText();
  check(page.includes(`${TAG} 공지`) && !page.includes(`${TAG} 확인 부탁`), '위쪽 검색창에서 「공지」만 골라 찾으면 공지만 나온다');
  check(errors.length === 0, '화면 오류 없음', errors.slice(0, 2).join(' | '));
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  if (leaveId) await db.rpc('decide_leave', { p_id: leaveId, p_decision: 'rejected', p_decided_by: ADM.id, p_reason: 'e2e 검색 검사 정리', p_request_id: 'e2e-search' });
  if (noticeId) await db.from('notices').update({ status: 'archived' }).eq('id', noticeId);
  for (const id of [A.id, B.id]) await db.from('profiles').update({ role: 'employee', active: false }).eq('id', id);
  await db.from('profiles').update({ active: false, role: 'employee' }).eq('id', ADM.id);
  for (const id of [ADM.id, A.id, B.id]) {
    await db.from('user_passkeys').update({ revoked_at: new Date().toISOString() }).eq('employee_id', id).is('revoked_at', null).gte('created_at', STARTED);
    await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
  }
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
