// 직원별 날짜 기록 + 관리자 대리 등록 실제 서버 검사 (②-3 7-6).
//   npx tsx scripts/e2e-proxy.mts [사진 저장 폴더]   (앱이 켜져 있어야 한다)
//   VIEW_ONLY=1 을 붙이면 새 기록을 넣지 않고, 전에 넣은 날짜로 화면 이동·넘침만 확인한다 (시험 날짜를 아낀다)
// 검사 전용 계정 둘을 쓴다: e2e-audit(검사 동안만 관리자) → e2e-audit2(대상 직원, 늘 비활성)의 기록을 넣는다.
//   본인 기록은 대신 넣을 수 없어서 대상 계정이 따로 필요하다.
// 연습 기록(is_test)으로, 지난 날짜 중 승인된 정정이 없는 하루를 고른다. 끝나면 이번에 넣은 기록을 취소해 둔다(취소 내역은 남는다, 4-1).
// 끝나면 가짜 폰 등록을 해제하고 e2e-audit을 다시 끈다.
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
let { data: target } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit2').maybeSingle();
if (!target) {
  const { data: u, error } = await db.auth.admin.createUser({ email: 'e2e-audit2@staff.invalid', email_confirm: true });
  if (error) throw error;
  await db.from('profiles').insert({ id: u.user!.id, name: '검사용2(자동)', employee_no: 'e2e-audit2', role: 'employee', locale: 'en', active: false });
  target = { id: u.user!.id };
}
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

