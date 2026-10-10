// 지점 + 출퇴근 장소 화면 검사 (2026-10-10) — 검사 전용 관리자(e2e-audit)로 장소를 만들고, 지점에 붙이고, 지도·목록·상세를 본다.
//   npx tsx scripts/e2e-places.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 만든 장소·지점은 이름이 e2e- 로 시작하고, 끝나면 끄고 숨긴다 (지우지 않는 표라 줄은 남지만 화면에는 보이지 않는다). 출퇴근 기록은 만들지 않는다.
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
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

const TAG = Date.now().toString(36);
const PLACE = `e2e-1공장 ${TAG}`;
const BRANCH = `e2e-지점 ${TAG}`;
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const shot = async (name: string, full = true) => {
    if (!SHOTS) return;
    await p.waitForLoadState('networkidle');
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
  };
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  // ── 메뉴에 「지점」「출퇴근 장소」 ──
  await p.goto(`${BASE}/admin`);
  await p.locator('[data-menu-open]').click();
  const menu = p.getByRole('dialog');
  await menu.waitFor();
  check((await menu.getByRole('link', { name: '지점', exact: true }).count()) === 1 && (await menu.getByRole('link', { name: '출퇴근 장소', exact: true }).count()) === 1, '왼쪽 메뉴에 「지점」「출퇴근 장소」');
  await shot('01-메뉴', false);

  // ── 출퇴근 장소 만들기 (+ 버튼 → 아래에서 올라오는 창 → 지도를 눌러 위치) ──
  await p.goto(`${BASE}/admin/places`);
  await p.waitForLoadState('networkidle');
  await p.locator('[data-fab]').click();
  const sheet = p.getByRole('dialog');
  await sheet.waitFor();
  await sheet.getByLabel('출퇴근 장소명').fill(PLACE);
  await sheet.getByLabel('근무지 주소').fill('경상북도 경주시 외동읍 (검사용)');
  check(await sheet.getByRole('button', { name: '저장' }).isDisabled(), '위치를 정하기 전에는 저장할 수 없음');
  const map = sheet.locator('[data-place-map]');
  await map.scrollIntoViewIfNeeded();
  await map.locator('img').first().waitFor({ timeout: 20000 });
  const box = (await map.boundingBox())!;
  await p.mouse.click(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
  const lat1 = await sheet.getByLabel('위도').inputValue();
  const lng1 = await sheet.getByLabel('경도').inputValue();
  check(Number(lat1) > 35 && Number(lat1) < 36 && Number(lng1) > 129 && Number(lng1) < 130, '지도를 누르면 그 자리의 좌표가 들어감', `${lat1}, ${lng1}`);
  check((await sheet.getByLabel(/좌표 반경/).inputValue()) === '80', '반경 기본값 80m');
  await shot('02-장소-추가-창', false);
  await sheet.getByRole('button', { name: '저장' }).click();
  await p.waitForURL(/\/admin\/places\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const placeId = p.url().split('/').pop()!;
  await p.getByRole('heading', { name: PLACE }).waitFor();
  const { data: saved } = await db.from('office_locations').select('label, address, lat, lng, radius_m, active').eq('id', placeId).single();
  check(saved?.label === PLACE && saved.radius_m === 80 && saved.active === true && Math.abs(Number(saved.lat) - Number(lat1)) < 1e-6 && !!saved.address, '저장된 값이 입력과 같음', JSON.stringify(saved));

  // ── 상세: 항목 줄 + 지도(핀·반경 원) ──
  check((await p.getByText('좌표 반경').count()) > 0 && (await p.getByText('80m').count()) > 0 && (await p.getByText('근무지 주소').count()) > 0, '상세에 장소명·주소·수단·반경');
  const dmap = p.locator('[data-place-map]').first();
  await dmap.locator('img').first().waitFor({ timeout: 20000 });
  const loaded = await dmap.locator('img').evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth > 0).length);
  check(loaded > 0, '지도 그림이 실제로 뜸', `${loaded}장`);
  await shot('03-장소-상세');

  // ── 고치기: 반경 80 → 120 ──
  await p.locator('[data-open-sheet="place-edit"]').click();
  const edit = p.getByRole('dialog');
  await edit.waitFor();
  await edit.getByLabel(/좌표 반경/).fill('120');
  await edit.getByRole('button', { name: '저장' }).click();
  await p.getByText('120m').first().waitFor({ timeout: 20000 });
  check((await p.getByRole('dialog').count()) === 0, '저장하면 고치기 창이 닫힘');
  check((await db.from('office_locations').select('radius_m').eq('id', placeId).single()).data?.radius_m === 120, '반경이 120m로 바뀜');

  // ── 잘못된 값은 서버가 거절 ──
  const post = (url: string, body: unknown) => p.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  let r = await post('/api/admin/places', { label: 'e2e-x', lat: 95, lng: 129, radiusM: 80 });
  check(r.status === 400, '위도 95는 거절', String(r.status));
  r = await post('/api/admin/places', { label: '', lat: 35.7, lng: 129.3, radiusM: 80 });
  check(r.status === 400, '이름 없는 장소는 거절', String(r.status));
  r = await post(`/api/admin/places/${placeId}`, { lat: 35.7, lng: 129.3, radiusM: 5000 });
  check(r.status === 400, '반경 5000m는 거절', String(r.status));

  // ── 목록: 검색 ──
  await p.goto(`${BASE}/admin/places?q=${encodeURIComponent(TAG)}`);
  check((await p.getByText(PLACE).count()) === 1, '목록에서 이름으로 찾음');
  await p.goto(`${BASE}/admin/places`);
  await shot('04-장소-목록');

  // ── 지점 만들기 → 장소 붙이기 ──
  await p.goto(`${BASE}/admin/branches`);
  await p.waitForLoadState('networkidle');
  await p.locator('[data-fab]').click();
  const bsheet = p.getByRole('dialog');
  await bsheet.waitFor();
  await bsheet.getByLabel('지점명').fill(BRANCH);
  await bsheet.getByRole('button', { name: '저장' }).click();
  await p.waitForURL(/\/admin\/branches\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const branchId = p.url().split('/').pop()!;
  await p.getByRole('heading', { name: BRANCH }).waitFor();
  check((await p.getByText(/켜진 출퇴근 장소 전체/).count()) > 0, '장소를 안 붙인 지점은 「켜진 장소 전체」 안내');
  await p.locator('[data-open-sheet="branch-edit"]').click();
  const bedit = p.getByRole('dialog');
  await bedit.waitFor();
  await bedit.getByLabel(PLACE).check();
  await bedit.getByLabel('메모').fill('검사용 메모\n둘째 줄');
  await bedit.getByRole('button', { name: '저장' }).click();
  await p.getByRole('link', { name: new RegExp(PLACE) }).first().waitFor({ timeout: 20000 });
  const { data: link } = await db.from('group_locations').select('location_id').eq('group_id', branchId);
  check(link?.length === 1 && link[0].location_id === placeId, '지점에 장소가 붙음 (DB)');
  check((await p.getByText('둘째 줄').count()) > 0, '메모가 줄바꿈과 함께 보임');
  await shot('05-지점-상세');
  await p.goto(`${BASE}/admin/places/${placeId}`);
  check((await p.getByRole('link', { name: BRANCH }).count()) === 1, '장소 상세에 「이 장소를 쓰는 지점」');
  await p.goto(`${BASE}/admin/branches`);
  await shot('06-지점-목록');

  // ── 장소 떼기 · 끄기 ──
  r = await post(`/api/admin/groups/${branchId}`, { locationIds: [] });
  check(r.status === 200 && ((await db.from('group_locations').select('id').eq('group_id', branchId)).data?.length ?? 1) === 0, '장소를 모두 떼면 연결이 사라짐');
  await p.goto(`${BASE}/admin/places/${placeId}`);
  await p.getByRole('button', { name: '이 장소 끄기' }).click();
  await p.getByRole('button', { name: '끄기', exact: true }).click();
  await p.getByRole('button', { name: '다시 켜기' }).waitFor({ timeout: 20000 });
  check((await db.from('office_locations').select('active').eq('id', placeId).single()).data?.active === false, '끄면 꺼짐 (지우지 않음)');
  await p.goto(`${BASE}/admin/places?tab=off`);
  check((await p.getByText(PLACE).count()) === 0, '꺼 둔 검사용 장소는 목록에 보이지 않음');

  // ── 회사 설정에서 가는 길 · 가로 넘침 · PC ──
  await p.goto(`${BASE}/admin/settings`);
  check((await p.getByRole('link', { name: /출퇴근 장소 관리로 가기/ }).count()) === 1, '회사 설정에 출퇴근 장소로 가는 줄');
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of ['/admin/places', `/admin/places/${placeId}`, '/admin/branches', `/admin/branches/${branchId}`]) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= w, `가로 넘침 없음 @${w} ${url.replace(/[0-9a-f-]{36}/, '…')}`, `${sw}px`);
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/admin/places/${placeId}`);
  await p.locator('[data-place-map]').first().locator('img').first().waitFor({ timeout: 20000 });
  check(await p.getByLabel('출퇴근 장소명').isVisible(), 'PC에서는 고치기 양식이 옆에 펼쳐져 있음');
  await shot('07-PC-장소-상세');
  await p.goto(`${BASE}/admin/branches`);
  await shot('08-PC-지점-목록');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  const { data: gs } = await db.from('org_groups').select('id').like('name', 'e2e-지점%');
  for (const g of gs ?? []) await db.from('group_locations').delete().eq('group_id', g.id);
  await db.from('org_groups').update({ active: false }).like('name', 'e2e-지점%').eq('active', true);
  await db.from('office_locations').update({ active: false }).like('label', 'e2e-%').eq('active', true);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
