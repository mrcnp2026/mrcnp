// 게이트 6·7·8 실제 브라우저 확인 — 현황판 · 미기록 배너 → 정정 요청 → 처리함 승인 → 연장 확인 → 월간 집계 · CSV.
//   npm run e2e:gate6-8        (앱이 켜져 있어야 한다)
// ⚠️ 사번 test 직원에게 연습 정정·연장 요청이 쌓인다 (연습 모드, 집계에서 빠지고 지울 수 없다 — 4-1).
//    어제 날짜에 "빠진 출근 09:00·퇴근 20:00"을 정정으로 채우므로, 어제에 이미 승인된 정정이 있으면 conflict가 날 수 있다.
//    가짜 폰 등록은 끝나면 해제한다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = 'http://localhost:4123';
// 이 스크립트가 만든 가짜 폰만 해제한다 — 사람이 직접 등록한 폰(의뢰인 PC 등)은 건드리지 않는다 (2026-10-02)
const STARTED_AT = new Date().toISOString();
const SHOTS = path.join(import.meta.dirname, '..', '..', 'checks', '화면-캡처');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// 안전 정지: 사람이 직접 등록한 폰이 있으면 이 스크립트는 아무것도 하지 않는다 (2026-10-02 — 의뢰인 폰·PC 등록을 지우지 않게)
for (const no of ['admin', 'test']) {
  const { data: pp } = await db.from('profiles').select('id').eq('employee_no', no).maybeSingle();
  const { count } = pp ? await db.from('user_passkeys').select('id', { count: 'exact', head: true }).eq('employee_id', pp.id).is('revoked_at', null) : { count: 0 };
  if (count) {
    console.log(`중단: 사번 ${no}에 사람이 등록한 폰이 있습니다. 이 검사는 등록을 바꾸므로 실행하지 않습니다. (검사 전용 직원을 따로 만들어 쓰세요)`);
    process.exit(2);
  }
}
const results: string[] = [];
const check = (c: boolean, m: string) => results.push(`${c ? 'PASS' : 'FAIL'} ${m}`);
const kstDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
const today = kstDate(new Date());
const yesterday = kstDate(new Date(Date.now() - 86_400_000));
const ym = today.slice(0, 7);

async function invite(employeeNo: string, via: 'admin' | 'emergency') {
  const { data: p } = await db.from('profiles').select('id').eq('employee_no', employeeNo).single();
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString() }).eq('employee_id', p!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', p!.id).is('used_at', null).is('revoked_at', null);
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: p!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: via, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return { id: p!.id as string, url: `${BASE}/register?token=${token}` };
}

