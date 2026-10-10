// 기록 확정 검사 (2026-10-11 의뢰인 확정: 확정한 기록만 급여에 쓰고, 확정 뒤에는 정정을 막는다).
//   npx tsx scripts/e2e-confirm.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 검사 전용 관리자(e2e-audit)가 다른 검사 계정(e2e-audit2)의 하루 기록을 확정하고, 정정이 막히는지 보고, 다시 푼다.
// 확정할 날이 없으면 대리 입력으로 출근·퇴근을 한 번 넣는다 (연습 기록, 검사 계정 것). 끝나면 확정을 풀고 계정을 다시 끈다.
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
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', other!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const release = () => db.from('day_confirms').update({ active: false, released_by: emp!.id, released_at: new Date().toISOString() }).in('employee_id', [emp!.id, other!.id]).eq('active', true);
await release(); // 지난 실행이 남긴 확정

const kst = new Date(Date.now() + 9 * 3600e3);
const dayAgo = (n: number) => new Date(kst.getTime() - n * 86400e3).toISOString().slice(0, 10);
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
  const post = (url: string, body: unknown) => p.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  const confirm = (employeeId: string, date: string, on = true) => post('/api/admin/records/confirm', { items: [{ employeeId, date }], confirm: on });
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');

  // ── 확정할 날 찾기: 최근 3주 중 확정되는 첫 날. 없으면 대리 입력으로 만든다 ──
  let DAY = '';
  for (let n = 1; n <= 21 && !DAY; n++) {
    const r = await confirm(other!.id, dayAgo(n));
    if (r.status === 200 && r.json.done === 1) DAY = dayAgo(n);
  }
  if (!DAY) {
    for (let n = 2; n <= 21 && !DAY; n++) {
      const d = dayAgo(n);
      const a = await post(`/api/admin/employees/${other!.id}/punch`, { workDate: d, kind: 'in', time: '09:00', reason: '확정 검사용' });
      if (a.status !== 200) continue;
      const b = await post(`/api/admin/employees/${other!.id}/punch`, { workDate: d, kind: 'out', time: '18:00', reason: '확정 검사용' });
      if (b.status === 200 && (await confirm(other!.id, d)).json.done === 1) DAY = d;
    }
  }
  check(!!DAY, '다른 직원의 하루 기록을 확정함', DAY);
  const row = async () => (await db.from('day_confirms').select('active, confirmed_by, released_by, is_test').eq('employee_id', other!.id).eq('work_date', DAY).order('created_at', { ascending: false }).limit(1)).data?.[0];
  let c = await row();
  check(c?.active === true && c.confirmed_by === emp!.id && c.is_test === true, '확정 줄이 남음 (누가 · 연습 기록)', JSON.stringify(c));
  let r = await confirm(other!.id, DAY);
  check(r.status === 200 && r.json.done === 0, '같은 날을 또 확정해도 한 건', JSON.stringify(r.json));

  // ── 확정된 날은 고치지 못한다 ──
  r = await post(`/api/admin/employees/${other!.id}/punch`, { workDate: DAY, kind: 'out', time: '19:00', reason: '확정 뒤 대리 입력' });
  check(r.status === 409 && r.json.error === 'day_confirmed', '확정된 날에는 대리 입력이 막힘', `${r.status} ${r.json.error}`);

  // ── 안 되는 경우 ──
  r = await confirm(emp!.id, DAY);
  check(r.status === 409 && r.json.error === 'self_decision', '본인 기록은 스스로 확정하지 못함', `${r.status} ${r.json.error}`);
  // 기록이 없는 날 (최근 3주 중 하나) — 그런 날이 없으면 건너뛴다
  let noRec: { status: number; json: { error?: string; done?: number } } | null = null;
  for (let n = 1; n <= 21 && !noRec; n++) {
    if (dayAgo(n) === DAY) continue;
    const x = await confirm(other!.id, dayAgo(n));
    if (x.status === 409 && x.json.error === 'no_record') noRec = x;
    else if (x.status === 200 && x.json.done === 1) await confirm(other!.id, dayAgo(n), false);
  }
  if (noRec) check(true, '기록이 없는 날은 확정하지 못함', String(noRec.json.error));
  r = await confirm(other!.id, dayAgo(-2));
  check(r.status === 400, '앞날은 거절', String(r.status));
  r = await post('/api/admin/records/confirm', { items: [], confirm: true });
  check(r.status === 400, '빈 목록은 거절', String(r.status));

  // ── 화면: 목록의 확정 표시 (검사 계정은 목록에 나오지 않아, 실제 목록에 표시와 단추가 있는지만 본다 — 누르지 않는다) ──
  await p.goto(`${BASE}/admin/records/list`);
  await p.getByRole('search').waitFor({ timeout: 30000 });
  await p.waitForLoadState('networkidle');
  const marks = await p.locator('main li svg[aria-label="확정 전"], main li svg[aria-label="확정됨"]').count();
  const lines = await p.locator('main li a[href^="/admin/records/"]').count();
  check(lines === 0 || marks === lines, '목록 줄마다 확정 표시(확정됨 · 확정 전)', `${marks}/${lines}`);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '05-목록-확정.png') });
  await p.goto(`${BASE}/admin/records/${other!.id}/${DAY}`);
  await p.getByRole('heading', { name: '출퇴근기록', exact: true }).waitFor({ timeout: 20000 });
  check((await p.getByText('확정됨').count()) >= 1 && (await p.getByRole('button', { name: '확정 풀기' }).count()) === 1 && (await p.getByRole('button', { name: '확정하기' }).count()) === 0, '상세: 확정됨 배지 · [확정 풀기]');
  await p.waitForTimeout(400);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '06-상세-확정됨.png'), fullPage: true });

  // ── 풀기 (한 번 더 묻는다) ──
  await p.getByRole('button', { name: '확정 풀기' }).click();
  check((await p.getByText(/급여 계산에서 빠지고/).count()) === 1, '풀기 전에 한 번 더 물음');
  await p.getByRole('button', { name: '확정 풀기' }).click();
  await p.getByRole('button', { name: '확정하기' }).waitFor({ timeout: 20000 });
  c = await row();
  check(c?.active === false && c.released_by === emp!.id, '풀면 꺼짐 (지우지 않음 · 누가 풀었는지 남음)', JSON.stringify(c));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '07-상세-확정하기.png'), fullPage: true });

  // ── 상세의 [확정하기] · 목록의 「모두 확정」 ──
  await p.getByRole('button', { name: '확정하기' }).click();
  await p.getByRole('button', { name: '확정 풀기' }).waitFor({ timeout: 20000 });
  check((await row())?.active === true, '상세의 [확정하기]로 다시 확정');
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= w, `가로 넘침 없음 @${w} 상세`, `${sw}px`);
    await p.goto(`${BASE}/admin/records/list`);
    await p.getByRole('search').waitFor({ timeout: 30000 });
    const lw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(lw <= w, `가로 넘침 없음 @${w} 목록`, `${lw}px`);
    await p.goto(`${BASE}/admin/records/${other!.id}/${DAY}`);
    await p.getByRole('heading', { name: '출퇴근기록', exact: true }).waitFor({ timeout: 20000 });
  }
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await release();
  for (const id of [emp!.id, other!.id]) await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
