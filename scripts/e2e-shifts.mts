// 근무일정 틀 화면 검사 (2026-10-10) — 검사 전용 관리자(e2e-audit)로 틀을 만들고, 자기에게 적용하고, 홈·기록 화면이 그 틀을 따르는지 본다.
//   npx tsx scripts/e2e-shifts.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 만든 틀은 이름이 e2e- 로 시작하고, 끝나면 적용을 풀고 끈다 (지우지 않는 표라 줄은 남지만 화면에는 보이지 않는다). 출퇴근 기록은 만들지 않는다.
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
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', shift_template_id: null }).eq('id', emp!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

const TAG = Date.now().toString(36);
const NAME = `e2e-조기 07:30 ${TAG}`;
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
  await p.locator('[data-menu-open]').click();
  await p.getByRole('dialog').waitFor();
  check((await p.getByRole('dialog').getByRole('link', { name: '근무일정 틀', exact: true }).count()) === 1, '왼쪽 메뉴에 「근무일정 틀」');
  await p.goto(`${BASE}/admin/shifts`);
  await p.waitForLoadState('networkidle');
  check((await p.getByText(/회사 근무규칙/).count()) > 0, '목록 위에 "틀이 없는 직원은 회사 근무규칙" 안내');
  await p.locator('[data-fab]').click();
  const sheet = p.getByRole('dialog');
  await sheet.waitFor();
  await sheet.getByLabel('틀 이름').fill(NAME);
  await sheet.locator('input[name="startTime"]').fill('07:30');
  await sheet.locator('input[name="endTime"]').fill('17:00');
  await sheet.getByLabel('초록').check({ force: true });
  await sheet.getByLabel('메모').fill('검사용');
  await shot('01-틀-추가-창', false);
  await sheet.getByRole('button', { name: '저장' }).click();
  await p.waitForURL(/\/admin\/shifts\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const id = p.url().split('/').pop()!;
  await p.getByRole('heading', { name: NAME }).waitFor();
  const { data: saved } = await db.from('shift_templates').select('name, start_time, end_time, kind, color, memo, active').eq('id', id).single();
  check(saved?.name === NAME && saved.start_time.startsWith('07:30') && saved.end_time.startsWith('17:00') && saved.kind === 'none' && saved.color === 'ok' && saved.active, '저장된 값이 입력과 같음', JSON.stringify(saved));
  check((await p.getByText('07:30 - 17:00').count()) > 0 && (await p.getByText('9시간 30분').count()) > 0, '상세에 시간·일정 길이');

  // ── 잘못된 값 · 같은 이름 ──
  let r = await post('/api/admin/shifts', { name: 'e2e-x', startTime: '18:00', endTime: '09:00', kind: 'none', color: 'ok' });
  check(r.status === 400 && r.json.error?.code !== undefined ? true : r.status === 400, '끝이 시작보다 이르면 거절', String(r.status));
  r = await post('/api/admin/shifts', { name: NAME, startTime: '08:00', endTime: '17:00', kind: 'none', color: 'ok' });
  check(r.status === 409, '같은 이름의 틀은 거절', String(r.status));

  // ── 나에게 적용 → 홈의 오늘 일정이 바뀜 ──
  r = await post(`/api/admin/shifts/${id}`, { employeeIds: [emp!.id] });
  check(r.status === 200 && (await db.from('profiles').select('shift_template_id').eq('id', emp!.id).single()).data?.shift_template_id === id, '직원에게 적용됨 (DB)', JSON.stringify(r.json));
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  // 홈의 "오늘 일정" 줄은 출근 전·근무 중에만 나온다. 검사 계정이 오늘 이미 퇴근까지 찍었으면(다른 검사가 만든 연습 기록) 이 항목은 볼 수 없다
  if ((await p.getByText('퇴근했어요').count()) > 0) console.log('➖ 직원 홈의 오늘 일정: 검사 계정이 오늘 이미 퇴근해서 일정 줄이 없는 상태 — 확인하지 못함');
  else check((await p.getByText(/07:30/).count()) > 0, '직원 홈의 오늘 일정이 틀 시각(07:30)으로 보임');
  await shot('02-홈-틀-적용', false);
  await p.goto(`${BASE}/admin/shifts/${id}`);
  await p.waitForLoadState('networkidle');
  check(await p.getByRole('checkbox', { checked: true }).count() === 1, '상세의 직원 목록에 적용된 사람이 체크돼 있음');
  await shot('03-틀-상세');
  await p.goto(`${BASE}/admin/members/${emp!.id}`);
  check((await p.getByText(NAME).count()) > 0, '직원 상세에 적용된 틀 이름');

  // ── 쓰는 틀은 끌 수 없음 ──
  r = await post(`/api/admin/shifts/${id}`, { active: false });
  check(r.status === 409, '직원이 쓰는 틀은 끌 수 없음', String(r.status));

  // ── 간주 근무로 바꿔도 화면들이 그대로 열림 ──
  r = await post(`/api/admin/shifts/${id}`, { name: NAME, startTime: '07:30', endTime: '17:00', kind: 'deemed', color: 'text', memo: '' });
  check(r.status === 200, '유형을 간주 근무로 바꿈', String(r.status));
  for (const url of ['/punch', '/punch/records', '/admin', '/admin/records', `/admin/records/${emp!.id}`, '/admin/payroll', '/admin/inbox']) {
    const res = await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    check(res?.status() === 200 && (await p.locator('main').count()) > 0, `간주 근무 적용 뒤 화면 열림 ${url.replace(/[0-9a-f-]{36}/, '…')}`, String(res?.status()));
  }
  await p.goto(`${BASE}/admin/shifts/${id}`);
  check((await p.getByText(/찍지 않아도/).count()) > 0, '간주 근무 설명이 보임');

  // ── 목록 · 가로 넘침 · PC ──
  await p.goto(`${BASE}/admin/shifts`);
  check((await p.getByText(NAME).count()) === 1 && (await p.getByText(/\[간주 근무\] 07:30 - 17:00/).count()) > 0, '목록에 [유형] 시각');
  await shot('04-틀-목록');
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of ['/admin/shifts', `/admin/shifts/${id}`]) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= w, `가로 넘침 없음 @${w} ${url.replace(/[0-9a-f-]{36}/, '…')}`, `${sw}px`);
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/shifts/${id}`);
  await shot('05-PC-틀-상세');

  // ── 적용 풀기 → 끄기 ──
  r = await post(`/api/admin/shifts/${id}`, { employeeIds: [] });
  check(r.status === 200 && (await db.from('profiles').select('shift_template_id').eq('id', emp!.id).single()).data?.shift_template_id === null, '적용을 풀면 「틀 없음」으로 돌아감');
  r = await post(`/api/admin/shifts/${id}`, { active: false });
  check(r.status === 200, '아무도 안 쓰는 틀은 끌 수 있음', String(r.status));
  await p.goto(`${BASE}/admin/shifts?tab=off`);
  check((await p.getByText(NAME).count()) === 0, '꺼 둔 검사용 틀은 목록에 보이지 않음');
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await db.from('profiles').update({ shift_template_id: null }).eq('id', emp!.id);
  await db.from('shift_templates').update({ active: false }).like('name', 'e2e-%').eq('active', true);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
