// 직원 관리 실제 서버 검사: 복직 → 폰 등록 → 관리자 지정·해제 → 폰 해제 → 퇴사 처리(접속이 바로 끊기는지) (부록 R-2, ②-2 7-2, ②-3 7-12)
//   npx tsx scripts/e2e-staff.mts [사진 저장 폴더]   (앱이 켜져 있어야 한다)
// 검사 전용 계정만 쓴다: e2e-audit(검사 동안만 관리자, 실행하는 사람) → e2e-audit2(대상). 실제 직원(admin·test)은 건드리지 않는다.
//   ★ "관리자 2명 미만 차단"은 실제 관리자를 대상으로 눌러 봐야 해서 여기서 하지 않는다 — 단위 검사(tests/staff-rules.test.ts)가 본다.
// 끝나면 두 계정 모두 비활성으로 돌아가고, 가짜 폰 등록은 해제된다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type BrowserContext } from 'playwright-core';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
const { data: target } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit2').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
const invite = async (id: string) => {
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return token;
};

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`);
  if (!ok) fails++;
};
const row = async () => (await db.from('profiles').select('active, role, can_view_payroll, updated_by').eq('id', target!.id).single()).data!;
const phones = async () => (await db.from('user_passkeys').select('id', { count: 'exact', head: true }).eq('employee_id', target!.id).is('revoked_at', null)).count ?? 0;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const withPhone = async (ctx: BrowserContext) => {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return p;
};
try {
  const p = await withPhone(await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }));
  await p.goto(`${BASE}/register?token=${await invite(emp!.id)}`);
  await p.getByRole('button', { name: /이 폰 등록하기/ }).click();
  await p.getByText('폰이 등록되었습니다.').waitFor({ timeout: 30000 });
  const post = (url: string, body?: unknown) =>
    p.evaluate(async ([u, b]) => {
      const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    }, [url, body] as const);
  const api = `/api/admin/employees/${target!.id}`;
  const mine = `/api/admin/employees/${emp!.id}`;
  const shot = async (name: string) => {
    if (!SHOTS) return;
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };

  // ── 본인 것은 스스로 못 바꾼다 ──
  let r = await post(`${mine}/status`, { action: 'resign', reason: '시험 사유' });
  check(r.status === 403 && r.json.error === 'self_change', '본인 퇴사 처리 차단');
  r = await post(`${mine}/role`, { canViewPayroll: true, reason: '시험 사유' });
  check(r.status === 403 && r.json.error === 'self_change', '자기에게 급여 담당 켜기 차단');
  r = await post(`${mine}/phone`, { reason: '시험 사유' });
  check(r.status === 403 && r.json.error === 'self_change', '자기 폰 해제 차단');
  check((await db.from('profiles').select('active, role, can_view_payroll').eq('id', emp!.id).single()).data?.can_view_payroll === false, '본인 값은 그대로');

  // ── 복직 (사유 필수) ──
  if ((await row()).active) await db.from('profiles').update({ active: false }).eq('id', target!.id);
  r = await post(`${api}/status`, { action: 'reinstate', reason: '' });
  check(r.status === 400 && r.json.error === 'reason_required', '사유 없는 복직 차단');
  await p.goto(`${BASE}/admin/members/${target!.id}`);
  await p.getByRole('button', { name: /복직/ }).click();
  await p.getByRole('button', { name: '재입사', exact: true }).click();
  await p.getByRole('button', { name: '복직 (다시 활성)', exact: true }).last().click();
  await p.getByRole('button', { name: /퇴사 처리/ }).waitFor({ timeout: 20000 });
  check((await row()).active === true && (await row()).updated_by === emp!.id, '화면에서 복직: 활성·고친 사람 기록');

  // ── 대상 직원이 자기 폰을 등록하고 접속한다 (다른 브라우저) ──
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tp = await withPhone(tctx);
  await tp.goto(`${BASE}/register?token=${await invite(target!.id)}`);
  await tp.getByRole('button', { name: /Register this phone|이 폰 등록하기/ }).click();
  await tp.getByText(/Your phone is registered\.|폰이 등록되었습니다\./).waitFor({ timeout: 30000 });
  await tp.goto(`${BASE}/punch`);
  check(new URL(tp.url()).pathname === '/punch' && (await phones()) === 1, '대상 직원: 폰 등록 후 출퇴근 화면 접속');

  // ── 관리자 지정 → 급여 담당은 급여 담당자만 → 관리자 해제 ──
  r = await post(`${api}/role`, { role: 'admin', reason: '관리자 추가 지정' });
  check(r.status === 200 && (await row()).role === 'admin', '관리자로 지정');
  await tp.goto(`${BASE}/admin`);
  check(new URL(tp.url()).pathname === '/admin', '지정된 사람이 관리자 화면에 들어감');
  r = await post(`${api}/role`, { canViewPayroll: true, reason: '급여 업무 담당' });
  check(r.status === 403 && r.json.error === 'payroll_only_grant' && (await row()).can_view_payroll === false, '급여 담당이 아닌 관리자는 급여 담당을 지정하지 못함');
  r = await post(`${api}/role`, { role: 'admin', reason: '시험 사유' });
  check(r.status === 409 && r.json.error === 'already', '이미 관리자면 "이미 그 상태"');
  r = await post(`${api}/role`, { role: 'employee', reason: '잘못 지정함' });
  check(r.status === 200 && (await row()).role === 'employee', '관리자 해제 (관리자 3명 → 2명)');
  await tp.goto(`${BASE}/admin`);
  check(new URL(tp.url()).pathname !== '/admin', '해제된 사람은 관리자 화면에서 밀려남', new URL(tp.url()).pathname);

  // ── 폰 해제 ──
  await p.goto(`${BASE}/admin/members/${target!.id}`);
  await shot('staff-detail');
  await p.getByRole('button', { name: /폰 등록 해제/ }).click();
  await p.getByRole('button', { name: '폰 분실', exact: true }).click();
  await p.getByRole('button', { name: '폰 등록 해제', exact: true }).last().click();
  await p.getByText('폰 미등록').waitFor({ timeout: 20000 });
  check((await phones()) === 0, '화면에서 폰 해제');
  r = await post(`${api}/phone`, { reason: '시험 사유' });
  check(r.status === 409 && r.json.error === 'no_phone', '등록된 폰이 없으면 해제할 것이 없음');

  // ── 퇴사 처리: 바로 접속이 끊긴다 ──
  await tp.goto(`${BASE}/punch`);
  check(new URL(tp.url()).pathname === '/login', '폰이 해제되면 그 폰에 열려 있던 화면도 바로 로그인으로 밀려남', new URL(tp.url()).pathname);
  // 새 폰을 다시 등록 (초대 링크) → 다시 접속된다
  await tp.goto(`${BASE}/register?token=${await invite(target!.id)}`);
  await tp.getByRole('button', { name: /Register this phone|이 폰 등록하기/ }).click();
  await tp.getByText(/Your phone is registered.|폰이 등록되었습니다./).waitFor({ timeout: 30000 });
  await tp.goto(`${BASE}/punch`);
  check(new URL(tp.url()).pathname === '/punch' && (await phones()) === 1, '초대 링크로 새 폰을 등록하면 다시 접속');
  // 직접 DB 읽기에 쓸 로그인 토큰 (퇴사 뒤에도 만료 전까지 유효한 것)
  const cookies = await tctx.cookies();
  const authCookie = cookies.filter((c) => c.name.includes('auth-token')).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join('');
  const session = authCookie ? JSON.parse(Buffer.from(authCookie.replace(/^base64-/, ''), 'base64').toString('utf8')) : null;
  const direct = async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=id`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, authorization: `Bearer ${session?.access_token}` } });
    return res.ok ? ((await res.json()) as unknown[]).length : -1;
  };
  const before = session?.access_token ? await direct() : null;
  check(before === 1, '재직 중: 로그인 토큰으로 자기 정보 1건을 직접 읽을 수 있음', String(before));

  await p.goto(`${BASE}/admin/members/${target!.id}`);
  await p.getByRole('button', { name: /퇴사 처리/ }).click();
  await p.getByRole('button', { name: '계약 종료', exact: true }).click();
  await shot('staff-resign');
  await p.getByRole('button', { name: '퇴사 처리', exact: true }).last().click();
  await p.getByRole('button', { name: /복직/ }).waitFor({ timeout: 20000 });
  check((await row()).active === false, '화면에서 퇴사 처리: 비활성');
  await tp.goto(`${BASE}/punch`);
  check(new URL(tp.url()).pathname === '/login', '퇴사자의 열려 있던 화면이 바로 로그인으로 밀려남', new URL(tp.url()).pathname);
  const tr = await tp.evaluate(async () => (await fetch('/api/punch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"kind":"in"}' })).status);
  check(tr === 401 || tr === 403, '퇴사자의 출퇴근 요청 거부', String(tr));
  const after = session?.access_token ? await direct() : null;
  check(after === 0, '퇴사 뒤: 같은 토큰으로 DB를 직접 읽어도 0건 (0015)', String(after));
  const { data: au } = await db.auth.admin.getUserById(target!.id);
  check(!!(au.user as { banned_until?: string } | null)?.banned_until, '로그인 계정 차단됨');
  const { data: logs } = await db.from('audit_logs').select('reason, after_data, actor_id').eq('target_table', 'profiles').eq('target_id', target!.id).gte('created_at', STARTED_AT).not('reason', 'is', null);
  const events = (logs ?? []).map((l) => (l.after_data as { event?: string })?.event);
  check(['reinstate', 'role_changed', 'phone_revoked', 'resign'].every((e) => events.includes(e)) && (logs ?? []).every((l) => l.actor_id === emp!.id), '변경 기록에 누가·무엇을·왜가 남음', events.join(','));
  await p.goto(`${BASE}/admin/members`);
  check((await p.getByText('검사용2(자동)').count()) === 0, '검사 계정은 직원 목록에 보이지 않음');
  await tctx.close();
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  const now = new Date().toISOString();
  await db.from('profiles').update({ role: 'employee', can_view_payroll: false, active: false, updated_by: null }).eq('id', target!.id);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false, updated_by: null }).eq('id', emp!.id);
  for (const id of [emp!.id, target!.id]) {
    await db.from('user_passkeys').update({ revoked_at: now, device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', id).is('revoked_at', null).gte('created_at', STARTED_AT);
    await db.from('invites').update({ revoked_at: now }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
  }
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
