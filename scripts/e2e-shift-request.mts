// 근무일정 생성 요청 · 일정 수정 검사 (2026-10-11 의뢰인: 시프티의 근무일정 요청).
//   npx tsx scripts/e2e-shift-request.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 검사 전용 관리자(e2e-audit)가 자기 요청을 내고 취소해 보고, 다른 검사 계정(e2e-audit2)의 요청을 승인·거절한 뒤 만들어진 일정을 고친다.
// 끝나면 검사 계정의 일정을 모두 취소하고(지우지 않는 표라 줄은 남는다) 남은 요청을 취소하고 계정을 다시 끈다. 출퇴근 기록은 만들지 않는다.
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
const { data: emp } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit').single();
const { data: other } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit2').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', shift_template_id: null }).eq('id', emp!.id);
await db.from('profiles').update({ active: true, role: 'employee', locale: 'ko', shift_template_id: null }).eq('id', other!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const ids = [emp!.id, other!.id];
const tidy = async () => {
  await db.from('shift_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).in('employee_id', ids).eq('status', 'pending');
  await db.from('shifts').update({ active: false }).in('employee_id', ids).eq('active', true);
};
await tidy();

// 다음 주 토요일 · 다다음 주 토요일 (한국 시각 기준)
const kst = new Date(Date.now() + 9 * 3600e3);
const dow = (kst.getUTCDay() + 6) % 7; // 월=0
const day = (offset: number) => new Date(kst.getTime() + (offset - dow) * 86400e3).toISOString().slice(0, 10);
const SAT = day(12);
const SAT2 = day(19);
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name: string) => {
    if (!SHOTS) return;
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  const post = (url: string, body: unknown) => p.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  // ── 요청 탭의 + 버튼 → 근무일정 요청 양식 ──
  await p.goto(`${BASE}/punch/requests`);
  await p.waitForLoadState('networkidle');
  await p.locator('[data-fab]').click();
  await p.getByRole('link', { name: '근무일정 요청' }).click();
  await p.waitForURL(/\/punch\/schedule\/request/);
  await p.getByRole('heading', { name: '근무일정 요청', exact: true }).waitFor({ timeout: 20000 });
  check((await p.locator('header').locator('visible=true').count()) === 0 && (await p.getByLabel('사유').count()) === 1 && (await p.getByLabel('근무일정 유형').count()) === 1, '+ 버튼 → 근무일정 요청 양식 (← 제목 줄 · 날짜 · 시각 · 유형 · 사유)');
  check(await p.getByRole('button', { name: '요청 보내기' }).isDisabled(), '사유 없이는 보낼 수 없음');
  await shot('20-일정요청-양식');

  // ── 거절되는 입력 ──
  let r = await post('/api/schedule-requests', { date: '2026-01-01', startTime: '08:00', endTime: '17:00', kind: 'holiday', reason: '검사' });
  check(r.status === 400 && r.json.error === 'past_date', '지난 날짜는 거절', `${r.status} ${r.json.error}`);
  r = await post('/api/schedule-requests', { date: SAT, startTime: '18:00', endTime: '09:00', kind: 'holiday', reason: '검사' });
  check(r.status === 400 && r.json.error === 'invalid_time', '끝이 시작보다 이르면 거절', `${r.status} ${r.json.error}`);
  r = await post('/api/schedule-requests', { date: SAT, startTime: '08:00', endTime: '17:00', kind: 'holiday', reason: '' });
  check(r.status === 400 && r.json.error === 'reason_required', '사유가 비면 거절', `${r.status} ${r.json.error}`);
  r = await post('/api/schedule-requests', { date: SAT, startTime: '08:00', endTime: '17:00', kind: 'deemed', reason: '검사' });
  check(r.status === 400, '간주 근무는 요청할 수 없음', String(r.status));

  // ── 화면에서 보내기 ──
  await p.locator('input[type=date]').fill(SAT);
  await p.getByLabel('근무일정 유형').selectOption('holiday');
  await p.getByLabel('사유').fill('검사용 특근 요청');
  await p.getByRole('button', { name: '요청 보내기' }).click();
  await p.waitForURL(/\/punch\/requests$/, { timeout: 20000 });
  const { data: mine } = await db.from('shift_requests').select('id, status, kind, is_test, start_time').eq('employee_id', emp!.id).eq('work_date', SAT).gte('created_at', STARTED_AT);
  check(mine?.length === 1 && mine[0].status === 'pending' && mine[0].kind === 'holiday' && mine[0].is_test === true, '요청이 대기로 저장됨 (연습 기록)', JSON.stringify(mine));
  await p.waitForLoadState('networkidle');
  check((await p.getByText(/근무일정 생성 · 휴일 근무\(특근\)/).count()) >= 1 && (await p.getByText(/08:00 - 17:00/).count()) >= 1, '내 요청 목록에 「근무일정 생성 · 휴일 근무(특근)」 한 줄');
  await shot('21-내요청-일정요청');
  r = await post('/api/schedule-requests', { date: SAT, startTime: '08:00', endTime: '17:00', kind: 'holiday', reason: '또' });
  check(r.status === 409 && r.json.error === 'duplicate_request', '같은 날 같은 시각 요청은 한 번만', `${r.status} ${r.json.error}`);
  r = await post(`/api/admin/schedule-requests/${mine![0].id}/decide`, { decision: 'approved' });
  check(r.status === 403 && r.json.error === 'self_decision', '자기 요청은 스스로 승인하지 못함', `${r.status} ${r.json.error}`);

  // ── 취소 ──
  await p.goto(`${BASE}/punch/schedule/request`);
  await p.getByRole('button', { name: '취소', exact: true }).click();
  await p.getByRole('button', { name: '취소', exact: true }).waitFor({ state: 'hidden', timeout: 20000 });
  check((await db.from('shift_requests').select('status').eq('id', mine![0].id).single()).data?.status === 'cancelled', '대기 중인 내 요청을 취소함 (지우지 않음)');

  // ── 다른 직원의 요청: 관리자 요청함에서 승인 · 거절 ──
  const { data: made } = await db.from('shift_requests').insert([
    { employee_id: other!.id, work_date: SAT, start_time: '08:00', end_time: '17:00', kind: 'holiday', reason: '검사용 특근', is_test: true },
    { employee_id: other!.id, work_date: SAT2, start_time: '08:00', end_time: '12:00', kind: 'holiday', reason: '검사용 거절', is_test: true },
  ]).select('id, work_date');
  const okId = made!.find((x) => x.work_date === SAT)!.id;
  const noId = made!.find((x) => x.work_date === SAT2)!.id;
  await p.goto(`${BASE}/admin/inbox`);
  await p.getByRole('heading', { name: /근무일정 생성 요청/ }).waitFor({ timeout: 30000 });
  check((await p.locator('#shift li').count()) === 2, '요청함에 근무일정 생성 요청 2건', String(await p.locator('#shift li').count()));
  await shot('22-요청함-일정요청');
  const card = p.locator('#shift li', { hasText: '검사용 특근' });
  await card.getByRole('button', { name: '승인' }).click();
  await card.getByRole('button', { name: /확인|승인/ }).last().click();
  await p.locator('#shift li', { hasText: '검사용 특근' }).waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  let row = (await db.from('shift_requests').select('status, shift_id, approved_by').eq('id', okId).single()).data;
  const shift = row?.shift_id ? (await db.from('shifts').select('id, employee_id, work_date, start_time, end_time, kind, note, active').eq('id', row.shift_id).single()).data : null;
  check(row?.status === 'approved' && row.approved_by === emp!.id && !!shift && shift.employee_id === other!.id && shift.work_date === SAT && shift.kind === 'holiday' && shift.active === true, '승인하면 그 날짜에 일정이 만들어짐', JSON.stringify(shift));
  r = await post(`/api/admin/schedule-requests/${okId}/decide`, { decision: 'rejected' });
  check(r.json.result === 'already', '두 번째 결정은 이미 처리됨', JSON.stringify(r.json));
  r = await post(`/api/admin/schedule-requests/${noId}/decide`, { decision: 'rejected' });
  row = (await db.from('shift_requests').select('status, shift_id, approved_by').eq('id', noId).single()).data;
  check(r.json.result === 'ok' && row?.status === 'rejected' && row.shift_id === null && ((await db.from('shifts').select('id').eq('employee_id', other!.id).eq('work_date', SAT2).eq('active', true)).data?.length ?? 0) === 0, '거절하면 일정이 생기지 않음');
  // 완료 탭은 검사 계정의 요청을 숨기므로, 내 요청 목록에서 취소된 요청이 남아 있는지를 본다
  await p.goto(`${BASE}/punch/requests`);
  await p.waitForLoadState('networkidle');
  check((await p.locator('main li', { hasText: '근무일정 생성' }).filter({ hasText: '취소' }).count()) >= 1, '취소한 요청은 내 요청 목록에 「취소」로 남음');

  // ── 일정 상세에서 수정 ──
  await p.goto(`${BASE}/admin/schedule/${other!.id}/${SAT}`);
  await p.getByRole('heading', { name: '근무일정', exact: true }).waitFor({ timeout: 20000 });
  check(((await p.locator('main p.text-3xl').textContent()) ?? '').includes('08:00 - 17:00') && (await p.getByText('검사용 특근').count()) >= 1, '승인된 일정의 상세 (요청 사유가 일정노트로)');
  await p.getByRole('link', { name: '수정', exact: true }).click();
  await p.waitForURL(/edit=1/);
  await p.getByRole('heading', { name: '일정 수정' }).waitFor({ timeout: 20000 });
  await shot('23-일정-수정');
  await p.locator('input[type=time]').nth(1).fill('15:00');
  await p.getByLabel('일정노트').fill('검사용 수정');
  await p.getByRole('button', { name: '저장' }).click();
  await p.waitForURL(new RegExp(`/admin/schedule/${other!.id}/${SAT}$`), { timeout: 20000 });
  await p.getByText('08:00 - 15:00').first().waitFor({ timeout: 20000 });
  const after = (await db.from('shifts').select('end_time, note, updated_by').eq('id', shift!.id).single()).data;
  check(after?.end_time === '15:00:00' && after.note === '검사용 수정' && after.updated_by === emp!.id, '일정 수정: 끝 시각 · 일정노트가 바뀜 (같은 줄을 고침)', JSON.stringify(after));
  r = await post(`/api/admin/schedule/${shift!.id}`, { startTime: '18:00', endTime: '09:00', kind: 'holiday', note: '' });
  check(r.status === 400, '수정도 끝이 시작보다 이르면 거절', String(r.status));

  // ── 평소 일정은 「이 날만 다르게」 ──
  const MON = day(7);
  await p.goto(`${BASE}/admin/schedule/${other!.id}/${MON}?edit=1`);
  const hasPlan = await p.getByRole('heading', { name: '일정 수정' }).waitFor({ timeout: 20000 }).then(() => true, () => false);
  if (hasPlan) {
    check((await p.getByText(/이 날짜에만 다른 일정이 들어가고/).count()) === 1, '평소 일정의 [수정]은 「이 날만 다르게」 안내');
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(500); // 화면이 살아난 뒤에 적는다
    await p.locator('input[type=time]').nth(0).fill('07:30');
    await p.getByRole('button', { name: '저장' }).click();
    await p.waitForURL(new RegExp(`/admin/schedule/${other!.id}/${MON}$`), { timeout: 20000 });
    const day1 = (await db.from('shifts').select('start_time, active').eq('employee_id', other!.id).eq('work_date', MON).eq('active', true)).data;
    check(day1?.length === 1 && day1[0].start_time === '07:30:00', '그 날짜에만 날짜별 일정이 새로 들어감', JSON.stringify(day1));
  }

  for (const w of [320, 390]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const url of ['/punch/schedule/request', `/admin/schedule/${other!.id}/${SAT}?edit=1`, '/admin/inbox']) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= w, `가로 넘침 없음 @${w} ${url.split('?')[0].replace(other!.id, '…')}`, `${sw}px`);
    }
  }
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await tidy();
  for (const id of ids) await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`실패 ${fails}건`);
  if (fails) process.exitCode = 1;
}
