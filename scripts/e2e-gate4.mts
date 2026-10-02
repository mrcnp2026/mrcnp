// 게이트 4 실제 서버 확인 — 켜진 앱(http://localhost:4123)에 진짜 요청을 보낸다.
//   npm run e2e:gate4
// ① API: 검사용 가짜 폰(SoftAuthenticator)을 사번 test 직원에 등록하고 출퇴근 API의 규칙을 확인한다
// ② 화면: Chrome + 가상 인증기로 직원 홈에서 출근 버튼을 눌러 보고 360px 캡처를 남긴다
// ⚠️ 사번 test 직원에게 **연습 기록**(is_test=true)이 쌓인다. 연습 기록은 집계·현황판에서 빠지고, 지울 수 없다 (4-1).
//    끝나면 가짜 폰 등록은 해제한다(해제 기록은 남음).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { SoftAuthenticator } from '../tests/helpers/soft-authenticator.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = 'http://localhost:4123';
const SHOTS = path.join(import.meta.dirname, '..', '..', 'checks', '화면-캡처');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const results: string[] = [];
const check = (c: boolean, m: string) => results.push(`${c ? 'PASS' : 'FAIL'} ${m}`);

async function post(p: string, body?: unknown) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown>, rid: r.headers.get('x-request-id') };
}

async function freshInvite(employeeId: string) {
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString() }).eq('employee_id', employeeId).is('revoked_at', null);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', employeeId).is('used_at', null).is('revoked_at', null);
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: employeeId, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3_600_000).toISOString() });
  return token;
}

async function softPunch(phone: SoftAuthenticator, kind: string, extra: Record<string, unknown> = {}) {
  const o = await post('/api/punch/options');
  return post('/api/punch', { kind, response: phone.assert(o.json.challenge as string), ...extra });
}

const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'test').single();
const empId = emp!.id as string;