// 시험 날짜: 근무규칙이 있는 날(가장 이른 적용 시작일)부터 어제까지 중, 이 계정에 아직 기록을 넣지 않은 하루.
//   근무규칙이 없는 날짜는 화면이 계산하지 않아 줄이 나오지 않는다. 넣은 기록은 못 지우므로 쓴 날짜는 다시 못 쓴다.
const { data: firstRule } = await db.from('work_rules').select('effective_from').order('effective_from').limit(1).maybeSingle();
// 취소된 정정은 집계에 안 쓰이므로 그 날짜는 다시 쓸 수 있다 — 승인 상태로 남은 날짜만 뺀다
const { data: usedRows } = await db.from('punch_corrections').select('work_date').eq('employee_id', target!.id).eq('status', 'approved');
const used = new Set((usedRows ?? []).map((x) => x.work_date));
const kstToday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const free: string[] = [];
for (let t = new Date(`${firstRule?.effective_from ?? kstToday}T00:00:00Z`); t.toISOString().slice(0, 10) < kstToday; t.setUTCDate(t.getUTCDate() + 1)) {
  const day = t.toISOString().slice(0, 10);
  if (!used.has(day)) free.push(day);
}
const VIEW_ONLY = process.env.VIEW_ONLY === '1' && used.size > 0;
if (free.length === 0 && !VIEW_ONLY) {
  console.log('중단: 시험에 쓸 수 있는 지난 날짜가 없습니다 (근무규칙 시작일~어제가 모두 사용됨). 내일 다시 실행하세요.');
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  process.exit(2);
}
const DAY = VIEW_ONLY ? [...used].sort().pop()! : free[Math.floor(Math.random() * free.length)];
const YM = DAY.slice(0, 7);
// 화면의 그 날 줄 (같은 달에 전에 넣은 날이 있어도 섞이지 않게 날짜 글자로 찾는다)
const DAY_LABEL = new Intl.DateTimeFormat('ko', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }).format(new Date(`${DAY}T12:00:00+09:00`));
const WEEKDAY = ![0, 6].includes(new Date(`${DAY}T00:00:00Z`).getUTCDay());

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`);
  if (!ok) fails++;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(`${BASE}/register?token=${token}`);
  await p.getByRole('button', { name: /이 폰 등록하기/ }).click();
  await p.getByText('폰이 등록되었습니다.').waitFor({ timeout: 30000 });
  const post = (url: string, body?: unknown) =>
    p.evaluate(async ([u, b]) => {
      const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    }, [url, body] as const);
  const api = `/api/admin/employees/${target!.id}/punch`;
  const row = p.locator('main > ul > li', { hasText: DAY_LABEL });
  const shot = async (name: string) => SHOTS && (await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }));

  if (!VIEW_ONLY) {
  // ── 서버가 막는 것 ──
  let r = await post(api, { workDate: DAY, kind: 'in', time: '09:00', reason: '' });
  check(r.status === 400 && r.json.error === 'reason_required', '사유가 비면 차단', JSON.stringify(r.json.error));
  r = await post(api, { workDate: DAY, kind: 'in', time: '09:00', reason: '.' });
  check(r.status === 400 && r.json.error === 'reason_required', '사유 한 글자도 차단');
  r = await post(api, { workDate: '2099-01-05', kind: 'in', time: '09:00', reason: '시험 사유' });
  check(r.status === 400 && r.json.error === 'future_time', '미래 날짜 차단');
  r = await post(`/api/admin/employees/${emp!.id}/punch`, { workDate: DAY, kind: 'in', time: '09:00', reason: '시험 사유' });
  check(r.status === 403 && r.json.error === 'proxy_self', '본인 기록은 대신 넣지 못함');

  // ── 화면에서 넣기: 출근 ──
  await p.goto(`${BASE}/admin/records/${target!.id}?m=${YM}`);
  await p.getByRole('heading', { name: '검사용2(자동)' }).waitFor();
  await p.getByRole('button', { name: '다른 날짜에 기록 넣기' }).click();
  await p.locator('input[type=date]').fill(DAY);
  await p.locator('input[type=time]').fill('09:00');
  check(await p.getByRole('button', { name: '다음' }).isDisabled(), '사유 없이는 「다음」이 눌리지 않음');
  await p.getByRole('button', { name: '폰 배터리 방전' }).click();
  await p.getByRole('button', { name: '다음' }).click();
  await p.getByText('날짜와 시각을 다시 확인하세요').waitFor();
  await shot('proxy-confirm');
  await p.getByRole('button', { name: '넣기', exact: true }).click();
  await p.getByText('날짜와 시각을 다시 확인하세요').waitFor({ state: 'hidden', timeout: 20000 });
  await row.getByText('출근 09:00').first().waitFor({ timeout: 20000 });
  check(true, '출근을 넣으면 그 날 줄에 「출근 09:00」이 뜸');
  check((await row.getByText('관리자 등록', { exact: true }).count()) > 0, '「관리자 등록」 표시');
  check((await row.getByText('퇴근 기록 없음').count()) > 0, '퇴근이 없어 「퇴근 기록 없음」');

  // ── 그 줄의 버튼으로 퇴근 넣기 ──
  await row.getByRole('button', { name: '기록 넣기', exact: true }).click();
  r = await post(api, { workDate: DAY, kind: 'out', time: '08:00', reason: '시험 사유' });
  check(r.status === 400 && r.json.error === 'time_order', '출근보다 이른 퇴근은 차단');
  await row.locator('input[type=time]').fill('18:30');
  await row.locator('textarea').fill('폰 미소지 — 수기 기록지 확인');
  await p.getByRole('button', { name: '다음' }).click();
  await p.getByRole('button', { name: '넣기', exact: true }).click();
  await p.getByText('날짜와 시각을 다시 확인하세요').waitFor({ state: 'hidden', timeout: 20000 });
  await row.getByText('퇴근 18:30').first().waitFor({ timeout: 20000 });
  check(true, '퇴근을 넣으면 「퇴근 18:30」이 뜸');
  if (WEEKDAY) check((await row.getByText('8시간 30분').count()) > 0, '근로시간 8시간 30분 (휴게 1시간 제외)');
  r = await post(api, { workDate: DAY, kind: 'out', time: '19:00', reason: '시험 사유' });
  check(r.status === 409 && r.json.error === 'already_exists', '같은 날 같은 기록을 또 넣으면 차단');
  await row.getByText(/원래 기록·정정 내역 \d+건/).click();
  await p.waitForTimeout(300);
  check((await row.getByText(/관리자 .* 등록/).count()) > 0 && (await row.getByText('사유: 폰 배터리 방전').count()) > 0, '원래 기록·정정 내역에 넣은 사람·사유가 보임');
  await shot('proxy-detail-390');

  // ── 잘못 넣은 기록 취소 (0016) ──
  r = await post(`/api/admin/corrections/11111111-1111-1111-1111-111111111111/cancel`, { reason: '시험 사유' });
  check(r.status === 404, '없는 정정은 취소할 수 없음');
  const { data: outRow } = await db.from('punch_corrections').select('id').eq('employee_id', target!.id).eq('work_date', DAY).eq('kind', 'out').eq('status', 'approved').single();
  r = await post(`/api/admin/corrections/${outRow!.id}/cancel`, { reason: '' });
  check(r.status === 400 && r.json.error === 'reason_required', '사유 없는 취소 차단');
  await row.getByRole('button', { name: '퇴근 18:30 취소' }).click();
  await row.getByRole('button', { name: '시각을 잘못 넣음' }).click();
  await row.getByRole('button', { name: '취소하기', exact: true }).click();
  await row.getByText('퇴근 기록 없음').waitFor({ timeout: 20000 });
  check(true, '퇴근을 취소하면 다시 「퇴근 기록 없음」');
  const { data: cancelled } = await db.from('punch_corrections').select('status').eq('id', outRow!.id).single();
  const { data: cl } = await db.from('decision_log').select('decision, reason, decided_by').eq('subject_id', outRow!.id).eq('decision', 'cancelled');
  check(cancelled?.status === 'cancelled' && cl?.length === 1 && cl[0].decided_by === emp!.id && cl[0].reason === '시각을 잘못 넣음', '정정은 지워지지 않고 취소됨으로 남음 + 결정 기록에 누가·왜');
  r = await post(`/api/admin/corrections/${outRow!.id}/cancel`, { reason: '시험 사유' });
  check(r.status === 409 && r.json.error === 'already', '이미 취소한 것을 또 취소하면 "이미"');
  r = await post(api, { workDate: DAY, kind: 'out', time: '18:30', reason: '폰 미소지 — 다시 넣음' });
  check(r.status === 200, '취소한 뒤에는 같은 날 퇴근을 다시 넣을 수 있음');
  await p.reload();
  await row.getByText('퇴근 18:30').first().waitFor({ timeout: 20000 });

  // ── DB: 원본은 그대로, 정정·결정 기록만 ──
  const { count: evCount } = await db.from('punch_events').select('id', { count: 'exact', head: true }).eq('employee_id', target!.id).eq('work_date', DAY);
  check(evCount === 0, '원본 기록(punch_events)에는 아무것도 안 들어감', `${evCount}건`);
  const { data: co } = await db.from('punch_corrections').select('id, status, requested_by, approved_by, reason, is_test, correction_type').eq('employee_id', target!.id).eq('work_date', DAY).gte('created_at', STARTED_AT);
  const live = (co ?? []).filter((c) => c.status === 'approved');
  check(co?.length === 3 && live.length === 2 && live.every((c) => c.requested_by === emp!.id && c.approved_by === emp!.id && c.correction_type === 'add_missing' && c.reason.length > 1), '정정 3건(승인 2 · 취소 1): 넣은 사람·사유 기록', `${co?.length}건`);
  const { count: logCount } = await db.from('decision_log').select('id', { count: 'exact', head: true }).in('subject_id', (co ?? []).map((c) => c.id));
  check(logCount === 4, '결정 기록(decision_log) 4건 (승인 3 + 취소 1)', `${logCount}건`);
  const { count: pend } = await db.from('punch_corrections').select('id', { count: 'exact', head: true }).eq('employee_id', target!.id).eq('status', 'pending');
  check(pend === 0, '거절된 시도가 대기 건으로 남지 않음', `${pend}건`);

  }
  // ── 기록 탭 → 직원 화면으로 들어가는 길 + 현황판 출근율 ──
  await p.goto(`${BASE}/admin/records?m=${YM}`);
  await p.getByText('검사용2(자동)').first().click();
  await p.getByRole('link', { name: /날짜별 기록 보기/ }).first().click();
  await p.waitForURL(new RegExp(`/admin/records/${target!.id}`));
  check(true, '기록 탭(폰) › 직원 펼침 › 「날짜별 기록 보기」로 이동');
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(`${BASE}/admin/records?m=${YM}`);
  await p.getByRole('link', { name: '검사용2(자동)' }).click();
  await p.waitForURL(new RegExp(`/admin/records/${target!.id}`));
  check(true, '기록 탭(넓은 화면) › 이름을 누르면 이동');
  await shot('proxy-detail-1280');
  await p.goto(`${BASE}/admin/records/${emp!.id}`);
  check((await p.getByText('본인 기록은 여기서 넣을 수 없습니다').count()) > 0 && (await p.getByRole('button', { name: /기록 넣기/ }).count()) === 0, '본인 화면에는 넣기 버튼이 없음');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/admin`);
  await p.waitForLoadState('networkidle');
  const rate = await p.getByText(/출근율 \d+%/).count();
  console.log(`INFO 현황판 출근율 표시: ${rate ? await p.getByText(/출근율 \d+%/).first().innerText() : '없음(오늘 출근 대상 0명)'}`);
  await shot('board-390');
  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.goto(`${BASE}/admin/records/${target!.id}?m=${YM}`);
    await p.waitForLoadState('networkidle');
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= w, `가로 넘침 없음 @${w}`, `${sw}px`);
  }
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  // 이번에 넣은 기록은 취소해 둔다 — 연습 기록 화면에 검사 흔적이 남지 않고, 그 날짜를 다음 검사에 다시 쓸 수 있다
  const { data: mine } = await db.from('punch_corrections').select('id').eq('employee_id', target!.id).eq('status', 'approved').gte('created_at', STARTED_AT);
  for (const c of mine ?? []) await db.rpc('cancel_correction', { p_id: c.id, p_decided_by: emp!.id, p_reason: 'e2e 검사 정리', p_request_id: 'e2e-proxy' });
  // 넣은 기록 때문에 화면을 열 때 연장 확인 요청이 자동으로 생긴다 — 실제 관리자의 요청함에 남지 않게 거부로 닫는다 (연습 기록, 검사 계정 것만)
  const { data: ot } = await db.from('overtime_requests').select('id').eq('employee_id', target!.id).eq('status', 'pending');
  for (const o of ot ?? []) {
    await db.rpc('decide_overtime', { p_id: o.id, p_decision: 'rejected', p_approved_minutes: null, p_approved_night: null, p_approved_holiday: null, p_decided_by: emp!.id, p_reason: 'e2e 검사 정리', p_request_id: 'e2e-proxy' });
  }
  console.log(`정리: 검사 계정의 연장 확인 요청 ${ot?.length ?? 0}건을 닫음`);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`시험 날짜 ${DAY} · 실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
