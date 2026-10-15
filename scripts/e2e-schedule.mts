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
// 일정을 넣을 대상은 다른 검사 직원(e2e-audit2) — 2026-10-15 등급 규칙: 총괄관리자는 자기 일정을 스스로 넣지 않는다(다른 관리자가)
const { data: w } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit2').single();
await db.from('profiles').update({ active: true, role: 'employee', shift_template_id: null }).eq('id', w!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });

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

  // ── 하단 탭 (2026-10-15 모드별): 관리자 = 현황 · 요청 · 근태 · 휴가 · 전체 — 근무일정은 「전체」 격자에서 ──
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  const tabNames = (await p.locator('nav.fixed li').allTextContents()).map((x) => x.replace(/\d+/g, '').trim()); // 요청 배지 숫자는 뺀다
  check(tabNames.join() === '현황,요청,근태,휴가,전체', '관리자 하단 탭 5칸 (현황 · 요청 · 근태 · 휴가 · 전체)', tabNames.join());
  check(((await p.locator('nav.fixed a[aria-current="page"]').textContent()) ?? '').includes('현황'), '관리자 홈에서 「현황」 탭이 켜져 있음');
  await p.locator('nav.fixed').getByRole('button', { name: '전체' }).click();
  const all = p.locator('[data-all-apps]');
  await all.waitFor();
  check((await all.locator('a').count()) >= 8, '「전체」: 관리자 앱 + 통합설정 아이콘 격자', String(await all.locator('a').count()));
  await all.getByRole('link', { name: '근무일정 · 출퇴근' }).click();
  await p.waitForURL(/\/admin\/schedule/);
  check(true, '「전체 › 근무일정 · 출퇴근」 → 전체 일정');
  check(((await p.locator('nav.fixed a[aria-current="page"]').textContent()) ?? '').includes('근태'), '일정 화면에서는 「근태」 탭이 켜져 있음');
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  const myTabs = (await p.locator('nav.fixed li').allTextContents()).map((x) => x.trim());
  check(myTabs.join() === '홈,출퇴근,휴가,요청,내 급여', '직원 모드 하단 탭 5칸 (홈 · 출퇴근 · 휴가 · 요청 · 내 급여)', myTabs.join());
  await p.goto(`${BASE}/admin/schedule`);
  await p.waitForLoadState('networkidle');
  await p.waitForLoadState('networkidle');
  // 2026-10-15 폰(결정 사항 개발-38): 월 달력(날짜마다 근무 · 휴가 인원) + 고른 날의 직원 목록
  const ph = p.locator('[data-phone-schedule]');
  await ph.waitFor({ timeout: 20000 });
  check((await ph.getByRole('searchbox').count()) === 1 && (await ph.getByRole('link', { name: '내 일정', exact: true }).count()) === 1, '폰 위 줄: 이름 검색 · 부서 · [내 일정]');
  check((await ph.locator('a[aria-current="date"]').count()) === 1 && (await ph.locator('.grid-cols-7 > a').count()) >= 28 && (await ph.locator('[data-phone-day] h2').count()) === 1, '폰: 월 달력 + 오늘 고른 날의 목록', String(await ph.locator('.grid-cols-7 > a').count()));
  await shot('01-근무일정-이번주');

  // ── + 버튼 → 일정 넣는 창 ──
  await p.locator('[data-fab]').click();
  const sheet = p.getByRole('dialog');
  await sheet.waitFor();
  check(await sheet.getByRole('button', { name: '일정 넣기' }).isDisabled(), '직원을 고르기 전에는 넣을 수 없음');
  check((await sheet.getByLabel('근무일정 템플릿').count()) === 1 && (await sheet.getByLabel('근무일정 유형').count()) === 1, '양식에 틀 고르기·유형');
  await shot('02-일정-추가-창', false);
  await p.keyboard.press('Escape');

  // ── 특근(토) · 잔업(금) 넣기 ──
  let r = await post('/api/admin/schedule', { date: SAT, startTime: '08:00', endTime: '17:00', kind: 'holiday', templateId: null, note: '검사용 특근', employeeIds: [w!.id] });
  check(r.status === 200 && r.json.created === 1, '토요일 특근 일정 넣음', JSON.stringify(r.json));
  r = await post('/api/admin/schedule', { date: SAT, startTime: '08:00', endTime: '17:00', kind: 'holiday', templateId: null, note: '', employeeIds: [w!.id] });
  check(r.status === 200 && r.json.created === 0 && r.json.skipped === 1, '같은 일정을 또 보내도 한 건만', JSON.stringify(r.json));
  r = await post('/api/admin/schedule', { date: FRI, startTime: '17:30', endTime: '20:30', kind: 'extra', templateId: null, note: '', employeeIds: [w!.id] });
  check(r.status === 200 && r.json.created === 1, '금요일 잔업 일정 넣음', JSON.stringify(r.json));
  r = await post('/api/admin/schedule', { date: SAT, startTime: '18:00', endTime: '09:00', kind: 'none', employeeIds: [w!.id] });
  check(r.status === 400, '끝이 시작보다 이르면 거절', String(r.status));
  r = await post('/api/admin/schedule', { date: SAT, startTime: '08:00', endTime: '17:00', kind: 'none', employeeIds: [] });
  check(r.status === 400, '직원 없이 보내면 거절', String(r.status));

  // ── 전체 보기 ──
  await p.goto(`${BASE}/admin/schedule?d=${SAT}`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('link', { name: w!.name }).count()) === 1 && (await p.getByText('휴일 근무(특근)').count()) > 0 && (await p.getByText(/검사용 특근/).count()) > 0, '토요일 화면에 특근 일정 한 줄 (유형 배지·메모)');
  await shot('03-근무일정-특근');
  // ── 이름을 누르면 일정 상세 (2026-10-11) ──
  await p.getByRole('link', { name: w!.name }).click();
  await p.waitForURL(/\/admin\/schedule\/[^/]+\/\d{4}-\d{2}-\d{2}/);
  await p.getByRole('heading', { name: '근무일정', exact: true }).waitFor({ timeout: 20000 });
  const sl = await p.locator('main dt').allTextContents();
  check((await p.locator('header').locator('visible=true').count()) === 0 && ((await p.locator('main p.text-3xl').textContent()) ?? '').includes('08:00 - 17:00') && (await p.getByText('근무 8시간 0분 / 휴게 1시간 0분').count()) === 1, '일정 상세: 큰 시각 08:00 - 17:00 · 근무 8시간 / 휴게 1시간', (await p.locator('main p.text-3xl').textContent()) ?? '');
  check(['근무일정 유형', '직원', '지점', '직무', '근무일정 템플릿', '휴게', '일정노트', '출퇴근기록'].every((x) => sl.includes(x)) && (await p.getByText('검사용 특근').count()) === 1, '일정 상세: 항목 — 값 줄 · 일정노트', sl.join(','));
  await p.waitForTimeout(400);
  await shot('03c-근무일정-상세');
  await p.goto(`${BASE}/admin/schedule?d=${FRI}`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('link', { name: w!.name }).count()) === 2 && (await p.getByText('17:30').count()) > 0 && (await p.getByText('잔업').count()) > 0, '금요일 화면에 평소 일정 + 잔업 두 줄');
  // ── 기간 목록(PC 목록형): 금~토 · 이름 검색 · 31일 줄임 (2026-10-15 폰은 달력이라 기간 목록은 PC에서) ──
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/schedule?from=${FRI}&to=${SAT}&v=list`);
  await p.waitForLoadState('networkidle');
  const listRows = p.locator('main table tbody tr', { hasText: w!.name });
  check((await listRows.count()) === 3, '금~토 기간 목록형: 검사 계정 세 줄(금 평소 · 금 잔업 · 토 특근)', String(await listRows.count()));
  check((await listRows.filter({ hasText: '08:00 - 17:00' }).filter({ hasText: '9시간 0분' }).count()) === 1, '토요일 특근 08:00 - 17:00 · 9시간');
  await shot('03b-근무일정-기간');
  await p.goto(`${BASE}/admin/schedule?from=${FRI}&to=${SAT}&v=list&q=${encodeURIComponent('없는이름zz')}`);
  await p.waitForLoadState('networkidle');
  check((await p.getByText('이 기간에는 일정이 없습니다.').filter({ visible: true }).count()) === 1, '이름 검색에 맞는 사람이 없으면 빈 안내');
  await p.goto(`${BASE}/admin/schedule?from=2026-01-01&to=2026-12-31`);
  await p.waitForLoadState('networkidle');
  check(((await p.locator('main p.num').first().textContent()) ?? '').includes('1월 31일'), '기간이 너무 길면 31일로 줄임', (await p.locator('main p.num').first().textContent()) ?? '');
  await p.goto(`${BASE}/admin/schedule?v=month`);
  await p.waitForLoadState('networkidle');
  check((await p.locator('main .grid-cols-7 > div.min-h-32').count()) >= 28, 'PC 월 보기: 기간 없이 열어도 그달 전체 달력', String(await p.locator('main .grid-cols-7 > div.min-h-32').count()));
  await p.setViewportSize({ width: 390, height: 844 });

  // ── 내 일정 ──
  // 2026-10-15: 내 일정은 「내 근태현황」 주간 달력 — 다음 주로 넘겨 금 · 토 칸을 본다
  // 내 일정 확인용: 로그인한 관리자 본인 일정은 DB로 직접 넣는다(본인 일정은 다른 관리자가 넣는 규칙이라 화면 API는 막는다)
  await db.from('shifts').insert([
    { employee_id: emp!.id, work_date: SAT, start_time: '08:00', end_time: '17:00', kind: 'holiday', note: '검사용 특근' },
    { employee_id: emp!.id, work_date: FRI, start_time: '17:30', end_time: '20:30', kind: 'extra', note: null },
  ]);
  await p.goto(`${BASE}/punch/schedule?v=week&d=${FRI}`);
  await p.waitForLoadState('networkidle');
  const wk = await p.locator('[data-week-days]').innerText();
  check((await p.locator('[data-week-days] > li').count()) === 7 && wk.includes('20:30') && wk.includes('08:00') && wk.includes('휴일 근무(특근)'), '내 일정(주간)에 다음 주 잔업·특근이 보임', wk.replace(/\s+/g, ' ').slice(0, 200));
  check((await p.getByRole('tab', { name: '주간' }).getAttribute('aria-selected')) === 'true' && (await p.locator('[data-week-summary]').count()) === 1, '근무일정은 주간 보기가 먼저 · 주간 요약');
  await shot('04-내-일정');

  // ── 취소 ──
  await p.goto(`${BASE}/admin/schedule?d=${SAT}`);
  await p.getByRole('button', { name: `${w!.name} 일정 취소`, exact: true }).click();
  await p.getByRole('button', { name: '취소', exact: true }).click();
  await p.getByRole('button', { name: `${w!.name} 일정 취소`, exact: true }).waitFor({ state: 'detached', timeout: 20000 });
  let left: { active: boolean }[] | null = null;
  for (let i = 0; i < 20; i++) {
    ({ data: left } = await db.from('shifts').select('active').eq('employee_id', w!.id).eq('work_date', SAT));
    if (left?.length && left.every((x) => x.active === false)) break;
    await p.waitForTimeout(500);
  }
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
  // PC (2026-10-11): 달력형 표 + 오른쪽 위 [추가] 버튼 → 가운데 팝업
  check(await p.locator('main table').first().isVisible(), 'PC에서는 달력형 표가 보임');
  check(!(await p.getByRole('button', { name: '일정 넣기' }).isVisible()), 'PC에서 일정 넣는 양식은 닫혀 있음');
  await p.locator('main button:has(svg.lucide-plus)').first().click();
  check(await p.getByRole('button', { name: '일정 넣기' }).isVisible(), '추가 버튼을 누르면 팝업으로 양식이 열림');
  await p.keyboard.press('Escape');
  check(!(await p.getByRole('button', { name: '일정 넣기' }).isVisible()), 'Esc로 팝업이 닫힘');
  await shot('05-PC-근무일정');
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await db.from('shifts').update({ active: false }).in('employee_id', [emp!.id, w!.id]).eq('active', true);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('profiles').update({ active: false }).eq('id', w!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
