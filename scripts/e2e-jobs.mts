// 직무 화면 검사 (2026-10-10) — 검사 전용 관리자(e2e-audit)로 직무를 만들고, 자신에게 지정하고, 근무일정·직원 상세에 보이는지 본다.
//   npx tsx scripts/e2e-jobs.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 만든 직무는 이름이 e2e-로 시작하고 끝나면 지정을 풀고 꺼 둔다 (지우지 않는 표). 출퇴근 기록은 만들지 않는다.
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
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', job_id: null }).eq('id', emp!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const NAME = `e2e-직무 ${randomBytes(2).toString('hex')}`;

// 다음 주 수요일 (근무일)
const kst = new Date(Date.now() + 9 * 3600e3);
const dow = (kst.getUTCDay() + 6) % 7;
const WED = new Date(kst.getTime() + (9 - dow) * 86400e3).toISOString().slice(0, 10);
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
let jobId: string | null = null;

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
  const post = (url: string, body: unknown) => p.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  // ── 메뉴 → 목록 → 만들기 ──
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  await p.locator('[data-menu-open]').click();
  await p.getByRole('dialog').waitFor();
  check((await p.getByRole('dialog').getByRole('link', { name: '직무', exact: true }).count()) === 1, '왼쪽 메뉴에 「직무」');
  await p.goto(`${BASE}/admin/jobs`);
  await p.waitForLoadState('networkidle');
  await p.locator('[data-fab]').click();
  const sheet = p.getByRole('dialog');
  await sheet.waitFor();
  await sheet.getByLabel('직무 이름').fill(NAME);
  await sheet.getByLabel('빨강').check({ force: true });
  await shot('01-직무-추가', false);
  await sheet.getByRole('button', { name: '저장' }).click();
  await p.waitForURL(/\/admin\/jobs\/[0-9a-f-]{36}/, { timeout: 20000 });
  jobId = p.url().split('/').pop()!;
  const { data: row } = await db.from('jobs').select('name, color, active').eq('id', jobId).single();
  check(row?.name === NAME && row?.color === 'danger' && row?.active === true, '+ 버튼 → 양식 → 저장하면 상세로 넘어감', JSON.stringify(row));

  let r = await post('/api/admin/jobs', { name: NAME, color: 'ok' });
  check(r.status === 409, '같은 이름으로 또 만들면 거절', String(r.status));
  r = await post('/api/admin/jobs', { name: ' ', color: 'ok' });
  check(r.status === 400, '빈 이름은 거절', String(r.status));
  r = await post('/api/admin/jobs', { name: 'e2e-색', color: 'pink' });
  check(r.status === 400, '없는 색은 거절', String(r.status));

  // ── 직원 지정 ──
  r = await post(`/api/admin/jobs/${jobId}`, { employeeIds: [emp!.id] });
  check(r.status === 200 && r.json.added === 1, '직원에게 직무 지정', JSON.stringify(r.json));
  await p.reload();
  await p.waitForLoadState('networkidle');
  check(await p.locator('label', { hasText: emp!.name }).locator('input[type=checkbox]').isChecked(), '상세 화면에 지정된 직원이 체크돼 있음');
  await shot('02-직무-상세');
  r = await post(`/api/admin/jobs/${jobId}`, { active: false });
  check(r.status === 409, '직원이 있는 직무는 끌 수 없음', String(r.status));

  // ── 목록 · 직원 상세 · 근무일정 ──
  await p.goto(`${BASE}/admin/jobs`);
  await p.waitForLoadState('networkidle');
  const li = p.getByRole('link', { name: new RegExp(NAME) });
  check((await li.count()) === 1 && /1명/.test((await li.textContent()) ?? ''), '목록에 이름과 인원 1명');
  await shot('03-직무-목록');
  await p.goto(`${BASE}/admin/members/${emp!.id}`);
  await p.waitForLoadState('networkidle');
  check((await p.getByText(NAME).count()) >= 1, '직원 상세에 직무가 보임');
  r = await post('/api/admin/schedule', { date: WED, startTime: '08:00', endTime: '17:00', kind: 'none', templateId: null, note: '', employeeIds: [emp!.id] });
  await p.goto(`${BASE}/admin/schedule?d=${WED}`);
  await p.waitForLoadState('networkidle');
  const line = p.locator('li', { has: p.getByRole('link', { name: emp!.name }) }).first();
  check(/e2e-직무/.test((await line.textContent()) ?? '') && (await line.locator('span.bg-danger').count()) === 1, '근무일정 목록: 직무 이름과 직무 색(빨강) 막대');
  await shot('04-근무일정-직무색');

  // ── 지정 풀고 끄기 ──
  r = await post(`/api/admin/jobs/${jobId}`, { employeeIds: [] });
  check(r.status === 200 && r.json.removed === 1, '지정을 풀 수 있음', JSON.stringify(r.json));
  r = await post(`/api/admin/jobs/${jobId}`, { active: false });
  check(r.status === 200, '직원이 없으면 끌 수 있음', String(r.status));
  r = await post(`/api/admin/jobs/${jobId}`, { employeeIds: [emp!.id] });
  check(r.status === 409, '꺼 둔 직무에는 지정할 수 없음', String(r.status));
  r = await post(`/api/admin/jobs/${jobId}`, { active: true });
  check(r.status === 200, '다시 켤 수 있음', String(r.status));

  // ── 가로 넘침 · PC ──
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of ['/admin/jobs', `/admin/jobs/${jobId}`]) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= w, `가로 넘침 없음 @${w} ${url.replace(jobId!, '…')}`, `${sw}px`);
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/jobs`);
  await p.waitForLoadState('networkidle');
  check(await p.getByLabel('직무 이름').isVisible(), 'PC에서는 추가 양식이 옆에 펼쳐져 있음');
  await shot('05-PC-직무');
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await db.from('shifts').update({ active: false }).eq('employee_id', emp!.id).eq('active', true);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false, job_id: null }).eq('id', emp!.id);
  if (jobId) await db.from('jobs').update({ active: false }).eq('id', jobId);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
