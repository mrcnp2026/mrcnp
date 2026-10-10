// 근무일정 화면 검사 (2026-10-10 2단계) — 검사 전용 관리자(e2e-audit)에게 다음 주 특근·잔업 일정을 넣고, 전체 보기·내 일정·취소를 본다.
//   npx tsx scripts/e2e-schedule.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 넣은 일정은 검사 계정 것뿐이고 끝나면 전부 취소한다 (지우지 않는 표라 줄은 남지만 화면에는 보이지 않는다). 출퇴근 기록은 만들지 않는다.
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
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', shift_template_id: null }).eq('id', emp!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

// 다음 주 금요일(근무일)·토요일(휴일) — 한국 시각 기준
const kst = new Date(Date.now() + 9 * 3600e3);
const dow = (kst.getUTCDay() + 6) % 7; // 월=0
const day = (offset: number) => new Date(kst.getTime() + (offset - dow) * 86400e3).toISOString().slice(0, 10);
const FRI = day(11);
const SAT = day(12);
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

  // ── 하단 탭 5개 · 근무일정 탭 ──
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  const tabs = p.locator('nav.fixed a');
  check((await tabs.count()) === 5, '하단 탭이 5개 (홈·요청·근무일정·출퇴근기록·휴가)', String(await tabs.count()));
  await p.locator('nav.fixed').getByRole('link', { name: '근무일정' }).click();
  await p.waitForURL(/\/admin\/schedule/);
  check(true, '관리자는 「근무일정」 탭에서 전체 일정이 먼저 열림');
  await p.waitForLoadState('networkidle');
  await p.getByRole('search').waitFor({ timeout: 20000 });
  check((await p.getByRole('search').count()) === 1 && (await p.getByRole('button', { name: '기간 고르기' }).count()) === 1 && (await p.getByRole('link', { name: '내 일정', exact: true }).count()) === 1, '위 줄: 검색 · 기간 · [내 일정]');
  check((await p.locator('h2.num').count()) >= 1 && (await p.locator('h2.num').first().getByText(/\d+시간 \d+분/).count()) === 1, '날짜 머리줄마다 그날 계획 시간 합 (기본: 이번 주)', String(await p.locator('h2.num').count()));
  await shot('01-근무일정-이번주');

  // ── + 버튼 → 일정 넣는 창 ──
  await p.locator('[data-fab]').click();
  const sheet = p.getByRole('dialog');
  await sheet.waitFor();
  check(await sheet.getByRole('button', { name: '일정 넣기' }).isDisabled(), '직원을 고르기 전에는 넣을 수 없음');
  check((await sheet.getByLabel('근무일정 틀').count()) === 1 && (await sheet.getByLabel('근무일정 유형').count()) === 1, '양식에 틀 고르기·유형');
  await shot('02-일정-추가-창', false);
  await p.keyboard.press('Escape');

  // ── 특근(토) · 잔업(금) 넣기 ──
  let r = await post('/api/admin/schedule', { date: SAT, startTime: '08:00', endTime: '17:00', kind: 'holiday', templateId: null, note: '검사용 특근', employeeIds: [emp!.id] });
  check(r.status === 200 && r.json.created === 1, '토요일 특근 일정 넣음', JSON.stringify(r.json));
  r = await post('/api/admin/schedule', { date: SAT, startTime: '08:00', endTime: '17:00', kind: 'holiday', templateId: null, note: '', employeeIds: [emp!.id] });
  check(r.status === 200 && r.json.created === 0 && r.json.skipped === 1, '같은 일정을 또 보내도 한 건만', JSON.stringify(r.json));
  r = await post('/api/admin/schedule', { date: FRI, startTime: '17:30', endTime: '20:30', kind: 'extra', templateId: null, note: '', employeeIds: [emp!.id] });
  check(r.status === 200 && r.json.created === 1, '금요일 잔업 일정 넣음', JSON.stringify(r.json));
  r = await post('/api/admin/schedule', { date: SAT, startTime: '18:00', endTime: '09:00', kind: 'none', employeeIds: [emp!.id] });
  check(r.status === 400, '끝이 시작보다 이르면 거절', String(r.status));
  r = await post('/api/admin/schedule', { date: SAT, startTime: '08:00', endTime: '17:00', kind: 'none', employeeIds: [] });
  check(r.status === 400, '직원 없이 보내면 거절', String(r.status));

  // ── 전체 보기 ──
  await p.goto(`${BASE}/admin/schedule?d=${SAT}`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('link', { name: emp!.name }).count()) === 1 && (await p.getByText('휴일 근무(특근)').count()) > 0 && (await p.getByText(/검사용 특근/).count()) > 0, '토요일 화면에 특근 일정 한 줄 (유형 배지·메모)');
  await shot('03-근무일정-특근');
  await p.goto(`${BASE}/admin/schedule?d=${FRI}`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('link', { name: emp!.name }).count()) === 2 && (await p.getByText('17:30').count()) > 0 && (await p.getByText('잔업').count()) > 0, '금요일 화면에 평소 일정 + 잔업 두 줄');
  // ── 기간 목록: 금~토 두 날짜 머리줄 · 이름 검색 ──
  await p.goto(`${BASE}/admin/schedule?from=${FRI}&to=${SAT}`);
  await p.waitForLoadState('networkidle');
  check((await p.locator('h2.num').count()) === 2 && (await p.getByRole('link', { name: emp!.name }).count()) === 3, '금~토 기간: 날짜 머리줄 2개 · 검사 계정 세 줄', `${await p.locator('h2.num').count()} / ${await p.getByRole('link', { name: emp!.name }).count()}`);
  check((await p.locator('h2.num').nth(1).getByText('9시간 0분').count()) === 1, '토요일 합계는 특근 9시간 (검사 계정만 일정이 있는 날)', (await p.locator('h2.num').nth(1).textContent()) ?? '');
  await shot('03b-근무일정-기간');
  await p.goto(`${BASE}/admin/schedule?from=${FRI}&to=${SAT}&q=${encodeURIComponent('없는이름zz')}`);
  await p.waitForLoadState('networkidle');
  check((await p.getByText('이 기간에는 일정이 없습니다.').count()) === 1, '이름 검색에 맞는 사람이 없으면 빈 안내');
  await p.goto(`${BASE}/admin/schedule?from=2026-01-01&to=2026-12-31`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('button', { name: '기간 고르기' }).textContent())?.includes('01.01 - 01.31') ?? false, '기간이 너무 길면 31일로 줄임', (await p.getByRole('button', { name: '기간 고르기' }).textContent()) ?? '');

  // ── 내 일정 ──
  await p.goto(`${BASE}/punch/schedule`);
  await p.waitForLoadState('networkidle');
  check((await p.getByText('17:30 - 20:30').count()) === 1 && (await p.getByText('08:00 - 17:00').count()) >= 1 && (await p.getByText('휴일 근무(특근)').count()) === 1, '내 일정에 다음 주 잔업·특근이 보임');
  check((await p.getByText('이번 주').count()) > 0 && (await p.getByText('다음 주').count()) > 0 && (await p.getByText(/계획 \d+시간/).count()) === 2, '이번 주·다음 주 묶음과 계획 시간');
  await shot('04-내-일정');

  // ── 취소 ──
  await p.goto(`${BASE}/admin/schedule?d=${SAT}`);
  await p.getByRole('button', { name: `${emp!.name} 일정 취소`, exact: true }).click();
  await p.getByRole('button', { name: '취소', exact: true }).click();
  await p.getByText('이 기간에는 일정이 없습니다.').waitFor({ timeout: 20000 });
  const { data: left } = await db.from('shifts').select('active').eq('employee_id', emp!.id).eq('work_date', SAT);
  check((left?.length ?? 0) >= 1 && left!.every((x) => x.active === false), '취소하면 꺼짐 (지우지 않음) · 화면에서 사라짐');

  // ── 가로 넘침 · PC ──
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of [`/admin/schedule?d=${FRI}`, '/punch/schedule']) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= w, `가로 넘침 없음 @${w} ${url.split('?')[0]}`, `${sw}px`);
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/schedule?d=${FRI}`);
  await p.waitForLoadState('networkidle');
  check(await p.getByRole('button', { name: '일정 넣기' }).isVisible(), 'PC에서는 일정 넣는 양식이 옆에 펼쳐져 있음');
  await shot('05-PC-근무일정');
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await db.from('shifts').update({ active: false }).eq('employee_id', emp!.id).eq('active', true);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
