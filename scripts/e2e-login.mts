// 아이디 + 비밀번호 로그인 · 출퇴근 기기 1대 실제 서버 확인 (2026-10-05 의뢰인: 로그인은 PC·폰 어디서나, 출퇴근 찍기는 등록한 기기 + 지문) — 켜진 앱(http://localhost:4123)에 진짜 요청을 보낸다.
//   npm run e2e:login
// 검사 전용 계정 e2e-audit(직원)·e2e-audit2(잠깐 관리자)를 검사 동안만 켰다가 끈다. 비밀번호는 실행할 때마다 새로 만든 무작위 값이고,
// 끝나면 아무도 모르는 값으로 다시 덮는다. 출퇴근은 연습 기록(is_test)으로 한 번 남는다 (지울 수 없다, 4-1).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import path from 'node:path';
import { chromium, type BrowserContext } from 'playwright-core';
import { registerDevice } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = 'http://localhost:4123';
const STARTED_AT = new Date().toISOString();
const SHOTS = path.join(import.meta.dirname, '..', '..', 'checks', '화면-캡처');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const results: string[] = [];
const check = (c: boolean, m: string) => results.push(`${c ? 'PASS' : 'FAIL'} ${m}`);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const newPassword = () => randomBytes(9).toString('base64url');

async function post(p: string, body?: unknown) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}
/** 그 브라우저의 로그인 세션으로 API를 부른다 */
async function postAs(ctx: BrowserContext, p: string, body?: unknown) {
  const r = await ctx.request.post(BASE + p, { data: body ?? {} });
  return { status: r.status(), json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** 관리자 화면이 만드는 것과 같은 8자리 코드 초대 (DB에는 지문만) */
async function freshInvite(employeeId: string) {
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', employeeId).is('used_at', null).is('revoked_at', null);
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[randomInt(alphabet.length)];
  await db.from('invites').insert({ employee_id: employeeId, token_hash: sha(code), issued_via: 'admin', expires_at: new Date(Date.now() + 3_600_000).toISOString() });
  return code;
}

const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
const { data: adm } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit2').single();
const empId = emp!.id as string;
const admId = adm!.id as string;
const fakeId = `nobody-${randomBytes(4).toString('hex')}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await db.from('profiles').update({ active: true }).eq('id', empId);
  await db.from('profiles').update({ active: true, role: 'admin' }).eq('id', admId);

  // ── ① 비밀번호 만들기 (초대 코드) ──
  const code = await freshInvite(empId);
  const pw1 = newPassword();
  const phone = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: 'en-US' });
  const p = await phone.newPage();
  await p.goto(`${BASE}/login`);
  check(await p.getByLabel('Employee number or mobile number').isVisible(), '로그인 화면에 아이디 칸이 보임');
  check(await p.getByLabel('Password', { exact: true }).isVisible(), '로그인 화면에 비밀번호 칸이 보임');
  await p.screenshot({ path: path.join(SHOTS, '로그인_01_아이디-비밀번호_360.png'), fullPage: true });

  const short = await post('/api/auth/password/setup', { token: code, password: '1234567' });
  check(short.status === 400 && short.json.error === 'password_short', `8자 미만 비밀번호 → 거부 (${short.json.error})`);
  const sameAsId = await post('/api/auth/password/setup', { token: code, password: 'E2E-AUDIT' });
  check(sameAsId.status === 400 && sameAsId.json.error === 'password_same_as_id', `사번과 같은 비밀번호 → 거부 (${sameAsId.json.error})`);

  await p.getByRole('link', { name: 'Create my password' }).click();
  await p.getByLabel('Code from your manager').fill(`${code.slice(0, 4).toLowerCase()} ${code.slice(4)}`); // 소문자·공백 섞어도 된다
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByLabel('New password', { exact: true }).fill(pw1);
  await p.getByLabel('New password again').fill(pw1 + 'x');
  await p.screenshot({ path: path.join(SHOTS, '로그인_02_비밀번호-만들기_360.png'), fullPage: true });
  await p.getByRole('button', { name: 'Create password and start' }).click();
  await p.getByText('The two passwords do not match.').waitFor();
  check(true, '두 비밀번호가 다르면 화면이 막음');
  await p.getByLabel('New password again').fill(pw1);
  await p.getByRole('button', { name: 'Create password and start' }).click();
  await p.getByText('Your password is set.').waitFor();
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.waitForURL('**/punch');
  check(true, '초대 코드로 비밀번호를 만들면 바로 로그인됨');
  const reuse = await post('/api/auth/password/setup', { token: code, password: newPassword() });
  check(reuse.status === 400 && reuse.json.error === 'invite_invalid', `쓴 초대 코드를 다시 쓰면 거부 (${reuse.json.error})`);

  // ── ② 출퇴근: 등록한 기기 1대 + 지문·얼굴 확인 ──
  const noSession = await post('/api/punch', { kind: 'in' });
  check(noSession.status === 401, `로그인 없이 출퇴근 API → 거부 (${noSession.status})`);
  check((await p.getByRole('button', { name: /Clock (in|out)/ }).count()) === 0 && (await p.getByRole('button', { name: 'Register this device for punching' }).count()) === 1, '기기를 등록하기 전에는 출근 버튼 대신 등록 안내가 보임');
  await p.screenshot({ path: path.join(SHOTS, '로그인_03a_기기등록-안내_360.png'), fullPage: true });
  const noDevice = await postAs(phone, '/api/punch/options');
  check(noDevice.status === 400 && noDevice.json.error === 'device_required', `등록한 기기 없이 출퇴근 시작 → 거부 (${noDevice.json.error})`);
  const sessionOnly = await postAs(phone, '/api/punch', { kind: 'in' });
  check(sessionOnly.status === 401, `로그인만으로(기기 확인 없이) 출퇴근 API → 거부 (${sessionOnly.status})`);
  await registerDevice(p); // 가상 지문 인식기를 단 이 브라우저를 출퇴근 기기로
  const { data: reg } = await db.from('user_passkeys').select('id, device_label').eq('employee_id', empId).is('revoked_at', null);
  check(reg?.length === 1, '초대 코드 없이 본인이 직접 출퇴근 기기를 등록함 (1대)');
  const before = new Date().toISOString();
  await p.getByRole('button', { name: /Clock (in|out)/ }).click();
  await p.getByText(/Clock-(in|out) \d{2}:\d{2} recorded/).waitFor();
  const { data: last } = await db.from('punch_events').select('employee_id, is_test, passkey_id, source').eq('employee_id', empId).gte('created_at', before).order('created_at', { ascending: false }).limit(1);
  check(last?.length === 1 && last[0].is_test === true && last[0].passkey_id === reg?.[0]?.id && last[0].source === 'web', '등록한 기기에서 지문 확인 뒤 본인의 연습 기록이 남음 (어느 기기인지 기록)');
  await p.screenshot({ path: path.join(SHOTS, '로그인_03_출퇴근_360.png'), fullPage: true });

  // ── ③ PC에서도 같은 계정으로 (동시에 두 기기) ──
  const pc = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
  const q = await pc.newPage();
  await q.goto(`${BASE}/login`);
  await q.getByLabel('Employee number or mobile number').fill('E2E-Audit'); // 대소문자를 가리지 않는다
  await q.getByLabel('Password', { exact: true }).fill(pw1 + 'x');
  await q.getByRole('button', { name: 'Sign in', exact: true }).click();
  await q.getByText('The employee number or password is not correct.').waitFor();
  check(true, '틀린 비밀번호 → 안내 문구 (누구인지 알려 주지 않음)');
  await q.screenshot({ path: path.join(SHOTS, '로그인_04_PC_1280.png'), fullPage: true });
  await q.getByLabel('Password', { exact: true }).fill(pw1);
  await q.getByRole('button', { name: 'Sign in', exact: true }).click();
  await q.waitForURL('**/punch');
  check(true, 'PC에서도 같은 사번·비밀번호로 로그인됨');
  await p.reload();
  check(new URL(p.url()).pathname === '/punch', '폰 쪽 로그인도 그대로 유지됨 (두 기기 동시 사용)');

  // ── ③-2 같은 아이디·비밀번호로 로그인한 다른 기기에서는 출퇴근을 못 찍는다 (대리 출근 차단) ──
  await q.getByText('You cannot punch from this device').waitFor();
  check((await q.getByRole('button', { name: /Clock (in|out)/ }).count()) === 0, '다른 기기(PC)에는 출근 버튼 대신 "등록한 기기에서만" 안내가 보임');
  await q.screenshot({ path: path.join(SHOTS, '로그인_04b_다른기기-출퇴근불가_1280.png'), fullPage: true });
  const otherPunch = await postAs(pc, '/api/punch', { kind: 'in' });
  check(otherPunch.status === 401, `다른 기기에서 기기 확인 없이 출퇴근 API → 거부 (${otherPunch.status})`);
  const second = await postAs(pc, '/api/device/register/options');
  check(second.status === 400 && second.json.error === 'already_registered', `다른 기기를 두 번째 출퇴근 기기로 등록 → 거부 (${second.json.error})`);

  // ── ④ 비밀번호 바꾸기 → 다른 기기는 로그아웃 ──
  const pw2 = newPassword();
  await new Promise((r) => setTimeout(r, 1100)); // 폰 로그인과 같은 초에 바꾸면 폰 세션이 살아남는다 (login-rules.sessionRevoked)
  await q.goto(`${BASE}/punch/account`);
  const wrongCurrent = await postAs(pc, '/api/auth/password', { current: pw1 + 'x', password: pw2 });
  check(wrongCurrent.status === 400 && wrongCurrent.json.error === 'password_wrong', `지금 비밀번호가 틀리면 못 바꿈 (${wrongCurrent.json.error})`);
  await q.getByLabel('Current password').fill(pw1);
  await q.getByLabel('New password', { exact: true }).fill(pw2);
  await q.getByLabel('New password again').fill(pw2);
  await q.getByRole('button', { name: 'Save' }).click();
  await q.getByText('Your password was saved.').waitFor();
  await q.screenshot({ path: path.join(SHOTS, '로그인_05_내계정_1280.png'), fullPage: true });
  await q.reload();
  check(new URL(q.url()).pathname === '/punch/account', '비밀번호를 바꾼 기기는 로그인 유지');
  await p.goto(`${BASE}/punch`);
  check(new URL(p.url()).pathname === '/login', '다른 기기(폰)는 로그아웃됨');
  const oldPw = await post('/api/auth/login', { id: 'e2e-audit', password: pw1 });
  check(oldPw.status === 400 && oldPw.json.error === 'login_failed', `예전 비밀번호로는 로그인 안 됨 (${oldPw.json.error})`);
  const newPw = await post('/api/auth/login', { id: 'e2e-audit', password: pw2 });
  check(newPw.status === 200, `새 비밀번호로 로그인됨 (${newPw.status})`);

  // ── ⑤ 관리자의 로그인 초기화 → 모든 기기 로그아웃 + 비밀번호 무효 ──
  const admCode = await freshInvite(admId);
  const admPw = newPassword();
  const admCtx = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: 'en-US' });
  const setup = await postAs(admCtx, '/api/auth/password/setup', { token: admCode, password: admPw });
  check(setup.status === 200, `관리자 검사 계정 비밀번호 만들기 (${setup.status})`);
  const self = await postAs(admCtx, `/api/admin/employees/${admId}/phone`, { reason: 'e2e self reset' });
  check(self.status === 403 && self.json.error === 'self_change', `본인 로그인은 스스로 초기화 못 함 (${self.json.error})`);
  const asEmployee = await postAs(pc, `/api/admin/employees/${admId}/phone`, { reason: 'e2e not admin' });
  check(asEmployee.status === 403, `일반 직원은 초기화 못 함 (${asEmployee.status})`);
  // 출퇴근 기기 해제 (폰 교체 승인): 비밀번호는 그대로, 기기 등록만 풀린다
  const selfDevice = await postAs(admCtx, `/api/admin/employees/${admId}/device`, { reason: 'e2e self device' });
  check(selfDevice.status === 403 || selfDevice.status === 409, `다른 관리자가 있으면 본인 기기는 스스로 해제 못 함 (${selfDevice.status} ${selfDevice.json.error})`);
  const release = await postAs(admCtx, `/api/admin/employees/${empId}/device`, { reason: 'e2e phone replaced' });
  const { count: left } = await db.from('user_passkeys').select('id', { count: 'exact', head: true }).eq('employee_id', empId).is('revoked_at', null);
  check(release.status === 200 && left === 0, `관리자가 출퇴근 기기 해제 (${release.status})`);
  const again = await postAs(admCtx, `/api/admin/employees/${empId}/device`, { reason: 'e2e phone replaced' });
  check(again.status === 409 && again.json.error === 'no_device', `등록된 기기가 없으면 해제할 것이 없음 (${again.json.error})`);
  const stillIn = await post('/api/auth/login', { id: 'e2e-audit', password: pw2 });
  check(stillIn.status === 200, `기기를 해제해도 비밀번호 로그인은 그대로 됨 (${stillIn.status})`);
  await q.goto(`${BASE}/punch`);
  check((await q.getByRole('button', { name: 'Register this device for punching' }).count()) === 1, '해제 뒤에는 직원이 새 기기를 직접 등록할 수 있음');
  const reset = await postAs(admCtx, `/api/admin/employees/${empId}/phone`, { reason: 'e2e login reset' });
  check(reset.status === 200, `관리자가 직원 로그인 초기화 (${reset.status})`);
  await q.goto(`${BASE}/punch`);
  check(new URL(q.url()).pathname === '/login', '초기화하면 로그인돼 있던 기기가 바로 끊김');
  const afterReset = await post('/api/auth/login', { id: 'e2e-audit', password: pw2 });
  check(afterReset.status === 400, `초기화 뒤에는 그 비밀번호로 로그인 안 됨 (${afterReset.status})`);
  const { data: prof } = await db.from('profiles').select('password_set_at').eq('id', empId).single();
  check(prof!.password_set_at === null, '초기화하면 「아직 가입 안 함」 상태로 돌아감');

  // ── ⑥ 퇴사(비활성) 계정은 비밀번호가 맞아도 로그인 안 됨 ──
  await db.from('profiles').update({ active: false }).eq('id', admId);
  const inactive = await post('/api/auth/login', { id: 'e2e-audit2', password: admPw });
  check(inactive.status === 400 && inactive.json.error === 'login_failed', `비활성 계정 로그인 → 같은 문구로 거부 (${inactive.json.error})`);

  // ── ⑦ 여러 번 틀리면 잠깐 막힘 ──
  let lastStatus = 0;
  for (let i = 0; i < 10; i++) lastStatus = (await post('/api/auth/login', { id: fakeId, password: 'wrong-password' })).status;
  check(lastStatus === 400, `10번째까지는 일반 실패 (${lastStatus})`);
  const throttled = await post('/api/auth/login', { id: fakeId, password: 'wrong-password' });
  check(throttled.status === 429 && throttled.json.error === 'login_throttled', `11번째는 잠깐 막힘 (${throttled.status} ${throttled.json.error})`);
} catch (e) {
  results.push(`FAIL 중단: ${(e as Error).message.split('\n')[0]}`);
} finally {
  await browser.close();
  // 검사 계정을 원래대로: 끄고, 관리자 권한을 내리고, 비밀번호를 아무도 모르는 값으로, 안 쓴 초대는 무효로
  for (const id of [empId, admId]) {
    await db.auth.admin.updateUserById(id, { password: randomBytes(32).toString('base64url') });
    await db.from('profiles').update({ active: false, role: 'employee', password_set_at: null, sessions_revoked_at: new Date().toISOString() }).eq('id', id);
    await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
    await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', id).is('revoked_at', null).gte('created_at', STARTED_AT);
  }
  await db.from('login_attempts').delete().eq('login_key', sha(fakeId));
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
}
