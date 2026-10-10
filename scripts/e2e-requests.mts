// 요청 통합 화면 검사 (2026-10-10) — 검사 전용 관리자(e2e-audit)로 휴가·외근 요청을 내고, 「내 요청」 대기중/완료와 관리자 「완료」 탭을 본다.
//   npx tsx scripts/e2e-requests.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 요청은 연습 기록이고 먼 미래의 하루로 낸 뒤 취소한다. 출퇴근 기록은 만들지 않는다.
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

const d = new Date();
d.setUTCFullYear(d.getUTCFullYear() + 2);
while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
d.setUTCDate(d.getUTCDate() + Math.floor(Math.random() * 40) * 7);
const DAY = d.toISOString().slice(0, 10);
const PLACE = `e2e 고객사 ${randomBytes(2).toString('hex')}`;

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
let leaveId: string | null = null;
let workId: string | null = null;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name: string, full = true) => {
    if (!SHOTS) return;
    await p.waitForLoadState('networkidle');
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
  };
  const post = (url: string, body?: unknown) => p.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  const tabCount = async (name: string) => Number(((await p.getByRole('link', { name: new RegExp(`^${name}`) }).first().textContent()) ?? '').replace(/\D/g, ''));
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  // ── 관리자: 요청 탭 → 대기중 / 완료 ──
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  await p.locator('nav.fixed').getByRole('link', { name: /요청/ }).click();
  await p.waitForURL(/\/admin\/inbox/);
  await p.waitForLoadState('networkidle');
  await p.getByRole('link', { name: '완료', exact: true }).waitFor({ timeout: 20000 }).catch(() => {});
  const nA = await p.getByRole('link', { name: '대기중', exact: true }).count(); const nB = await p.getByRole('link', { name: '완료', exact: true }).count();
  check(nA === 1 && nB === 1, '관리자 요청 화면에 「대기중 · 완료」 탭', `${nA} ${nB}`);
  check((await p.getByText('최근 처리').count()) === 0, '아래에 따로 있던 「최근 처리」 목록은 없어짐 (완료 탭이 대신함)');
  await p.getByRole('link', { name: '완료', exact: true }).click();
  await p.waitForURL(/tab=done/);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('link', { name: '완료', exact: true }).getAttribute('aria-current')) === 'page', '「완료」 탭이 열림');
  await shot('01-관리자-완료');

  // ── 내 요청 ──
  await p.getByRole('link', { name: '내 요청', exact: true }).click();
  await p.waitForURL(/\/punch\/requests/);
  await p.waitForLoadState('networkidle');
  check(true, '보기 범위 「내 요청」 → 내 요청 화면');
  const before = await tabCount('대기중');
  let r = await post('/api/leave', { typeCode: 'sick', startDate: DAY, endDate: DAY, reason: '검사용 요청' });
  check(r.status === 200, '휴가(병가) 요청을 냄', JSON.stringify(r.json));
  leaveId = r.json.id ?? null;
  r = await post('/api/work', { kind: 'outside', startDate: DAY, endDate: DAY, place: PLACE });
  check(r.status === 200, '외근 요청을 냄', JSON.stringify(r.json));
  workId = r.json.id ?? null;
  await p.reload();
  await p.waitForLoadState('networkidle');
  check((await tabCount('대기중')) === before + 2, '대기중 수가 2 늘어남', `${before} → ${await tabCount('대기중')}`);
  check((await p.getByText('휴가 · 병가').count()) >= 1 && (await p.getByText('외근·출장·재택 · 외근').count()) >= 1, '종류가 달라도 한 목록에 「종류 · 구분」으로 보임');
  check((await p.getByText(new RegExp(PLACE)).count()) === 1 && (await p.getByText('검사용 요청').count()) >= 1 && (await p.getByText('방금').count()) >= 1, '내용(장소·사유)과 「방금」이 보임');
  await shot('02-내-요청-대기중');

  // ── + 버튼: 종류 고르기 ──
  await p.locator('[data-fab]').click();
  check((await p.getByRole('link', { name: '출퇴근기록 정정 요청' }).count()) >= 1 && (await p.getByRole('link', { name: '휴가 신청' }).count()) >= 1 && (await p.getByRole('link', { name: '외근·출장·재택 신청' }).count()) >= 1, '+ 버튼을 누르면 요청 종류 3가지');
  await shot('03-새-요청-고르기', false);
  await p.locator('div.fixed').getByRole('link', { name: '휴가 신청' }).click();
  await p.waitForURL(/\/punch\/leave\?new=leave/);
  check(await p.getByRole('dialog').waitFor({ timeout: 15000 }).then(() => true, () => false), '「휴가 신청」을 고르면 휴가 양식이 열린 채로 넘어감');

  // ── 취소 → 완료 탭 ──
  r = await post(`/api/leave/${leaveId}/cancel`);
  check(r.json.result === 'ok', '휴가 요청 취소', JSON.stringify(r.json));
  await p.goto(`${BASE}/punch/requests?tab=done`);
  await p.waitForLoadState('networkidle');
  const doneRow = p.locator('li', { hasText: '검사용 요청' }).first();
  check((await doneRow.count()) === 1 && /취소/.test((await doneRow.textContent()) ?? ''), '취소한 요청이 「완료」 탭에 「취소」로 보임');
  await shot('04-내-요청-완료');
  await p.goto(`${BASE}/punch/corrections`);
  await p.waitForLoadState('networkidle');
  check(((await p.locator('nav.fixed a[aria-current="page"]').textContent()) ?? '').includes('요청'), '정정 요청 화면에서도 하단 「요청」 탭이 켜져 있음');

  // ── 가로 넘침 · PC ──
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of ['/punch/requests', '/punch/requests?tab=done', '/admin/inbox?tab=done']) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= w, `가로 넘침 없음 @${w} ${url}`, `${sw}px`);
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/punch/requests`);
  await p.waitForLoadState('networkidle');
  check(await p.getByRole('link', { name: /\+ 휴가 신청/ }).isVisible(), 'PC에서는 새 요청으로 가는 줄이 보임');
  check((await p.locator('aside, nav').getByRole('link', { name: '내 요청', exact: true }).count()) >= 1, 'PC 왼쪽 메뉴에 「내 요청」');
  await shot('05-PC-내-요청');
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  if (leaveId) await db.rpc('cancel_leave', { p_id: leaveId, p_employee: emp!.id });
  if (workId) await db.from('work_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', workId).eq('status', 'pending');
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