async function phonePage(browser: Awaited<ReturnType<typeof chromium.launch>>, width = 360) {
  const ctx = await browser.newContext({ viewport: { width, height: 780 } });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return p;
}
const noHScroll = async (p: Page, label: string) => check(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${label}: 가로 스크롤 없음`);
const shot = (p: Page, name: string) => p.screenshot({ path: path.join(SHOTS, `①-4_${name}.png`), fullPage: true });

const admin = await invite('admin', 'emergency');
const emp = await invite('test', 'admin');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // ── 등록 ──
  const a = await phonePage(browser);
  await a.goto(admin.url);
  await a.getByRole('button').filter({ hasText: /등록/ }).click();
  await a.getByRole('button').filter({ hasText: /계속/ }).click();
  await a.waitForURL('**/punch'); // 관리자도 출퇴근 홈에서 시작 (2026-10-02)
  const e = await phonePage(browser);
  await e.goto(emp.url);
  await e.getByRole('button', { name: /Register this phone/ }).click();
  await e.getByRole('button', { name: 'Continue' }).click();
  await e.waitForURL('**/punch');

  // ── 게이트 7: 미기록 배너 — 계정을 만든 날(입사일 미입력) 전 날짜로는 띄우지 않는다 (7-8 요점 3) ──
  const bannerVisible = await e.locator('section[role=status]').isVisible();
  check(!bannerVisible, '오늘 만든 계정에는 지난 날짜 미기록 배너가 안 뜸 (입사 전 날짜 제외)');
  const mainBtn = await e.getByRole('button', { name: /Clock (in|out)/ }).boundingBox();
  check(!!mainBtn && mainBtn.y + mainBtn.height <= 780, '주 버튼이 첫 화면에 보임');
  await shot(e, '게이트7_01_직원홈');

  // ── 정정 요청 (어제 빠진 출근 09:00·퇴근 20:00). 이전 실행에서 이미 대기 중이면 새로 만들지 않는다 ──
  for (const [kind, time] of [['in', '09:00'], ['out', '20:00']] as const) {
    const { data: already } = await db.from('punch_corrections').select('id').eq('employee_id', emp.id).eq('work_date', yesterday).eq('kind', kind).in('status', ['pending', 'approved']).eq('is_test', true);
    await e.goto(`${BASE}/punch/corrections?date=${yesterday}&kind=${kind}`);
    check((await e.locator('input[name=workDate]').inputValue()) === yesterday, `배너 링크 형식(?date=&kind=)으로 열면 날짜가 미리 채워짐 (${kind})`);
    await e.locator('input[name=time]').fill(time);
    await e.locator('textarea[name=reason]').fill(kind === 'in' ? 'Forgot to clock in' : 'Forgot to clock out after client visit');
    await e.getByRole('button', { name: 'Send request' }).click();
    if (already?.length) {
      await e.getByText('already have a waiting request', { exact: false }).waitFor({ timeout: 15000 }).catch(() => {});
      check(true, `이미 있는 요청 (${kind}) — 새로 만들지 않음`);
    } else {
      await e.getByText('Request sent.', { exact: false }).waitFor({ timeout: 15000 });
      check(true, `정정 요청 보냄 (${kind})`);
    }
  }
  await e.goto(`${BASE}/punch/corrections?date=${yesterday}&kind=out`);
  await e.locator('input[name=time]').fill('20:00');
  await e.locator('textarea[name=reason]').fill('again');
  await e.getByRole('button', { name: 'Send request' }).click();
  const dupMsg = await e.getByText('already have a waiting request', { exact: false }).isVisible({ timeout: 15000 }).catch(() => false);
  await e.waitForTimeout(1500);
  check(dupMsg || (await e.getByText('already have a waiting request', { exact: false }).isVisible()), '같은 기록에 대기 중 요청이 있으면 또 보낼 수 없음');
  await noHScroll(e, '정정 요청 화면');
  await shot(e, '게이트8_01_직원_정정요청');

  // ── 게이트 6: 현황판 (연습 기록 보기) ──
  await a.goto(`${BASE}/admin?practice=1`);
  const tiles = await a.locator('[role=tablist] button').allInnerTexts();
  check(tiles.length === 5, `숫자 칸 5개 (${tiles.map((x) => x.replace(/\s+/g, ' ')).join(' / ')})`);
  const nums = tiles.map((x) => parseInt(x, 10));
  const totalText = await a.locator('[role=tablist] + *').first().innerText().catch(() => '');
  void totalText;
  const lastTileBox = await a.locator('[role=tablist] button').last().boundingBox();
  check(!!lastTileBox && lastTileBox.y + lastTileBox.height <= 780, '숫자 5칸이 스크롤 없이 첫 화면에 보임');
  const { count: activeCount } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('active', true);
  const offText = await a.locator('details summary').innerText().catch(() => '0');
  const off = parseInt(offText.replace(/\D/g, '') || '0', 10);
  check(nums.reduce((s, n) => s + n, 0) + off === activeCount, `5칸 합 ${nums.reduce((s, n) => s + n, 0)} + 휴무 ${off} = 활성 직원 ${activeCount}`);
  check((await a.locator('main').innerText()).includes('연습 기록입니다'), '연습 기록 보기에는 연습 배너가 붙음');
  await a.locator('[role=tablist] button').first().click();
  await noHScroll(a, '관리자 현황판');
  await shot(a, '게이트6_01_현황판_연습');
  await a.goto(`${BASE}/admin`);
  const liveNums = (await a.locator('[role=tablist] button').allInnerTexts()).map((x) => parseInt(x, 10));
  check(liveNums[0] + liveNums[1] + liveNums[3] + liveNums[4] === 0, '기본(실제) 현황판에는 연습 기록이 안 나옴 ← 4-6');
  const badge = await a.locator('nav a[href="/admin/inbox"] .num').innerText().catch(() => '');
  check(parseInt(badge, 10) >= 2, `처리함 탭 배지 = 대기 건수 (${badge})`);

  // ── 게이트 7·8: 처리함 — 정정 승인 (동시에 두 번 → 한 번만) ──
  await a.goto(`${BASE}/admin/inbox?practice=1`);
  await shot(a, '게이트7_02_처리함_정정대기');
  const { data: pend } = await db.from('punch_corrections').select('id, kind').eq('employee_id', emp.id).eq('status', 'pending').eq('work_date', yesterday);
  const inReq = pend!.find((x) => x.kind === 'in')!;
  const outReq = pend!.find((x) => x.kind === 'out')!;
  const [r1, r2] = await a.evaluate(
    (id) => Promise.all([0, 1].map(() => fetch(`/api/admin/corrections/${id}/decide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approved' }) }).then((r) => r.json()))),
    inReq.id,
  );
  check([r1.result, r2.result].sort().join(',') === 'already,ok', `두 관리자가 동시에 승인 → 하나만 반영, 나머지 "이미 처리됨" (${r1.result}, ${r2.result}) ← R-2의 6`);
  // 화면으로 두 번째 승인 (한 줄 요약 + 한 번 더 확인)
  await a.reload();
  const card = a.locator('#corrections article, #corrections section, #corrections > div').filter({ hasText: '퇴근' }).first();
  void card;
  await a.locator('#corrections').getByRole('button', { name: '승인' }).first().click();
  const confirmText = await a.locator('#corrections').innerText();
  check(confirmText.includes('승인할까요') && confirmText.includes('원래 기록은 절대 바뀌지 않습니다'), '승인 전에 무엇이 바뀌는지 한 줄 요약 + 확인');
  await a.locator('#corrections').getByRole('button', { name: '확인' }).click();
  await a.getByText('처리했습니다').first().waitFor({ timeout: 15000 });
  const { count: evCount } = await db.from('punch_events').select('id', { count: 'exact', head: true }).eq('employee_id', emp.id).eq('work_date', yesterday);
  check(evCount === 0, `빠진 기록 추가를 승인해도 punch_events 행은 0 그대로 (${evCount}) ← 4-8`);
  void outReq;

  // ── 연장 확인 요청이 생기고, 부분 승인 ──
  await a.goto(`${BASE}/admin/inbox?practice=1`);
  const otText = await a.locator('#overtime').innerText();
  check(otText.includes('시험 직원') && otText.includes('120분'), '어제 09:00~20:00 → 연장 120분 확인 요청이 처리함에 자동으로 생김');
  await shot(a, '게이트7_03_처리함_연장');
  await a.locator('#overtime').getByRole('button', { name: '부분 승인' }).first().click();
  await a.locator('#overtime input[type=number]').first().fill('60');
  await a.locator('#overtime').getByRole('button', { name: '다음' }).click();
  check((await a.locator('#overtime').innerText()).includes('연장 60분'), '부분 승인 확인 문구에 인정 분이 보임');
  await a.locator('#overtime').getByRole('button', { name: '확인' }).click();
  await a.getByText('처리했습니다').first().waitFor({ timeout: 15000 });
  const { data: otRow } = await db.from('overtime_requests').select('overtime_minutes, approved_minutes, status, approved_by').eq('employee_id', emp.id).eq('work_date', yesterday).eq('is_test', true).single();
  check(otRow!.overtime_minutes === 120 && otRow!.approved_minutes === 60 && otRow!.status === 'approved', `사실 120분은 그대로, 인정 60분 (${otRow!.overtime_minutes}/${otRow!.approved_minutes})`);
  check(otRow!.approved_by === admin.id, '누가 승인했는지 남음 ← R-2의 5');

  // ── 게이트 8: 월간 집계 + CSV ──
  await a.goto(`${BASE}/admin/records?m=${ym}&practice=1`);
  const recText = await a.locator('main').innerText();
  check(recText.includes('시험 직원'), '월간 집계에 시험 직원 카드');
  check(!(await a.locator('table').isVisible()), '폰 폭에서는 표가 아니라 카드');
  check(!recText.includes('급여 입력용'), '급여 담당자가 아닌 관리자에게 급여용 CSV 카드가 안 보임 ← R-2의 7');
  await noHScroll(a, '월간 집계');
  await shot(a, '게이트8_02_월간집계_폰');
  const pay = await a.evaluate(async (m) => (await fetch(`/api/admin/export/payroll?m=${m}&practice=1`)).status, ym);
  check(pay === 403, `급여용 CSV를 주소로 직접 불러도 거부 (${pay}) ← R-2의 7`);
  const csv = await a.evaluate(async (m) => (await fetch(`/api/admin/export/attendance?m=${m}&practice=1`)).text(), ym);
  const lines = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
  check(lines[0] === 'employee_no,name,work_date,kind,original_punched_at,corrected_punched_at,correction_type,correction_reason,ip_verified,source,is_test,record_note', '근태 증빙 CSV 머리글: 원본 시각·정정 시각이 별도 열');
  const addRows = lines.filter((l) => l.includes(`,${yesterday},`) && l.includes('add_missing'));
  check(addRows.length === 2 && addRows.every((l) => l.split(',')[4] === ''), `빠진 기록 추가 행은 원본 칸이 비고 정정 칸에만 시각 (${addRows.length}행)`);
  // 넓은 화면: 표 + 왼쪽 메뉴
  const wide = await a.context().newPage();
  await wide.setViewportSize({ width: 1280, height: 800 });
  await wide.goto(`${BASE}/admin/records?m=${ym}&practice=1`);
  check(await wide.locator('table').isVisible(), '넓은 화면에서는 표로 보임');
  const nav = await wide.locator('nav').first().boundingBox();
  check(!!nav && nav.x < 10 && nav.height > 500, '1024px 이상에서 관리자 메뉴가 왼쪽 세로로');
  await shot(wide, '게이트8_03_월간집계_넓은화면');
  await wide.close();

  // 직원 내 기록: 정정됨 + 연장 인정 표시
  await e.goto(`${BASE}/punch/records`);
  const my = await e.locator('main').innerText();
  check(my.includes('Corrected') && my.includes('Overtime: approved'), '직원 "내 기록"에 정정됨·연장 인정 상태가 보임');
  await noHScroll(e, '직원 내 기록');
  await shot(e, '게이트8_04_직원_내기록');
} catch (err) {
  results.push(`FAIL 중단: ${(err as Error).message.split('\n')[0]}`);
} finally {
  await browser.close();
  for (const id of [admin.id, emp.id]) {
    await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', id).is('revoked_at', null).gte('created_at', STARTED_AT);
  }
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
}
