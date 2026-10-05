// 개인정보·위치정보 수집 동의 창 실제 서버 검사 (DB 0018).
//   npx tsx scripts/e2e-consent.mts [사진 저장 폴더]   (앱이 켜져 있어야 한다)
// 동의 기록은 지울 수 없으므로(덧붙이기만) 계정을 나눠 쓴다:
//   · e2e-audit2 = **끝까지 동의하지 않는 계정** — 동의 창이 뜨고, 안 누르면 계속 뜨고, 「동의하지 않고 로그아웃」이 되는지를 매번 본다
//   · e2e-audit  = 한 번 동의하면 그 판에서는 다시 뜨지 않는 계정 — 처음 한 번만 "누르면 사라진다"를 보고, 그 뒤 실행에서는 "다시 안 뜬다"를 본다
//     (다른 검사 스크립트들이 e2e-audit으로 화면을 누르므로, 안내문 판을 올린 뒤에는 이 스크립트를 먼저 돌려 동의시켜 둔다)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { CONSENT } from '../src/config/consent';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
const { data: never } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit2').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
await db.auth.admin.updateUserById(never!.id, { ban_duration: 'none' });
await db.from('profiles').update({ active: true, role: 'employee', locale: 'ko' }).eq('id', never!.id);

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`);
  if (!ok) fails++;
};
const consentRows = async (id: string) => (await db.from('consents').select('version, locale, agreed_at').eq('employee_id', id).eq('version', CONSENT.version)).data ?? [];
const login = async (browser: Browser, id: string) => {
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(`${BASE}/register?token=${token}`);
  await p.getByRole('button', { name: /이 폰 등록하기/ }).click();
  await p.getByText('폰이 등록되었습니다.').waitFor({ timeout: 30000 });
  return p;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // ── 동의하지 않는 직원: 창이 뜨고, 안 누르면 계속 뜬다 ──
  check((await consentRows(never!.id)).length === 0, '검사 계정(e2e-audit2)은 아직 동의하지 않은 상태');
  const n = await login(browser, never!.id);
  await n.goto(`${BASE}/punch`);
  const dialog = n.getByRole('dialog', { name: '개인정보 수집·이용 동의' });
  await dialog.waitFor({ timeout: 20000 });
  check(true, '로그인하면 동의 창이 뜸 (직원 화면)');
  check((await dialog.getByText('위치 정보').count()) > 0 && (await dialog.getByText('동의하지 않을 권리').count()) > 0 && (await dialog.getByText(`안내문 ${CONSENT.version}판`).count()) > 0, '수집 항목(위치 포함)·거부 권리·안내문 판이 보임');
  check((await dialog.getByRole('button', { name: /닫기|취소/ }).count()) === 0, '닫기 버튼이 없음');
  if (SHOTS) {
    await n.waitForLoadState('networkidle');
    await n.waitForTimeout(800);
    await n.screenshot({ path: path.join(SHOTS, 'consent.png') });
  }
  await n.keyboard.press('Escape');
  await n.reload();
  await dialog.waitFor({ timeout: 20000 });
  check(true, '새로 고침·Esc로는 사라지지 않음');
  for (const url of ['/punch/records', '/punch/leave']) {
    await n.goto(BASE + url);
    await dialog.waitFor({ timeout: 20000 });
  }
  check(true, '다른 화면으로 가도 계속 뜸');
  const blocked = await n.getByRole('button', { name: /출근하기|퇴근하기/ }).first().click({ timeout: 2500 }).then(() => false, () => true);
  await n.goto(`${BASE}/punch`);
  await dialog.waitFor();
  check(blocked || (await n.getByRole('button', { name: /출근하기|퇴근하기/ }).first().click({ timeout: 2500 }).then(() => false, () => true)), '동의 창이 떠 있는 동안 뒤의 출근 버튼은 눌리지 않음');
  const bad = await n.evaluate(async () => {
    const r = await fetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'old' }) });
    return { status: r.status, json: await r.json() };
  });
  check(bad.status === 409 && bad.json.error === 'consent_outdated', '다른 판으로 보낸 동의는 받지 않음');
  const opt = await n.evaluate(async () => (await (await fetch('/api/punch/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).needLocation);
  check(opt === false, '동의하지 않은 사람에게는 위치를 묻지 않음');
  await dialog.getByRole('button', { name: 'EN' }).click();
  await n.getByRole('dialog', { name: 'Consent to collect and use personal data' }).waitFor({ timeout: 20000 });
  check(true, '동의 창 안에서 언어를 바꿀 수 있음 (영어)');
  await n.getByRole('button', { name: 'Sign out without agreeing' }).click();
  await n.waitForURL(/\/login/, { timeout: 20000 });
  check((await consentRows(never!.id)).length === 0, '「동의하지 않고 로그아웃」 → 로그인 화면, 동의 기록 없음');
  await n.context().close();

  // ── 동의하는 관리자: 누르면 사라지고 다시 뜨지 않는다 ──
  const already = (await consentRows(emp!.id)).length > 0;
  const a = await login(browser, emp!.id);
  await a.goto(`${BASE}/admin`);
  const adialog = a.getByRole('dialog', { name: '개인정보 수집·이용 동의' });
  if (already) {
    await a.waitForLoadState('networkidle');
    check((await adialog.count()) === 0, '이미 동의한 계정에는 동의 창이 다시 뜨지 않음 (관리자 화면)');
  } else {
    await adialog.waitFor({ timeout: 20000 });
    check(true, '관리자 화면에도 동의 창이 뜸');
    await adialog.getByRole('button', { name: '동의합니다' }).click();
    await adialog.waitFor({ state: 'hidden', timeout: 20000 });
    check(true, '「동의합니다」를 누르면 창이 사라짐');
    const rows = await consentRows(emp!.id);
    check(rows.length === 1 && rows[0].locale === 'ko', '동의 기록: 누가·언제·어느 판·어느 언어', JSON.stringify(rows[0]));
    await a.reload();
    await a.waitForLoadState('networkidle');
    check((await adialog.count()) === 0, '새로 고침해도 다시 뜨지 않음');
    const again = await a.evaluate(async (v) => (await fetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: v }) })).status, CONSENT.version);
    check(again === 200 && (await consentRows(emp!.id)).length === 1, '두 번 눌러도 기록은 한 줄');
  }
  await a.goto(`${BASE}/punch`);
  await a.waitForLoadState('networkidle');
  check((await adialog.count()) === 0, '동의한 계정은 직원 화면에서도 안 뜸');
  await a.goto(`${BASE}/admin/members/${emp!.id}`);
  check((await a.getByText(/수집 동의 \d/).count()) > 0, '직원 상세에 동의 날짜 표시');
  await a.goto(`${BASE}/admin/members/${never!.id}`);
  check((await a.getByText('수집 동의 전').count()) > 0, '동의하지 않은 직원은 「수집 동의 전」');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  const now = new Date().toISOString();
  for (const id of [emp!.id, never!.id]) {
    await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', id);
    await db.from('user_passkeys').update({ revoked_at: now, device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', id).is('revoked_at', null).gte('created_at', STARTED_AT);
    await db.from('invites').update({ revoked_at: now }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
  }
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