// 직전 실행과 60초 안에 붙으면 중복 방지(7-4 요점 1)가 정상적으로 걸려 결과가 달라진다 — 마지막 기록 뒤 61초를 기다린다
{
  const { data: lastEv } = await db.from('punch_events').select('created_at').eq('employee_id', empId).order('created_at', { ascending: false }).limit(1);
  const wait = lastEv?.[0] ? new Date(lastEv[0].created_at).getTime() + 61_000 - Date.now() : 0;
  if (wait > 0) {
    console.log(`직전 기록과 60초를 띄우려고 ${Math.ceil(wait / 1000)}초 기다립니다`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

try {
  // ── ① API ──
  const token = await freshInvite(empId);
  const phone = new SoftAuthenticator('localhost', BASE);
  const ro = await post('/api/passkey/register/options', { token });
  const rv = await post('/api/passkey/register/verify', { token, response: phone.register(ro.json.challenge as string) });
  check(rv.status === 200, `가짜 폰 등록 (${rv.status})`);

  const noKey = await post('/api/punch', { kind: 'in' });
  check(noKey.status === 401 && !!noKey.rid, `폰 확인 없이 출퇴근 API → 거부 (${noKey.status}) ← B-14`);

  const lo = await post('/api/passkey/login/options');
  const wrongPurpose = await post('/api/punch', { kind: 'in', response: phone.assert(lo.json.challenge as string) });
  check(wrongPurpose.status === 400 && wrongPurpose.json.error === 'challenge_invalid', '로그인용 챌린지로는 출퇴근이 안 됨');

  const before = Date.now();
  // 거의 동시에 출근 2번 (서로 다른 폰 확인) → 기록 1건 (R-4, 7-4 요점 1)
  const [a, b] = await Promise.all([softPunch(phone, 'in'), softPunch(phone, 'in')]);
  check(a.status === 200 && b.status === 200, `동시 출근 2번 모두 응답 200 (${a.status}, ${b.status})`);
  check([a.json.deduped, b.json.deduped].filter(Boolean).length === 1, '동시 2번 중 1번만 새 기록, 나머지는 "이미 찍음"');
  check(a.json.punchedAt === b.json.punchedAt, '두 응답이 같은 기록(같은 시각)을 가리킴');
  check(a.json.isTest === true, '새 기록은 연습 모드(is_test=true) ← 4-6');
  check(a.json.ipVerified === false, '사무실 대역이 없으니 미검증으로 — 그래도 기록은 됨 ← 4-3');

  // 요청 본문에 시각·검증·연습 여부를 넣어도 저장값이 바뀌지 않는다 (B-23)
  const tampered = await softPunch(phone, 'out', {
    punched_at: '2020-01-01T00:00:00Z', punchedAt: '2020-01-01T00:00:00Z', ip_verified: true, ipVerified: true,
    is_test: false, isTest: false, work_date: '2020-01-01', employee_id: '00000000-0000-0000-0000-000000000000', client_ip: '203.0.113.1',
  });
  check(tampered.status === 200, `퇴근 (${tampered.status})`);
  const { data: last } = await db.from('punch_events').select('punched_at, ip_verified, is_test, work_date, employee_id, client_ip, passkey_id')
    .eq('employee_id', empId).eq('kind', 'out').order('created_at', { ascending: false }).limit(1).single();
  const at = new Date(last!.punched_at).getTime();
  check(at >= before - 5000 && at <= Date.now() + 5000, `저장 시각 = 서버 시각 (본문 2020년 무시) ← B-23`);
  check(last!.ip_verified === false && last!.is_test === true, '본문 ip_verified·is_test 무시');
  check(last!.work_date !== '2020-01-01' && last!.client_ip !== '203.0.113.1', '본문 work_date·client_ip 무시');
  check(!!last!.passkey_id, '어느 폰으로 찍었는지(passkey_id) 남음');

  // 해제된 폰으로는 안 찍힘
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString() }).eq('employee_id', empId).is('revoked_at', null);
  const revoked = await softPunch(phone, 'in');
  check(revoked.status === 400 && revoked.json.error === 'passkey_revoked', '해제된 폰으로 출퇴근 → 거부');

  // ── ② 화면 ──
  const token2 = await freshInvite(empId);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await p.goto(`${BASE}/register?token=${token2}`);
    await p.getByRole('button', { name: /Register this phone/ }).click();
    await p.getByRole('button', { name: 'Continue' }).click();
    await p.waitForURL('**/punch');
    const main = p.getByRole('button', { name: /Clock (in|out)/ });
    await main.waitFor();
    const box = await main.boundingBox();
    check(!!box && box.y + box.height <= 780, `주 버튼이 첫 화면(360×780) 안에 보임 (아래 끝 ${Math.round((box?.y ?? 0) + (box?.height ?? 0))}px)`);
    check(!!box && box.width >= 360 * 0.7 && box.height >= 96, `주 버튼 크기 폭 ${Math.round(box?.width ?? 0)}px(70%↑) · 높이 ${Math.round(box?.height ?? 0)}px(96↑)`);
    check((await p.locator('main').innerText()).includes('Practice'), '연습 배지가 카드 안에 보임');
    check(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), '직원 홈 360px 가로 스크롤 없음');
    await p.screenshot({ path: path.join(SHOTS, '①-3_게이트4_01_직원홈_출근전.png'), fullPage: true });

    // API로 찍은 기록과 60초를 띄운다 (안 띄우면 중복 방지가 정상적으로 걸려 "이미 찍음"이 된다)
    await p.waitForTimeout(61_000);
    await p.reload();
    const label1 = await main.innerText();
    await main.click();
    const stamp = p.locator('[aria-live=polite] span.num');
    await stamp.waitFor({ timeout: 15000 });
    const shown = await stamp.innerText();
    check(/\d{2}:\d{2}/.test(shown), `찍힌 시각이 큰 숫자로 보임: "${shown.trim()}"`);
    check((await p.locator('main').innerText()).includes('not on the office network'), '사무실 밖 안내가 카드 안에 보임 ← 4-3');
    const label2 = await p.getByRole('button', { name: /Clock (in|out)/ }).innerText();
    check(label1 !== label2, `버튼 글자가 상태에 따라 바뀜 ("${label1.trim()}" → "${label2.trim()}")`);
    await p.screenshot({ path: path.join(SHOTS, '①-3_게이트4_02_직원홈_찍은뒤.png'), fullPage: true });

    // 근무노트: 저장 → 다시 열어도 보임. 노트 없이도 위에서 출퇴근이 됐음
    if (await p.getByRole('button', { name: 'Edit' }).isVisible()) await p.getByRole('button', { name: 'Edit' }).click();
    await p.getByRole('textbox').fill('Visited a client, back at 3 pm');
    await p.getByRole('button', { name: 'Save note' }).click();
    await p.getByRole('button', { name: 'Edit' }).waitFor();
    await p.reload();
    check((await p.locator('main').innerText()).includes('Visited a client'), '근무노트 저장 후 다시 열어도 보임');
    const big = await post('/api/notes', { body: 'x'.repeat(201) });
    check(big.status === 401, `로그인 없이 노트 API → 거부 (${big.status})`);
    const tooLong = await p.evaluate(async () => (await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'x'.repeat(201) }) })).status);
    check(tooLong === 400, `200자 초과 노트 → 서버가 거부 (${tooLong})`);
    await p.screenshot({ path: path.join(SHOTS, '①-3_게이트4_03_직원홈_노트.png'), fullPage: true });
  } finally {
    await browser.close();
  }
} catch (e) {
  results.push(`FAIL 중단: ${(e as Error).message.split('\n')[0]}`);
} finally {
  // 가짜 폰 등록 해제 (해제 기록은 남는다)
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', empId).is('revoked_at', null);
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
}
