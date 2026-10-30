// 개발 DB 화면 찍기 (2026-10-29) — 검사 전용 관리자(e2e-audit)로 개발 DB에 로그인해 폰 · PC 화면을 찍는다.
//   앱은 `npm run dev:devdb`(localhost:4123)로 켜 둔다. 운영 DB에는 절대 쓰지 않는다 — .env.dev의 DEV_* 값만 쓰고, 운영 주소와 같으면 멈춘다.
//   npx tsx scripts/dev-look.mts login <상태파일>             검사 계정을 켜고 로그인해 브라우저 상태를 파일에 둔다
//   npx tsx scripts/dev-look.mts shot <상태파일> <폴더> <주소...>  주소마다 폰(360) · PC(1440) 화면을 찍는다
//   npx tsx scripts/dev-look.mts done                          검사 계정을 다시 끈다(직원 · 꺼짐 · 등록 해제)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';
import { CONSENT } from '../src/config/consent.ts';

const root = path.join(import.meta.dirname, '..');
const prod = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
const dev = config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {};
if (!dev.DEV_SUPABASE_URL || !dev.DEV_SUPABASE_SERVICE_ROLE_KEY) throw new Error('.env.dev 값이 비어 있습니다');
if (dev.DEV_SUPABASE_URL === prod.NEXT_PUBLIC_SUPABASE_URL) throw new Error('개발 주소가 운영 주소와 같아서 멈춥니다');
const BASE = process.env.BASE ?? 'http://localhost:4123';
const db = createClient(dev.DEV_SUPABASE_URL, dev.DEV_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [cmd, ...args] = process.argv.slice(2);

async function auditId(): Promise<string> {
  const { data, error } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
  if (error || !data) throw new Error('개발 DB에 e2e-audit 계정이 없습니다');
  return data.id as string;
}

if (cmd === 'login') {
  const state = args[0];
  if (!state) throw new Error('상태 파일 경로를 적어 주세요');
  const id = await auditId();
  await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', id);
  await db.from('profiles').update({ joined_on: '2024-03-04' }).eq('id', id).is('joined_on', null); // 증명서 · 연차 화면을 보려면 입사일이 있어야 한다(개발 DB 검사 계정)
  // 동의 창은 안내문을 끝까지 읽어야 눌린다 — 검사 계정은 지금 판의 동의를 미리 넣어 둔다(개발 DB)
  await db.from('consents').upsert({ employee_id: id, kind: CONSENT.kind, version: CONSENT.version, locale: 'ko', client_ip: null }, { onConflict: 'employee_id,kind,version', ignoreDuplicates: true });
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  // 동의 창이 뜨면 동의한다(개발 DB의 검사 계정)
  const agree = p.getByRole('dialog').getByRole('button', { name: '동의합니다' });
  if (await agree.isVisible().catch(() => false)) {
    await agree.click();
    await p.waitForLoadState('networkidle');
  }
  await ctx.storageState({ path: state });
  await browser.close();
  console.log('로그인 상태를 저장했습니다');
} else if (cmd === 'shot') {
  const [state, dir, ...urls] = args;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // 통합설정은 숫자 4자리로 연다 — 검사 계정(개발 DB)의 숫자를 매번 무작위로 새로 정하고 바로 연다. 숫자는 어디에도 남기지 않는다
  const id = await auditId();
  const openConsole = async (p: import('playwright-core').Page) => {
    await db.from('console_pins').delete().eq('employee_id', id);
    for (let i = 0; i < 20; i++) {
      const pin = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, '0');
      // 브라우저 안에서 도는 코드는 글자로 넘긴다(tsx가 함수에 붙이는 __name이 브라우저에 없다)
      const r = (await p.evaluate(`(async () => {
        const post = (b) => fetch('/api/console/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.status);
        const set = await post({ action: 'set', pin: '${pin}', again: '${pin}' });
        return set === 200 ? post({ action: 'open', pin: '${pin}' }) : set;
      })()`)) as number;
      if (r === 200) return;
    }
    throw new Error('통합설정을 열지 못했습니다');
  };
  for (const [tag, width, height] of [['phone', 360, 780], ['pc', Number(process.env.W ?? 1440), process.env.W ? 1000 : 900]] as const) {
    const ctx = await browser.newContext({ storageState: state, viewport: { width, height } });
    const p = await ctx.newPage();
    if (urls.some((u) => u.startsWith('/admin/settings') || u.startsWith('/admin/console') || u.startsWith('/admin/manage') || u.startsWith('/admin/branches') || u.startsWith('/admin/jobs') || u.startsWith('/admin/places') || u.startsWith('/admin/shifts') || u.startsWith('/admin/leave/types') || u.startsWith('/admin/backups') || u.startsWith('/admin/diag') || u.startsWith('/admin/ops'))) {
      await p.goto(`${BASE}/admin`);
      await openConsole(p);
    }
    for (const u of urls) {
      await p.goto(BASE + u);
      await p.waitForLoadState('networkidle');
      await p.waitForTimeout(2500); // 등장 움직임이 끝날 때까지
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const name = `${tag}-${u.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'root'}.png`;
      await p.screenshot({ path: path.join(dir, name), fullPage: true });
      console.log(name, over > 0 ? `가로 넘침 ${over}px` : '');
    }
    await ctx.close();
  }
  await browser.close();
} else if (cmd === 'link') {
  // 의뢰인 브라우저로 열 초대 링크 — 검사 계정(개발 DB)을 켜고 1시간짜리 링크를 만든다. 열면 비밀번호를 정하고 바로 들어간다
  const id = await auditId();
  await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', id);
  await db.from('consents').upsert({ employee_id: id, kind: CONSENT.kind, version: CONSENT.version, locale: 'ko', client_ip: null }, { onConflict: 'employee_id,kind,version', ignoreDuplicates: true });
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  console.log(`${BASE}/register?token=${token}`);
} else if (cmd === 'slip') {
  // 확인용: 계산된 급여대장 하나와 그 안의 직원 id (개발 DB) — 「run emp」 두 칸만 찍는다
  const { data } = await db.from('payroll_statements').select('run_id, employee_id').order('created_at', { ascending: false }).limit(1);
  console.log(data?.[0] ? `${data[0].run_id} ${data[0].employee_id}` : '없음');
} else if (cmd === 'profile') {
  // 확인용: 회사 정보 중 알림 · 기록 열람 칸만
  const { data } = await db.from('company_profile_versions').select('value').order('created_at', { ascending: false }).limit(1);
  const v = (data?.[0]?.value ?? {}) as Record<string, unknown>;
  console.log(JSON.stringify({ pushAlways: v.pushAlways, logViewers: v.logViewers, me: await auditId() }));
} else if (cmd === 'company') {
  // 개발 DB 회사 정보에 임시 값 — 증명서 · 명세서 모양을 보려고 (2026-10-30 의뢰인: 「임의로 회사명 · 사업자등록번호 · 대표자 다 넣고 해 봐」). 스위치 등 나머지 칸은 그대로
  const { data } = await db.from('company_profile_versions').select('value').order('created_at', { ascending: false }).limit(1);
  const prev = (data?.[0]?.value as Record<string, unknown> | undefined) ?? {};
  const value = { ...prev, name: '(주)엠알씨앤피', ceo: '홍길동', bizNo: '123-45-67890', address: '경상남도 김해시 한림면 제내사일길 76', phone: '055-123-4567', privacyOfficer: '이상준 (경영지원실)' };
  const { error } = await db.from('company_profile_versions').insert({ value, created_by: await auditId() });
  console.log(error ? `실패 ${error.code}` : '개발 DB 회사 정보에 임시 값을 넣었습니다');
} else if (cmd === 'id') {
  console.log(await auditId()); // 검사 계정 id (개발 DB)
} else if (cmd === 'measure') {
  // 화면마다 본문(main) 폭 · 왼쪽 위치를 숫자로 (PC 1440) — 모든 화면 폭이 같은지 한 번에 본다 (2026-10-30)
  const [state, ...urls] = args;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ storageState: state, viewport: { width: Number(process.env.W ?? 1440), height: 900 } });
  const p = await ctx.newPage();
  for (const u of urls) {
    await p.goto(BASE + u);
    await p.waitForLoadState('networkidle');
    const r = await p.evaluate(`(() => { const m = [...document.querySelectorAll('main')].pop(); const b = m.getBoundingClientRect(); return Math.round(b.left) + ' ' + Math.round(b.width); })()`);
    console.log(`${r}  ${u}`);
  }
  await browser.close();
} else if (cmd === 'done') {
  const id = await auditId();
  const now = new Date().toISOString();
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', id);
  await db.from('invites').update({ revoked_at: now }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
  console.log('검사 계정을 껐습니다');
} else {
  throw new Error('login | shot | done');
}
