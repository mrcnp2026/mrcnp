// 직원 관리 실제 서버 검사: 복직 → 폰 등록 → 관리자 지정·해제 → 폰 해제 → 퇴사 처리(접속이 바로 끊기는지) (부록 R-2, ②-2 7-2, ②-3 7-12)
//   npx tsx scripts/e2e-staff.mts [사진 저장 폴더]   (앱이 켜져 있어야 한다)
// 검사 전용 계정만 쓴다: e2e-audit(검사 동안만 관리자, 요청하는 사람) → e2e-audit2(대상) + e2e-audit3(검사 동안만 관리자, **확인하는 두 번째 관리자** — R-2의 8).
//   실제 직원(admin·test)은 건드리지 않는다.
//   ★ "관리자 2명 미만 차단"은 실제 관리자를 대상으로 눌러 봐야 해서 여기서 하지 않는다 — 단위 검사(tests/staff-rules.test.ts)가 본다.
// 끝나면 두 계정 모두 비활성으로 돌아가고, 가짜 폰 등록은 해제된다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type BrowserContext } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
const { data: target } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit2').single();
// 두 번째 관리자 (확인하는 사람). 없으면 만든다 — e2e-audit으로 시작하는 계정은 꺼져 있으면 화면 목록에 보이지 않는다
let { data: second } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit3').maybeSingle();
if (!second) {
  const { data: u, error } = await db.auth.admin.createUser({ email: 'e2e-audit3@staff.invalid', email_confirm: true });
  if (error) throw error;
  await db.from('profiles').insert({ id: u.user!.id, name: '검사용3(자동)', employee_no: 'e2e-audit3', role: 'employee', locale: 'ko', active: false });
  second = { id: u.user!.id };
}
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', second!.id);
// 이전 실행이 중간에 멈췄다면 남은 대기 요청을 닫는다
await db.from('role_change_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('target_id', target!.id).eq('status', 'pending');
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
// 가입 여부 = 비밀번호를 만들었는가 (2026-10-05 로그인 방식 변경 — 예전에는 등록된 폰 수)
const phones = async () => ((await db.from('profiles').select('password_set_at').eq('id', target!.id).single()).data?.password_set_at ? 1 : 0);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const withPhone = async (ctx: BrowserContext) => {
  const p = await ctx.newPage();
  return p;
};
try {
  const p = await withPhone(await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }));
  await p.goto(`${BASE}/register?token=${await invite(emp!.id)}`);
  await createPassword(p);
  const post = (url: string, body?: unknown) =>
    p.evaluate(async ([u, b]) => {
      const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    }, [url, body] as const);
  const api = `/api/admin/employees/${target!.id}`;
  const mine = `/api/admin/employees/${emp!.id}`;
  const shot2 = async (pg: typeof p, name: string) => {
    if (!SHOTS) return;
    await pg.waitForLoadState('networkidle');
    await pg.waitForTimeout(800);
    await pg.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
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
  await createPassword(tp);
  await tp.goto(`${BASE}/punch`);
  check(new URL(tp.url()).pathname === '/punch' && (await phones()) === 1, '대상 직원: 비밀번호를 만든 뒤 출퇴근 화면 접속');

  // ── 권한 변경은 두 번째 관리자가 확인해야 반영된다 (R-2의 8) ──
  const cp = await withPhone(await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }));
  await cp.goto(`${BASE}/register?token=${await invite(second!.id)}`);
  await createPassword(cp);
  // 두 번째 관리자가 수집 동의를 아직 안 했으면 동의 창이 화면을 가린다 → 먼저 동의
  await cp.goto(`${BASE}/admin`);
  await cp.waitForLoadState('networkidle');
  if (await cp.getByRole('dialog', { name: '개인정보 수집·이용 동의' }).count()) {
    await cp.getByRole('button', { name: '동의합니다' }).click();
    await cp.getByRole('dialog', { name: '개인정보 수집·이용 동의' }).waitFor({ state: 'hidden', timeout: 20000 });
  }
  const post2 = (url: string, body?: unknown) =>
    cp.evaluate(async ([u, b]) => {
      const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    }, [url, body] as const);

  r = await post(`${api}/role`, { role: 'admin', reason: '관리자 추가 지정' });
  let reqId = r.json.requestId as string;
  check(r.status === 200 && r.json.pending === true && (await row()).role === 'employee', '관리자 지정 → 바로 반영되지 않고 "확인 대기"로 남음');
  await tp.goto(`${BASE}/admin`);
  check(new URL(tp.url()).pathname !== '/admin', '확인 전에는 아직 관리자 화면에 못 들어감', new URL(tp.url()).pathname);
  r = await post(`/api/admin/role-requests/${reqId}`, { decision: 'approved' });
  check(r.status === 403 && r.json.error === 'self_decision' && (await row()).role === 'employee', '요청한 본인은 스스로 확인하지 못함');
  r = await post(`${api}/role`, { role: 'admin', reason: '또 요청' });
  check(r.status === 409 && r.json.error === 'request_pending', '대기 중인 요청이 있으면 또 요청할 수 없음');
  r = await post2(`/api/admin/role-requests/${reqId}`, { decision: 'cancelled' });
  check(r.status === 403, '취소는 요청한 본인만');
  r = await post2(`/api/admin/role-requests/${reqId}`, { decision: 'rejected' });
  check(r.status === 200 && (await row()).role === 'employee', '두 번째 관리자가 거부 → 반영되지 않음');
  r = await post2(`/api/admin/role-requests/${reqId}`, { decision: 'approved' });
  check(r.status === 409 && r.json.error === 'already', '이미 처리된 요청은 다시 결정할 수 없음');

  // 다시 요청 → 두 번째 관리자가 화면에서 확인
  r = await post(`${api}/role`, { role: 'admin', reason: '관리자 추가 지정' });
  reqId = r.json.requestId as string;
  await p.goto(`${BASE}/admin/members/${target!.id}`);
  check((await p.getByText('다른 관리자가 확인하면 반영됩니다.').count()) > 0 && (await p.getByRole('button', { name: '요청 취소' }).count()) === 1, '요청한 사람 화면: "확인을 기다리는 중" + 요청 취소');
  await cp.goto(`${BASE}/admin`);
  check((await cp.getByText('권한 변경 확인 대기').count()) > 0, '두 번째 관리자의 홈 「처리할 일」에 권한 변경 확인 대기');
  await cp.getByText('권한 변경 확인 대기').click();
  await cp.waitForURL(new RegExp(`/admin/members/${target!.id}`));
  await shot2(cp, 'staff-role-confirm');
  await cp.getByRole('button', { name: '확인 (반영)' }).click();
  await cp.getByText('권한 변경 — 확인 대기').waitFor({ state: 'hidden', timeout: 20000 });
  check((await row()).role === 'admin' && (await row()).updated_by === second!.id, '두 번째 관리자가 화면에서 확인 → 관리자로 반영');
  const { data: rr } = await db.from('role_change_requests').select('status, requested_by, decided_by').eq('id', reqId).single();
  check(rr?.status === 'approved' && rr.requested_by === emp!.id && rr.decided_by === second!.id, '요청자와 확인자가 모두 기록에 남음');
  await tp.goto(`${BASE}/admin`);
  check(new URL(tp.url()).pathname === '/admin', '확인된 뒤에는 관리자 화면에 들어감');

  r = await post(`${api}/role`, { canViewPayroll: true, reason: '급여 업무 담당' });
  check(r.status === 403 && r.json.error === 'payroll_only_grant' && (await row()).can_view_payroll === false, '급여 담당이 아닌 관리자는 급여 담당 지정을 요청할 수도 없음');
  r = await post(`${api}/role`, { role: 'admin', reason: '시험 사유' });
  check(r.status === 409 && r.json.error === 'already', '이미 관리자면 "이미 그 상태"');

  // 관리자 해제: 요청 → 본인이 취소 → 다시 요청 → 확인
  r = await post(`${api}/role`, { role: 'employee', reason: '잘못 지정함' });
  reqId = r.json.requestId as string;
  r = await post(`/api/admin/role-requests/${reqId}`, { decision: 'cancelled' });
  check(r.status === 200 && (await row()).role === 'admin', '요청한 본인이 취소 → 반영되지 않음');
  r = await post(`${api}/role`, { role: 'employee', reason: '잘못 지정함' });
  r = await post2(`/api/admin/role-requests/${r.json.requestId}`, { decision: 'approved' });
  check(r.status === 200 && (await row()).role === 'employee', '관리자 해제도 두 번째 관리자가 확인해야 반영');
  await tp.goto(`${BASE}/admin`);
  check(new URL(tp.url()).pathname !== '/admin', '해제된 사람은 관리자 화면에서 밀려남', new URL(tp.url()).pathname);
  await cp.context().close();

  // ── 로그인 초기화 (예전의 폰 해제) ──
  await p.goto(`${BASE}/admin/members/${target!.id}`);
  await shot('staff-detail');
  await p.getByRole('button', { name: /로그인 초기화/ }).click();
  await p.getByRole('button', { name: '폰 분실', exact: true }).click();
  await p.getByRole('button', { name: '로그인 초기화', exact: true }).last().click();
  await p.getByText('아직 가입 안 함').waitFor({ timeout: 20000 });
  check((await phones()) === 0, '화면에서 로그인 초기화: 가입 전 상태로');

  // ── 퇴사 처리: 바로 접속이 끊긴다 ──
  await tp.goto(`${BASE}/punch`);
  check(new URL(tp.url()).pathname === '/login', '로그인을 초기화하면 열려 있던 화면도 바로 로그인으로 밀려남', new URL(tp.url()).pathname);
  // 초대 링크로 비밀번호를 다시 만든다 → 다시 접속된다
  await tp.goto(`${BASE}/register?token=${await invite(target!.id)}`);
  await createPassword(tp);
  await tp.goto(`${BASE}/punch`);
  check(new URL(tp.url()).pathname === '/punch' && (await phones()) === 1, '초대 링크로 비밀번호를 다시 만들면 접속');
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
  check(['reinstate', 'role_changed', 'login_reset', 'resign'].every((e) => events.includes(e)) && (logs ?? []).every((l) => l.actor_id === emp!.id || l.actor_id === second!.id), '변경 기록에 누가·무엇을·왜가 남음', events.join(','));
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
  await db.from('role_change_requests').update({ status: 'cancelled', decided_at: now }).eq('target_id', target!.id).eq('status', 'pending');
  await db.from('profiles').update({ role: 'employee', locale: 'ko', active: false, updated_by: null }).eq('id', second!.id);
  for (const id of [emp!.id, target!.id, second!.id]) {
    await db.from('user_passkeys').update({ revoked_at: now, device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', id).is('revoked_at', null).gte('created_at', STARTED_AT);
    await db.from('invites').update({ revoked_at: now }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
  }
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
