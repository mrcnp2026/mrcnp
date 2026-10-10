// 휴가 종류·시간 단위 휴가 화면 검사 (2026-10-10) — 검사 전용 관리자(e2e-audit)로 종류를 만들고, 신청 양식·신청·목록·끄기를 본다.
//   npx tsx scripts/e2e-leave-types.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 만든 종류는 이름이 e2e-로 시작하고 끝나면 꺼 둔다 (지우지 않는 표 — 다음 실행 때 같은 줄을 다시 켜서 쓴다).
// 휴가 신청은 연습 기록이고 먼 미래의 하루로 낸 뒤 취소한다. 출퇴근 기록은 만들지 않는다.
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

// 시험 날짜: 2년 뒤의 월요일 (실행마다 다른 주)
const d = new Date();
d.setUTCFullYear(d.getUTCFullYear() + 2);
while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
d.setUTCDate(d.getUTCDate() + Math.floor(Math.random() * 40) * 7);
const DAY = d.toISOString().slice(0, 10);
const FIXED = 'e2e-10시 반차';
const FREE = 'e2e-외출 1H';
const GROUP = 'e2e-묶음';

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const codes: string[] = [];
const requestIds: string[] = [];

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

  // ── 연차 관리 → 휴가 종류 ──
  await p.goto(`${BASE}/admin/leave`);
  await p.getByRole('link', { name: /휴가 종류/ }).click();
  await p.waitForURL(/\/admin\/leave\/types/);
  await p.waitForLoadState('networkidle');
  check((await p.getByText('연차', { exact: true }).count()) > 0 && (await p.getByText('반반차', { exact: true }).count()) > 0, '기본 종류(연차·반차·반반차 …)가 목록에 있음');
  check((await p.getByText(/8시간 · 연차 1일 차감/).count()) > 0 && (await p.getByText(/4시간 · 연차 0.5일 차감/).count()) > 0, '종류마다 시간·차감 일수가 보임');

  // ── 종류 만들기: 시각이 정해진 반차 / 시각 없는 1시간 외출 ──
  const make = async (name: string, body: Record<string, unknown>) => {
    const { data: old } = await db.from('leave_types').select('code').eq('name', name).order('code').limit(1);
    if (old?.length) {
      // 지난 실행에서 꺼 둔 줄을 다시 켜고 값을 맞춘다
      const on = await post(`/api/admin/leave/types/${old[0].code}`, { active: true });
      const up = await post(`/api/admin/leave/types/${old[0].code}`, { name, ...body });
      check(on.status === 200 && up.status === 200, `「${name}」 다시 켜고 고침`, `${on.status} ${up.status}`);
      return old[0].code as string;
    }
    const r = await post('/api/admin/leave/types', { name, ...body });
    check(r.status === 200 && typeof r.json.code === 'string', `「${name}」 만듦`, JSON.stringify(r.json));
    return r.json.code as string;
  };
  const fixed = await make(FIXED, { hours: 4, startTime: '10:00', endTime: '15:00', groupName: GROUP, isPaid: true, deductsBalance: false });
  const free = await make(FREE, { hours: 1, startTime: null, endTime: null, groupName: GROUP, isPaid: true, deductsBalance: false });
  codes.push(fixed, free);
  let r = await post('/api/admin/leave/types', { name: FIXED, hours: 4, isPaid: true, deductsBalance: true });
  check(r.status === 409, '같은 이름으로 또 만들면 거절', String(r.status));
  r = await post('/api/admin/leave/types', { name: 'e2e-이상한 시간', hours: 0.25, isPaid: true, deductsBalance: true });
  check(r.status === 400, '30분 단위가 아닌 시간은 거절', String(r.status));
  r = await post('/api/admin/leave/types', { name: 'e2e-이상한 시각', hours: 4, startTime: '15:00', endTime: '10:00', isPaid: true, deductsBalance: true });
  check(r.status === 400, '끝이 시작보다 이른 시각은 거절', String(r.status));
  const { data: row } = await db.from('leave_types').select('day_unit, hours, start_time, end_time, builtin').eq('code', fixed).single();
  check(Number(row!.day_unit) === 0.5 && Number(row!.hours) === 4 && row!.start_time === '10:00:00' && row!.end_time === '15:00:00' && row!.builtin === false, '차감 일수는 서버가 시간 ÷ 8로 정함', JSON.stringify(row));
  const { data: freeRow } = await db.from('leave_types').select('day_unit').eq('code', free).single();
  check(Number(freeRow!.day_unit) === 0.125, '1시간 = 0.125일', String(freeRow!.day_unit));

  // ── 기본 종류는 이름·시간이 잠겨 있다 ──
  const { data: before } = await db.from('leave_types').select('*').eq('code', 'quarter').single();
  r = await post('/api/admin/leave/types/quarter', { name: '바꾼 이름', hours: 8, startTime: before!.start_time?.slice(0, 5) ?? null, endTime: before!.end_time?.slice(0, 5) ?? null, groupName: before!.group_name, isPaid: before!.is_paid, deductsBalance: before!.deducts_balance });
  const { data: after } = await db.from('leave_types').select('name, hours, day_unit').eq('code', 'quarter').single();
  check(r.status === 200 && after!.name === before!.name && Number(after!.hours) === Number(before!.hours) && Number(after!.day_unit) === Number(before!.day_unit), '기본 종류의 이름·시간은 바뀌지 않음', JSON.stringify(after));

  // ── 목록·상세 화면 ──
  await p.goto(`${BASE}/admin/leave/types`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('heading', { name: GROUP }).count()) === 1 && (await p.getByText(/4시간 · 10:00 - 15:00 · 차감 없음/).count()) === 1, '만든 종류가 묶음 아래에 시각과 함께 보임');
  await shot('01-휴가-종류');
  await p.locator('[data-fab]').click();
  const sheet = p.getByRole('dialog');
  await sheet.waitFor();
  check((await sheet.getByLabel('이름').count()) === 1 && (await sheet.getByLabel('시간').count()) === 1 && (await sheet.getByLabel('시작·끝 시각을 정해 둠').count()) === 1, '+ 버튼 → 추가 창에 이름·시간·시각 칸');
  await sheet.getByLabel('시작·끝 시각을 정해 둠').check();
  check((await sheet.locator('label', { hasText: /^시작/ }).count()) === 2 && (await sheet.locator('label', { hasText: /^끝/ }).count()) === 1, '시각을 정하면 시작·끝 칸이 열림');
  await shot('02-휴가-종류-추가', false);
  await p.keyboard.press('Escape');
  await p.getByRole('link', { name: new RegExp(FIXED) }).click();
  await p.waitForURL(new RegExp(`/admin/leave/types/${fixed}`));
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('heading', { name: FIXED }).count()) === 1 && (await p.getByRole('button', { name: '이 종류 끄기' }).count()) === 1, '상세 화면: 고치는 양식과 끄기 버튼');
  await shot('03-휴가-종류-상세');

  // ── 직원 신청 양식 ──
  await p.goto(`${BASE}/punch/leave`);
  await p.waitForLoadState('networkidle');
  await p.locator('[data-fab]').click();
  await p.getByRole('button', { name: '휴가 신청', exact: true }).click();
  const form = p.getByRole('dialog');
  await form.waitFor();
  const sel = form.getByLabel('종류');
  check((await sel.locator('optgroup').count()) >= 1 && (await sel.locator('option', { hasText: FIXED }).count()) === 1, '신청 양식의 종류가 묶음별로 나오고 새 종류가 들어 있음');
  await sel.selectOption(fixed);
  check((await form.getByText(/4시간 · 10:00 - 15:00 · 연차 차감 없음/).count()) === 1 && (await form.getByLabel(/시작 시각/).count()) === 0, '시각이 정해진 종류: 시각이 안내로 나오고 시작 시각 칸은 없음');
  await sel.selectOption(free);
  check((await form.getByLabel(/시작 시각/).count()) === 1, '시각이 없는 짧은 종류: 시작 시각 칸이 나옴');
  await shot('04-휴가-신청-양식', false);
  await p.keyboard.press('Escape');

  // ── 신청 ──
  r = await post('/api/leave', { typeCode: free, startDate: DAY, endDate: DAY, startTime: '14:00', reason: '검사용' });
  check(r.status === 200 && r.json.days === 0.125, '1시간 외출 신청 = 0.125일', JSON.stringify(r.json));
  if (r.json.id) requestIds.push(r.json.id);
  const { data: q1 } = await db.from('leave_requests').select('start_time, end_time, days').eq('id', r.json.id).single();
  check(q1?.start_time === '14:00:00' && q1?.end_time === '15:00:00', '적은 시작 시각 + 1시간이 신청에 남음', JSON.stringify(q1));
  r = await post('/api/leave', { typeCode: fixed, startDate: DAY, endDate: DAY, startTime: '07:00' });
  check(r.status === 200 && r.json.days === 0.5, '10시 반차 신청 = 0.5일', JSON.stringify(r.json));
  if (r.json.id) requestIds.push(r.json.id);
  const { data: q2 } = await db.from('leave_requests').select('start_time, end_time').eq('id', r.json.id).single();
  check(q2?.start_time === '10:00:00' && q2?.end_time === '15:00:00', '종류에 정해진 시각이 신청에 남음 (보낸 시각은 무시)', JSON.stringify(q2));
  r = await post('/api/leave', { typeCode: free, startDate: DAY, endDate: DAY, startTime: '99:00' });
  check(r.status === 400, '이상한 시작 시각은 거절', String(r.status));
  r = await post('/api/leave', { typeCode: 'half', startDate: DAY, endDate: DAY });
  check(r.status === 409, '같은 날 합이 하루를 넘으면 거절 (0.125 + 0.5 + 0.5)', String(r.status));

  await p.goto(`${BASE}/punch/leave`);
  await p.waitForLoadState('networkidle');
  check((await p.getByText(/14:00 - 15:00/).count()) >= 1 && (await p.getByText(/10:00 - 15:00/).count()) >= 1 && (await p.getByText(new RegExp(`${FREE} · 0.125일`)).count()) >= 1, '내 신청 목록에 종류 이름·일수·시각');
  await shot('05-내-신청');
  await p.goto(`${BASE}/admin/inbox`);
  await p.waitForLoadState('networkidle');
  check((await p.getByText(new RegExp(FIXED)).count()) >= 1, '관리자 요청함에 새 종류 이름으로 보임');

  // ── 끄기 ──
  r = await post(`/api/admin/leave/types/${free}`, { active: false });
  check(r.status === 200, '종류 끄기', String(r.status));
  r = await post('/api/leave', { typeCode: free, startDate: DAY, endDate: DAY });
  check(r.status === 400, '꺼 둔 종류로는 신청할 수 없음', String(r.status));
  await p.goto(`${BASE}/punch/leave`);
  await p.waitForLoadState('networkidle');
  check((await p.getByText(new RegExp(`${FREE} · 0.125일`)).count()) >= 1, '꺼도 이미 낸 신청은 이름 그대로 보임');

  // ── 가로 넘침 · PC ──
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of ['/admin/leave/types', `/admin/leave/types/${fixed}`, '/punch/leave']) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= w, `가로 넘침 없음 @${w} ${url.replace(fixed, '…')}`, `${sw}px`);
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/leave/types`);
  await p.waitForLoadState('networkidle');
  check(await p.getByRole('button', { name: '만들기' }).isVisible(), 'PC에서는 추가 양식이 옆에 펼쳐져 있음');
  await shot('06-PC-휴가-종류');
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  for (const id of requestIds) await db.rpc('cancel_leave', { p_id: id, p_employee: emp!.id });
  if (codes.length) await db.from('leave_types').update({ active: false }).in('code', codes);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
