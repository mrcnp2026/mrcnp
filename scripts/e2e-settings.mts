// 설정 화면 실제 서버 검사: 근무시간(새 규칙·숨기기) · 휴일(추가·빼기) · 사무실 인터넷 주소(추가·끄기).
//   npx tsx scripts/e2e-settings.mts [사진 저장 폴더]   (앱이 켜져 있어야 한다)
// ★ 실제 설정을 건드리지 않게 먼 미래 날짜와 쓰이지 않는 시험용 주소만 쓴다:
//   근무시간 = 2099년 시작 규칙(넣고 바로 숨김), 휴일 = 2099-12-31(넣고 바로 뺌), 주소 = 198.51.100.7(문서용 시험 대역, 넣고 바로 끔 — 메모 'e2e-…'는 화면 목록에서 숨긴다)
// 지금 적용 중인 근무시간·휴일·주소는 읽기만 한다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const before = {
  rules: (await db.from('work_rules').select('id', { count: 'exact', head: true }).eq('active', true)).count,
  holidays: (await db.from('holidays').select('the_date', { count: 'exact', head: true })).count,
  nets: (await db.from('office_networks').select('id', { count: 'exact', head: true }).eq('active', true)).count,
};
const RULE_DAY = `2099-0${1 + Math.floor(Math.random() * 9)}-${10 + Math.floor(Math.random() * 18)}`;
const HOLIDAY = '2099-12-31';
const NET = '198.51.100.7';

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`);
  if (!ok) fails++;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const pageErrors: string[] = [];
  p.on('pageerror', (e) => pageErrors.push(e.message.split(/\r?\n/)[0]));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(`${BASE}/register?token=${token}`);
  await p.getByRole('button', { name: /이 폰 등록하기/ }).click();
  await p.getByText('폰이 등록되었습니다.').waitFor({ timeout: 30000 });
  const post = (body: unknown) =>
    p.evaluate(async (b) => {
      const r = await fetch('/api/admin/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    }, body);
  const rule = (over: Record<string, unknown> = {}) => ({ action: 'rule.add', startTime: '09:30', endTime: '18:30', lateGraceMin: 5, breakStart: '12:00', breakEnd: '13:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7, effectiveFrom: RULE_DAY, ...over });

  // ── 근무시간 ──
  await p.goto(`${BASE}/admin/more`);
  await p.getByRole('link', { name: /설정/ }).click();
  await p.getByRole('heading', { name: '설정' }).waitFor();
  check((await p.getByText(/부터 적용 중/).count()) === 1, '지금 적용 중인 근무시간이 보임');
  let r = await post(rule({ effectiveFrom: '2020-01-01' }));
  check(r.status === 400 && r.json.error === 'past_date', '지난 날짜부터 적용하는 규칙은 차단');
  r = await post(rule({ startTime: '19:00' }));
  check(r.status === 400 && r.json.error === 'invalid_time', '출근이 퇴근보다 늦으면 차단');
  r = await post(rule({ workdays: [1, 2, 3, 4, 5, 7] }));
  check(r.status === 400 && r.json.error === 'invalid_workdays', '주휴일이 근무 요일이면 차단');
  await p.getByRole('button', { name: /근무시간 바꾸기/ }).click();
  await p.locator('input[name=effectiveFrom]').fill(RULE_DAY);
  await p.locator('input[name=startTime]').fill('09:30');
  await p.locator('input[name=endTime]').fill('18:30');
  await p.getByRole('button', { name: '저장', exact: true }).click();
  await p.getByText(/부터 적용 예정/).waitFor({ timeout: 20000 });
  const { data: added } = await db.from('work_rules').select('id, start_time, end_time, active').eq('effective_from', RULE_DAY).eq('active', true).single();
  check(added?.start_time === '09:30:00' && added.end_time === '18:30:00', '화면에서 새 규칙 추가 → "적용 예정"으로 보임');
  if (SHOTS) {
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(SHOTS, 'settings.png'), fullPage: true });
  }
  r = await post(rule());
  check(r.status === 409 && r.json.error === 'duplicate_rule', '같은 날짜에 시작하는 규칙을 또 넣으면 차단');
  const { data: cur } = await db.from('work_rules').select('id').eq('active', true).lte('effective_from', new Date().toISOString().slice(0, 10)).order('effective_from', { ascending: false }).limit(1).single();
  r = await post({ action: 'rule.hide', id: cur!.id });
  check(r.status === 409 && r.json.error === 'rule_in_use', '이미 적용 중인 규칙은 숨길 수 없음');
  await p.getByRole('button', { name: `${RULE_DAY} 시작 규칙 숨기기` }).click();
  await p.getByRole('button', { name: '숨기기', exact: true }).click();
  await p.getByText(/부터 적용 예정/).waitFor({ state: 'hidden', timeout: 20000 });
  check((await db.from('work_rules').select('active').eq('id', added!.id).single()).data?.active === false, '화면에서 예정 규칙 숨기기 (지우지 않음)');

  // ── 휴일 ──
  r = await post({ action: 'holiday.add', date: '2020-01-01', label: '시험', kind: 'company' });
  check(r.status === 400 && r.json.error === 'past_date', '지난 달 휴일 추가 차단');
  await db.from('holidays').delete().eq('the_date', HOLIDAY);
  r = await post({ action: 'holiday.add', date: HOLIDAY, label: 'e2e 시험 휴일', kind: 'company' });
  check(r.status === 200, '휴일 추가');
  r = await post({ action: 'holiday.add', date: HOLIDAY, label: '또', kind: 'company' });
  check(r.status === 409 && r.json.error === 'duplicate_holiday', '같은 날 두 번은 차단');
  r = await post({ action: 'holiday.remove', date: HOLIDAY });
  check(r.status === 200 && (await db.from('holidays').select('the_date', { count: 'exact', head: true }).eq('the_date', HOLIDAY)).count === 0, '휴일 빼기');
  r = await post({ action: 'holiday.remove', date: '2026-01-01' });
  check(r.status === 400 && r.json.error === 'past_date', '지난 달 휴일은 뺄 수 없음');

  // ── 사무실 인터넷 주소 ──
  r = await post({ action: 'network.add', cidr: '0.0.0.0/0', label: 'e2e-x' });
  check(r.status === 400 && r.json.error === 'invalid_cidr', '"어디서나 사무실"이 되는 넓은 대역 차단');
  r = await post({ action: 'network.add', cidr: NET, label: 'e2e-시험 주소' });
  const netId = r.json.id as string;
  check(r.status === 200 && r.json.cidr === `${NET}/32`, '주소 하나는 /32로 저장', JSON.stringify(r.json.cidr));
  r = await post({ action: 'network.add', cidr: NET, label: 'e2e-시험 주소' });
  check(r.status === 409 && r.json.error === 'duplicate_network', '같은 주소 두 번은 차단');
  r = await post({ action: 'network.toggle', id: netId, active: false });
  check(r.status === 200 && (await db.from('office_networks').select('active').eq('id', netId).single()).data?.active === false, '주소 끄기 (지우지 않음)');
  await p.reload();
  check((await p.getByText(NET).count()) === 0, '꺼 둔 검사용 주소는 화면 목록에 보이지 않음');

  // ── 변경 기록 · 원래 설정 그대로 · 화면 ──
  const { data: logs } = await db.from('audit_logs').select('after_data, actor_id').gte('created_at', STARTED_AT).in('target_table', ['work_rules', 'holidays', 'office_networks']).eq('actor_id', emp!.id);
  const events = new Set((logs ?? []).map((l) => (l.after_data as { event?: string })?.event));
  check(['rule.add', 'rule.hide', 'holiday.add', 'holiday.remove', 'network.add', 'network.off'].every((e) => events.has(e)), '변경 기록에 누가·무엇을 바꿨는지 남음', [...events].join(','));
  const after = {
    rules: (await db.from('work_rules').select('id', { count: 'exact', head: true }).eq('active', true)).count,
    holidays: (await db.from('holidays').select('the_date', { count: 'exact', head: true })).count,
    nets: (await db.from('office_networks').select('id', { count: 'exact', head: true }).eq('active', true)).count,
  };
  check(JSON.stringify(after) === JSON.stringify(before), '실제 설정(규칙·휴일·주소 수)은 검사 전과 같음', JSON.stringify(after));
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.goto(`${BASE}/admin/settings`);
    await p.waitForLoadState('networkidle');
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= w, `가로 넘침 없음 @${w}`, `${sw}px`);
  }
  check(pageErrors.length === 0, '화면 오류 없음', pageErrors.join(' | '));
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  // 혹시 남았으면 정리
  await db.from('work_rules').update({ active: false }).eq('effective_from', RULE_DAY).eq('active', true);
  await db.from('holidays').delete().eq('the_date', HOLIDAY);
  await db.from('office_networks').update({ active: false }).eq('cidr', `${NET}/32`).eq('active', true);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
