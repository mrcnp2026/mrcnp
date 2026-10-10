// 반경 밖 「출근/퇴근 요청」 검사 (2026-10-10 의뢰인 확정: 시프티 방식) — 검사 전용 계정(e2e-audit)으로 반경 밖에서 찍는다.
//   npx tsx scripts/e2e-punch-request.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다. 이 PC의 주소가 사무실 인터넷으로 등록돼 있으면 검사할 수 없다)
// 검사용 출퇴근 장소(0.5, 0.5 — 바다 위)를 잠깐 켜고, 반경 밖(1.5, 1.5)에서 찍어 요청이 되는지, 다른 관리자(e2e-audit2)가 거절·승인하는지 본다.
// 요청·기록은 연습 기록이다. 끝나면 장소를 끄고 남은 요청을 취소하고 계정을 다시 끈다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword, registerDevice } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit').single();
const { data: other } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit2').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
await db.auth.admin.updateUserById(other!.id, { ban_duration: 'none' });
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', other!.id);
for (const id of [emp!.id, other!.id]) {
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const invite = async (id: string) => {
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return token;
};
const LABEL = 'e2e-시험 위치';
// 검사용 장소 켜기 (없으면 만든다)
const { data: oldLoc } = await db.from('office_locations').select('id').eq('label', LABEL).limit(1).maybeSingle();
const locId = oldLoc?.id ?? (await db.from('office_locations').insert({ label: LABEL, lat: 0.5, lng: 0.5, radius_m: 100, active: true, created_by: emp!.id }).select('id').single()).data!.id;
await db.from('office_locations').update({ active: true }).eq('id', locId);
// 지난 실행이 남긴 대기 요청 정리
await db.from('punch_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('employee_id', emp!.id).eq('status', 'pending');

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const myRequests = async () => (await db.from('punch_requests').select('id, kind, status, geo_reason, nearest_m, event_id, requested_at, is_test').eq('employee_id', emp!.id).gte('created_at', STARTED_AT).order('created_at')).data ?? [];
const myEvents = async () => (await db.from('punch_events').select('id, kind, punched_at, ip_verified').eq('employee_id', emp!.id).gte('created_at', STARTED_AT)).data ?? [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, geolocation: { latitude: 1.5, longitude: 1.5, accuracy: 20 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/register?token=${await invite(emp!.id)}`);
  await createPassword(p);
  await registerDevice(p);
  const post = (pg: typeof p, url: string, body?: unknown) => pg.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  const opt = await post(p, '/api/punch/options');
  if (opt.json.needLocation !== true) throw new Error('이 PC의 주소가 사무실 인터넷으로 등록돼 있거나 위치 동의가 없어 검사할 수 없습니다');

  // ── 반경 밖에서 찍으면 요청이 된다 ──
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  const button = p.getByRole('button', { name: /출근하기|퇴근하기/ });
  const kind = /출근/.test((await button.textContent()) ?? '') ? 'in' : 'out';
  const word = kind === 'in' ? '출근' : '퇴근';
  await button.click();
  await p.getByText(new RegExp(`${word} 요청을 보냈습니다`)).waitFor({ timeout: 30000 });
  let reqs = await myRequests();
  check(reqs.length === 1 && reqs[0].kind === kind && reqs[0].status === 'pending' && reqs[0].geo_reason === 'outside' && (reqs[0].nearest_m ?? 0) > 1000 && reqs[0].is_test === true, `반경 밖 ${word}: 기록이 아니라 「${word} 요청」이 생김 (이유·거리 포함, 연습 기록)`, JSON.stringify(reqs[0]));
  check((await myEvents()).length === 0, '출퇴근 기록은 만들어지지 않음');
  check((await p.getByText(/아직 기록되지 않았고, 관리자가 승인하면/).count()) === 1, '화면에 "아직 기록되지 않았다"는 안내');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '01-요청-보냄.png') });
  await p.reload();
  await p.waitForLoadState('networkidle');
  check((await p.getByText(new RegExp(`${word} 요청 승인 대기 중`)).count()) === 1, `홈에 「${word} 요청 승인 대기 중」`);
  await p.getByRole('button', { name: /출근하기|퇴근하기/ }).click();
  await p.getByText(new RegExp(`${word} 요청을 보냈습니다`)).waitFor({ timeout: 30000 });
  reqs = await myRequests();
  check(reqs.length === 1, '다시 눌러도 요청은 한 건', String(reqs.length));

  // ── 내 요청 · 관리자 요청함 ──
  await p.goto(`${BASE}/punch/requests`);
  await p.waitForLoadState('networkidle');
  check((await p.getByText(`${word} 요청`, { exact: true }).count()) >= 1 && (await p.getByText(/가장 가까운 출퇴근 장소에서 \d+m/).count()) >= 1, `내 요청 목록에 「${word} 요청」과 거리`);
  await p.goto(`${BASE}/admin/inbox`);
  await p.getByRole('heading', { name: /출근\/퇴근 요청/ }).waitFor({ timeout: 30000 });
  check((await p.locator('#punch').getByText(new RegExp(`${word} 요청 · `)).count()) >= 1, '관리자 요청함 맨 위에 「출근/퇴근 요청」');
  check((await p.locator('#punch').getByText('본인 요청은 다른 관리자가 처리합니다.').count()) >= 1, '본인 요청에는 승인 버튼 대신 안내');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '02-관리자-요청함.png') });
  let r = await post(p, `/api/admin/punch-requests/${reqs[0].id}/decide`, { decision: 'approved' });
  check(r.status === 403, '본인이 직접 승인하면 거절됨', String(r.status));

  // ── 다른 관리자가 거절 → 기록 없음 ──
  const p2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p2.goto(`${BASE}/register?token=${await invite(other!.id)}`);
  await createPassword(p2);
  r = await post(p2, `/api/admin/punch-requests/${reqs[0].id}/decide`, { decision: 'rejected' });
  check(r.status === 200 && r.json.result === 'ok', '다른 관리자가 거절', JSON.stringify(r.json));
  check((await myEvents()).length === 0 && (await myRequests())[0].status === 'rejected', '거절하면 기록이 생기지 않음');
  r = await post(p2, `/api/admin/punch-requests/${reqs[0].id}/decide`, { decision: 'approved' });
  check(r.json.result === 'already', '이미 처리된 요청은 다시 처리되지 않음', JSON.stringify(r.json));

  // ── 다시 찍고 승인 → 요청한 시각으로 기록 ──
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: /출근하기|퇴근하기/ }).click();
  await p.getByText(new RegExp(`${word} 요청을 보냈습니다`)).waitFor({ timeout: 30000 });
  reqs = await myRequests();
  const second = reqs[reqs.length - 1];
  check(reqs.length === 2 && second.status === 'pending', '거절된 뒤 다시 찍으면 새 요청');
  await p2.goto(`${BASE}/admin/inbox`);
  // 두 번째 검사 계정이 개인정보 동의를 아직 안 했으면 동의 창이 화면을 가린다
  const agree = p2.getByRole('button', { name: '동의합니다' });
  if (await agree.isVisible().catch(() => false)) {
    await agree.click();
    await agree.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  }
  await p2.getByRole('heading', { name: /출근\/퇴근 요청/ }).waitFor({ timeout: 30000 });
  await p2.waitForLoadState('networkidle');
  const row = p2.locator('#punch li', { hasText: emp!.name }).first();
  await row.getByRole('button', { name: '승인', exact: true }).click();
  await row.getByText(/요청을 승인할까요/).waitFor({ timeout: 15000 }); // 한 번 더 묻는다
  await row.getByRole('button').first().click();
  await p2.waitForFunction("!document.querySelector('#punch') || !document.querySelector('#punch').textContent.includes('검사용(자동)')", undefined, { timeout: 30000 }).catch(() => {});
  const evs = await myEvents();
  const after = (await myRequests()).find((x) => x.id === second.id)!;
  check(evs.length === 1 && evs[0].kind === kind && evs[0].ip_verified === false && new Date(evs[0].punched_at).getTime() === new Date(second.requested_at).getTime(), '화면에서 승인하면 요청한 시각으로 기록이 생김 (사무실 확인 안 된 기록)', JSON.stringify(evs[0]));
  check(after.status === 'approved' && after.event_id === evs[0]?.id, '요청에 만들어진 기록이 연결됨');
  await p.goto(`${BASE}/punch/requests?tab=done`);
  await p.waitForLoadState('networkidle');
  check((await p.locator('li', { hasText: `${word} 요청` }).filter({ hasText: '승인' }).count()) >= 1 && (await p.locator('li', { hasText: `${word} 요청` }).filter({ hasText: '거절' }).count()) >= 1, '내 요청 「완료」에 승인·거절이 보임');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, '03-내-요청-완료.png') });

  // ── 장소가 하나도 없으면 예전처럼 바로 기록 ──
  const { count: otherPlaces } = await db.from('office_locations').select('id', { count: 'exact', head: true }).eq('active', true).neq('id', locId);
  const { count: cidrs } = await db.from('office_networks').select('id', { count: 'exact', head: true }).eq('active', true);
  if ((otherPlaces ?? 0) === 0 && (cidrs ?? 0) === 0) {
    await db.from('office_locations').update({ active: false }).eq('id', locId);
    await p.goto(`${BASE}/punch`);
    await p.waitForLoadState('networkidle');
    await p.getByRole('button', { name: /출근하기|퇴근하기/ }).click();
    await p.getByText(/기록됨/).waitFor({ timeout: 30000 });
    check((await myEvents()).length === 2 && (await myRequests()).length === 2, '출퇴근 장소·사무실 인터넷이 하나도 없으면 요청 없이 바로 기록');
  } else console.log(`➖ 장소가 없을 때 바로 기록되는지: 다른 장소 ${otherPlaces ?? '?'}곳 · 사무실 인터넷 ${cidrs ?? '?'}개가 켜져 있어 확인하지 못함`);
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await db.from('office_locations').update({ active: false }).eq('id', locId);
  await db.from('punch_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('employee_id', emp!.id).eq('status', 'pending');
  for (const id of [emp!.id, other!.id]) {
    await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', id);
    await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', id).is('revoked_at', null).gte('created_at', STARTED_AT);
    await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
  }
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
