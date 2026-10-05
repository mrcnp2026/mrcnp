// GPS로 사무실 확인 실제 서버 검사 (DB 0017).
//   npx tsx scripts/e2e-gps.mts [사진 저장 폴더]   (앱이 켜져 있어야 한다. 이 PC의 주소가 사무실 인터넷으로 등록돼 있으면 위치를 묻지 않으므로 검사가 중단된다)
// 검사 전용 계정 e2e-audit으로 실제로 출근·퇴근을 한 번씩 찍는다 — 연습 기록(is_test)이고, 계정이 꺼져 있으면 기록 탭에 보이지 않는다.
//   ⚠️ 출퇴근 원본 기록은 지울 수 없다 (4-1). 실행할 때마다 검사 계정에 2건이 남는다.
// 사무실 위치는 바다 한가운데(위도 0.5, 경도 0.5)의 검사용 위치를 쓴다 — 메모 'e2e-시험 위치', 끝나면 끄고 화면 목록에서도 숨는다.
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
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const LABEL = 'e2e-시험 위치';
const HERE = { latitude: 0.5, longitude: 0.5, accuracy: 20 };

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`);
  if (!ok) fails++;
};
const lastPunch = async (kind: 'in' | 'out') =>
  (await db.from('punch_events').select('kind, ip_verified, verified_by, geo_lat, geo_lng, is_test').eq('employee_id', emp!.id).eq('kind', kind).gte('created_at', STARTED_AT).order('created_at', { ascending: false }).limit(1).maybeSingle()).data;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, geolocation: HERE, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  const post = (url: string, body?: unknown) =>
    p.evaluate(async ([u, b]) => {
      const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    }, [url, body] as const);

  // ── 사무실 위치가 없으면 위치를 묻지 않는다 ──
  await db.from('office_locations').update({ active: false }).eq('label', LABEL).eq('active', true);
  const others = (await db.from('office_locations').select('id', { count: 'exact', head: true }).eq('active', true)).count ?? 0;
  let r = await post('/api/punch/options');
  if (others === 0) check(r.status === 200 && r.json.needLocation === false, '사무실 위치가 없으면 위치를 묻지 않음 (GPS 꺼짐)');

  // ── 설정: 틀린 값 차단, 사무실 위치 등록 ──
  r = await post('/api/admin/settings', { action: 'location.add', lat: 95, lng: 0.5, radiusM: 100 });
  check(r.status === 400 && r.json.error === 'invalid_location', '틀린 위도 차단');
  r = await post('/api/admin/settings', { action: 'location.add', lat: 0.5, lng: 0.5, radiusM: 5000 });
  check(r.status === 400 && r.json.error === 'invalid_location', '너무 넓은 반경 차단');
  const { data: old } = await db.from('office_locations').select('id').eq('label', LABEL).limit(1).maybeSingle();
  if (old) {
    r = await post('/api/admin/settings', { action: 'location.toggle', id: old.id, active: true });
    check(r.status === 200, '전에 만든 검사용 위치를 다시 켬');
  } else {
    await p.goto(`${BASE}/admin/settings`);
    await p.getByRole('button', { name: /사무실 위치 추가/ }).click();
    await p.getByRole('button', { name: '지금 위치 넣기' }).click();
    await p.waitForFunction("document.querySelector('form input[inputmode=decimal]')?.value === '0.500000'", undefined, { timeout: 15000 });
    await p.locator('form', { hasText: '지금 위치 넣기' }).locator('input[name=label]').fill(LABEL);
    await p.locator('form', { hasText: '지금 위치 넣기' }).getByRole('button', { name: '저장', exact: true }).click();
    await p.getByText('GPS 확인이 켜져 있습니다').waitFor({ timeout: 20000 });
    const { data: made } = await db.from('office_locations').select('lat, lng, radius_m, created_by').eq('label', LABEL).single();
    check(Number(made?.lat) === 0.5 && Number(made?.lng) === 0.5 && made?.radius_m === 100 && made.created_by === emp!.id, '화면에서 「지금 위치 넣기」로 사무실 위치 등록', JSON.stringify(made));
    if (SHOTS) {
      await p.waitForLoadState('networkidle');
      await p.waitForTimeout(800);
      await p.screenshot({ path: path.join(SHOTS, 'gps-settings.png'), fullPage: true });
    }
  }
  r = await post('/api/punch/options');
  if (r.json.needLocation !== true) throw new Error('이 PC의 주소가 사무실 인터넷으로 등록돼 있어 위치를 묻지 않습니다 — GPS 검사를 할 수 없습니다');
  check(true, '사무실 위치가 있고 사무실 인터넷이 아니면 위치가 필요하다고 알려 줌');

  // ── 반경 안에서 출근: GPS로 확인 ──
  await p.goto(`${BASE}/punch`);
  await p.getByRole('button', { name: /출근하기/ }).click();
  await p.getByText('위치로 사무실이 확인되었습니다.').waitFor({ timeout: 30000 });
  const pin = await lastPunch('in');
  check(pin?.ip_verified === true && pin.verified_by === 'gps' && Number(pin.geo_lat) === 0.5 && Number(pin.geo_lng) === 0.5 && pin.is_test === true, '반경 안 출근: 사무실 확인 · 수단 gps · 좌표 저장 · 연습 기록', JSON.stringify(pin));
  if (SHOTS) {
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(SHOTS, 'gps-punch.png') });
  }

  // ── 반경 밖에서 퇴근: 미확인, 좌표는 저장하지 않는다 ──
  await ctx.setGeolocation({ latitude: 1.5, longitude: 1.5, accuracy: 20 });
  await p.reload();
  await p.getByRole('button', { name: /퇴근하기/ }).click();
  await p.getByText(/사무실 밖에서 찍으신 것으로/).waitFor({ timeout: 30000 });
  const pout = await lastPunch('out');
  check(pout?.ip_verified === false && pout.verified_by === null && pout.geo_lat === null && pout.geo_lng === null, '반경 밖 퇴근: 사무실 밖 · 좌표를 저장하지 않음', JSON.stringify(pout));

  // ── 관리자 기록 화면에 확인 수단 ──
  await p.goto(`${BASE}/admin/records/${emp!.id}`);
  await p.locator('details summary').first().click();
  check((await p.getByText('GPS로 확인').count()) > 0, '직원별 날짜 기록 › 원래 기록에 「GPS로 확인」');

  // ── 끄면 다시 묻지 않는다 ──
  const { data: loc } = await db.from('office_locations').select('id').eq('label', LABEL).eq('active', true).single();
  r = await post('/api/admin/settings', { action: 'location.toggle', id: loc!.id, active: false });
  r = await post('/api/punch/options');
  if (others === 0) check(r.json.needLocation === false, '사무실 위치를 끄면 위치를 묻지 않음');
  await p.goto(`${BASE}/admin/settings`);
  check((await p.getByText(LABEL).count()) === 0, '꺼 둔 검사용 위치는 화면 목록에 보이지 않음');
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.goto(`${BASE}/admin/settings`);
    await p.waitForLoadState('networkidle');
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= w, `가로 넘침 없음 @${w}`, `${sw}px`);
  }
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await db.from('office_locations').update({ active: false }).eq('label', LABEL).eq('active', true);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
