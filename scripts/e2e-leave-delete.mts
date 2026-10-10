// 휴가 삭제 요청 · 휴가 발생 내역 검사 (2026-10-11 의뢰인: 시프티의 휴가 삭제 요청 / 휴가 발생 화면).
//   npx tsx scripts/e2e-leave-delete.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 검사 전용 관리자(e2e-audit)가 자기 휴가의 삭제를 요청하고 거둬 보고, 다른 검사 계정(e2e-audit2)의 삭제 요청을 승인·거절한다.
// 휴가는 먼 앞날(2029년)의 연습 기록으로 직접 넣는다. 끝나면 검사 계정의 휴가·요청을 모두 취소로 닫고 계정을 다시 끈다.
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
const { data: other } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit2').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
await db.from('profiles').update({ active: true, role: 'employee', locale: 'ko' }).eq('id', other!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const ids = [emp!.id, other!.id];
const D1 = '2029-05-07';
const D2 = '2029-05-08';
const D3 = '2029-05-09';
const tidy = async () => {
  await db.from('leave_change_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).in('employee_id', ids).eq('status', 'pending');
  await db.from('leave_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).in('employee_id', ids).in('start_date', [D1, D2, D3]).in('status', ['approved', 'pending']);
};
await tidy();
const leave = async (employeeId: string, date: string, status = 'approved') =>
  (await db.from('leave_requests').insert({ employee_id: employeeId, type_code: 'sick', start_date: date, end_date: date, days: 1, reason: 'e2e 검사', status, requested_by: employeeId, is_test: true }).select('id').single()).data!.id as string;

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const statusOf = async (table: string, id: string) => (await db.from(table).select('status').eq('id', id).single()).data?.status as string | undefined;

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
  const post = (url: string, body: unknown) => p.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  // ── 내 휴가: 승인된 휴가에 [삭제 요청] ──
  const mine = await leave(emp!.id, D1);
  const minePending = await leave(emp!.id, D2, 'pending');
  await p.goto(`${BASE}/punch/leave`);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(500);
  const row = p.locator('main li', { hasText: '2029' }).filter({ hasText: '승인' }).first();
  check((await row.getByRole('button', { name: '삭제 요청' }).count()) === 1, '승인된 앞날 휴가에 [삭제 요청] 단추');
  await row.getByRole('button', { name: '삭제 요청' }).click();
  check(await row.getByRole('button', { name: '삭제 요청 보내기' }).isDisabled(), '사유 없이는 보낼 수 없음');
  await row.getByLabel('삭제를 요청하는 사유').fill('검사용 삭제 요청');
  await row.getByRole('button', { name: '삭제 요청 보내기' }).click();
  await p.getByText('삭제 요청 중').first().waitFor({ timeout: 20000 });
  const { data: ch } = await db.from('leave_change_requests').select('id, status, kind, is_test').eq('leave_id', mine);
  check(ch?.length === 1 && ch[0].status === 'pending' && ch[0].kind === 'delete' && ch[0].is_test === true && (await statusOf('leave_requests', mine)) === 'approved', '삭제 요청이 대기로 저장됨 — 휴가는 아직 그대로', JSON.stringify(ch));
  await shot('30-내휴가-삭제요청중');

  let r = await post('/api/leave/change', { leaveId: mine, reason: '또' });
  check(r.status === 409 && r.json.error === 'duplicate_request', '같은 휴가에 두 번 요청하지 못함', `${r.status} ${r.json.error}`);
  r = await post('/api/leave/change', { leaveId: minePending, reason: '대기 건' });
  check(r.status === 409 && r.json.error === 'not_approved', '승인되지 않은 휴가는 삭제 요청 대상이 아님', `${r.status} ${r.json.error}`);
  r = await post('/api/leave/change', { leaveId: mine, reason: '' });
  check(r.status === 400 && r.json.error === 'reason_required', '사유가 비면 거절', `${r.status} ${r.json.error}`);
  r = await post(`/api/admin/leave-changes/${ch![0].id}/decide`, { decision: 'approved' });
  check(r.status === 403 && r.json.error === 'self_decision', '자기 요청은 스스로 승인하지 못함', `${r.status} ${r.json.error}`);

  await p.goto(`${BASE}/punch/requests`);
  await p.waitForLoadState('networkidle');
  check((await p.locator('main li', { hasText: '휴가 삭제' }).count()) >= 1, '내 요청 목록에 「휴가 삭제」 한 줄');

  // ── 요청 거두기 ──
  await p.goto(`${BASE}/punch/leave`);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: '요청 거두기' }).first().click();
  await p.getByText('삭제 요청 중').first().waitFor({ state: 'hidden', timeout: 20000 });
  check((await statusOf('leave_change_requests', ch![0].id)) === 'cancelled' && (await statusOf('leave_requests', mine)) === 'approved', '요청을 거두면 요청만 취소되고 휴가는 남음');

  // ── 다른 직원의 삭제 요청: 관리자 요청함에서 승인 · 거절 ──
  const l1 = await leave(other!.id, D1);
  const l2 = await leave(other!.id, D3);
  const { data: made } = await db.from('leave_change_requests').insert([
    { leave_id: l1, employee_id: other!.id, kind: 'delete', reason: '검사용 승인', is_test: true },
    { leave_id: l2, employee_id: other!.id, kind: 'delete', reason: '검사용 거절', is_test: true },
  ]).select('id, leave_id');
  const c1 = made!.find((x) => x.leave_id === l1)!.id;
  const c2 = made!.find((x) => x.leave_id === l2)!.id;
  await p.goto(`${BASE}/admin/inbox`);
  await p.getByRole('search').waitFor({ timeout: 30000 });
  await p.waitForLoadState('networkidle');
  const rowsDel = p.locator('main li a', { hasText: '휴가 삭제' }).locator('visible=true');
  check((await rowsDel.count()) === 2, '요청함 한 목록에 휴가 삭제 요청 2건', String(await rowsDel.count()));
  await p.locator(`main li a[href*="id=${c1}"]`).locator('visible=true').click();
  await p.waitForURL(/k=leaveDelete/);
  await p.getByRole('heading', { name: /휴가 삭제 요청/ }).waitFor({ timeout: 30000 });
  await shot('31-요청함-휴가삭제');
  const card = p.locator('#leave-delete li', { hasText: '검사용 승인' });
  await card.getByRole('button', { name: '승인' }).click();
  await card.getByRole('button', { name: /확인|승인/ }).last().click();
  await p.locator('#leave-delete li', { hasText: '검사용 승인' }).waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  check((await statusOf('leave_change_requests', c1)) === 'approved' && (await statusOf('leave_requests', l1)) === 'cancelled', '승인하면 그 휴가가 취소됨');
  r = await post(`/api/admin/leave-changes/${c1}/decide`, { decision: 'rejected' });
  check(r.json.result === 'already', '두 번째 결정은 이미 처리됨', JSON.stringify(r.json));
  r = await post(`/api/admin/leave-changes/${c2}/decide`, { decision: 'rejected' });
  check(r.json.result === 'ok' && (await statusOf('leave_change_requests', c2)) === 'rejected' && (await statusOf('leave_requests', l2)) === 'approved', '거절하면 휴가는 그대로');

  // ── 휴가 발생 (직원 한 명) ──
  const Y = new Date().getFullYear();
  r = await post('/api/admin/leave/grants', { employeeId: other!.id, periodLabel: `e2e-${Y}`, grantedDays: 15, carriedDays: 0, basis: 'fiscal_year', effectiveFrom: `${Y}-01-01` });
  check(r.status === 200, '검사 계정에 올해 발생 건 넣음', String(r.status));
  r = await post('/api/admin/leave/grants', { employeeId: other!.id, periodLabel: `e2e-${Y + 1}`, grantedDays: 16, carriedDays: 0, basis: 'fiscal_year', effectiveFrom: `${Y + 1}-01-01` });
  await p.goto(`${BASE}/admin/leave/emp/${other!.id}`);
  await p.getByRole('heading', { name: '휴가 발생', exact: true }).waitFor({ timeout: 20000 });
  const hist = p.locator('main ul li');
  check((await p.locator('header').locator('visible=true').count()) === 0 && (await p.getByText(/산정 기간/).count()) === 1 && (await p.locator('main dl dt').allTextContents()).slice(0, 3).join() === '총,사용,남은', '휴가 발생: ← 제목 줄 · 산정 기간 · 총/사용/남은');
  check((await hist.filter({ hasText: '발생됨' }).count()) === 1 && (await hist.filter({ hasText: '예정됨' }).count()) >= 1, '발생 내역: 올해 건은 「발생됨」, 내년 건은 「예정됨」', `${await hist.count()}줄`);
  check((await p.getByRole('heading', { name: '휴가 발생 건 추가하기' }).count()) === 1, '「휴가 발생 건 추가하기」 칸');
  await shot('32-휴가-발생');
  await p.goto(`${BASE}/admin/leave/emp/${other!.id}?to=${Y + 1}-06-01`);
  await p.getByRole('heading', { name: '휴가 발생', exact: true }).waitFor({ timeout: 20000 });
  check((await p.locator('main ul li').filter({ hasText: '만료됨' }).count()) >= 1 && (await p.locator('main dl dd').first().textContent()) === '16', '기준일을 내년으로 바꾸면 올해 건은 「만료됨」, 총 16', (await p.locator('main dl dd').first().textContent()) ?? '');

  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of ['/punch/leave', `/admin/leave/emp/${other!.id}`, '/admin/inbox']) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= w, `가로 넘침 없음 @${w} ${url.replace(other!.id, '…')}`, `${sw}px`);
    }
  }
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await tidy();
  for (const id of ids) await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
