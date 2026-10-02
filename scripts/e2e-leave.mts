// 연차 흐름 실제 서버 검사 (②-2 게이트 5). 검사 전용 직원(e2e-audit)으로:
//   연차 입력(관리자) → 신청(직원) → 잔여 부족·겹침 거절 → 요청함에 뜸 → 승인 → 잔여 반영 → 다시 승인하면 "이미 처리됨" → 승인 취소
//   npx tsx scripts/e2e-leave.mts   (앱이 켜져 있어야 한다. BASE·APP_ORIGIN을 같은 주소로)
// 기록은 연습 기록(is_test)으로만 남고, 휴가 신청은 지울 수 없으므로(4-1) 시험 날짜를 먼 미래 하루로 고른다.
// 끝나면 가짜 폰 등록을 해제하고 e2e-audit을 다시 끈다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

// 시험 날짜: 2년 뒤 첫 월요일 근처의 평일 (공휴일 표 밖일 수 있으니 월요일 고정)
const d = new Date();
d.setUTCFullYear(d.getUTCFullYear() + 2);
while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
d.setUTCDate(d.getUTCDate() + Math.floor(Math.random() * 40) * 7); // 실행마다 다른 주
const DAY = d.toISOString().slice(0, 10);
const LABEL = `e2e-${DAY.slice(0, 4)}`;

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`);
  if (!ok) fails++;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(`${BASE}/register?token=${token}`);
  await p.getByRole('button', { name: /이 폰 등록하기/ }).click();
  await p.getByText('폰이 등록되었습니다.').waitFor({ timeout: 20000 });
  const post = (url: string, body?: unknown) =>
    p.evaluate(async ([u, b]) => {
      const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { status: r.status, json: await r.json() };
    }, [url, body] as const);

  // 1. 연차 1일만 입력 (그 해 1월 1일부터)
  let r = await post('/api/admin/leave/grants', { employeeId: emp!.id, periodLabel: LABEL, grantedDays: 1, carriedDays: 0, basis: 'hire_date', effectiveFrom: `${DAY.slice(0, 4)}-01-01` });
  check(r.status === 200, '관리자 연차 입력', String(r.status));
  r = await post('/api/admin/leave/grants', { employeeId: emp!.id, periodLabel: LABEL, grantedDays: 1.3, basis: 'hire_date', effectiveFrom: `${DAY.slice(0, 4)}-01-01` });
  check(r.status === 400 && r.json.error === 'invalid_days', '0.25 단위가 아니면 거절', r.json.error);

  // 2. 반차 신청 → 0.5일
  r = await post('/api/leave', { typeCode: 'half', startDate: DAY, reason: '' });
  check(r.status === 200 && r.json.days === 0.5, '반차 신청 = 0.5일 (서버가 셈)', JSON.stringify(r.json));
  const halfId = r.json.id as string;
  // 3. 같은 날 연차(1일) → 반차와 합쳐 하루 넘음 → 겹침
  r = await post('/api/leave', { typeCode: 'annual', startDate: DAY, endDate: DAY });
  check(r.status === 409 && r.json.error === 'duplicate_request', '같은 날 하루 넘게 신청하면 거절', r.json.error);
  // 4. 다음 날 연차 1일 → 잔여 1 − 대기 0.5 < 1 → 부족
  const next = new Date(`${DAY}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  r = await post('/api/leave', { typeCode: 'annual', startDate: next.toISOString().slice(0, 10), endDate: next.toISOString().slice(0, 10) });
  check(r.status === 409 && r.json.error === 'insufficient_balance', '잔여(대기 제외)보다 많으면 거절', r.json.error);
  // 5. 직원이 days·status를 보내도 무시
  r = await post('/api/leave', { typeCode: 'quarter', startDate: next.toISOString().slice(0, 10), days: 9, status: 'approved' });
  const { data: q } = await db.from('leave_requests').select('days, status, is_test').eq('id', r.json.id).single();
  check(r.status === 200 && Number(q?.days) === 0.25 && q?.status === 'pending' && q?.is_test === true, '본문의 days·status 무시, 연습 기록', JSON.stringify(q));
  r = await post(`/api/leave/${r.json.id}/cancel`);
  check(r.json.result === 'ok', '직원 본인 대기 건 취소', JSON.stringify(r.json));

  // 6. 요청함에 뜨고, 승인 → 잔여 반영
  await p.goto(`${BASE}/admin/inbox#leave`);
  check(await p.locator('#leave').getByText('반차').first().waitFor({ timeout: 15000 }).then(() => true, () => false), '요청함 연차 섹션에 신청이 보임');
  r = await post(`/api/admin/leave/${halfId}/decide`, { decision: 'approved' });
  check(r.json.result === 'ok', '관리자 승인', JSON.stringify(r.json));
  r = await post(`/api/admin/leave/${halfId}/decide`, { decision: 'rejected' });
  check(r.json.result === 'already', '두 번째 결정은 이미 처리됨', JSON.stringify(r.json));
  await p.goto(`${BASE}/admin/leave`);
  check(await p.getByRole('heading', { name: '연차 관리' }).waitFor({ timeout: 15000 }).then(() => true, () => false), '연차 관리 화면 열림');
  // 7. 승인 취소
  r = await post(`/api/admin/leave/${halfId}/decide`, { decision: 'cancelled' });
  check(r.json.result === 'ok', '승인된 휴가 취소', JSON.stringify(r.json));
  // 외근 (②-3 7-11): 장소 필수 · 겹침 거절 · 승인 한 번만 · 요청함에 뜸
  r = await post('/api/work', { kind: 'outside', startDate: DAY, place: '' });
  check(r.status === 400 && r.json.error === 'place_required', '외근: 장소 없으면 거절', r.json.error);
  r = await post('/api/work', { kind: 'outside', startDate: DAY, endDate: DAY, startTime: '13:00', endTime: '17:00', place: 'e2e 고객사' });
  check(r.status === 200, '외근 신청(반나절)', JSON.stringify(r.json));
  const workId = r.json.id as string;
  r = await post('/api/work', { kind: 'business_trip', startDate: DAY, endDate: DAY, place: 'x' });
  check(r.status === 409 && r.json.error === 'duplicate_request', '외근: 같은 날 겹치면 거절', r.json.error);
  r = await post('/api/work', { kind: 'remote', startDate: DAY, endDate: DAY, startTime: '17:00', endTime: '13:00', place: 'x' });
  check(r.status === 400 && r.json.error === 'invalid_time', '외근: 시작이 끝보다 늦으면 거절', r.json.error);
  await p.goto(`${BASE}/admin/inbox#work`);
  check(await p.locator('#work').getByText('e2e 고객사').first().waitFor({ timeout: 15000 }).then(() => true, () => false), '요청함 외근 섹션에 신청이 보임');
  r = await post(`/api/admin/work/${workId}/decide`, { decision: 'approved' });
  check(r.json.result === 'ok', '외근 승인', JSON.stringify(r.json));
  r = await post(`/api/admin/work/${workId}/decide`, { decision: 'approved' });
  check(r.json.result === 'already', '외근 두 번째 결정은 이미 처리됨', JSON.stringify(r.json));
  r = await post(`/api/admin/work/${workId}/decide`, { decision: 'cancelled' });
  check(r.json.result === 'ok', '외근 승인 취소', JSON.stringify(r.json));

  // 입사일 → 계산값 자동 채움 (2026-10-02 의뢰인 결정). 3년 근속이면 16일
  const hired = `${Number(new Date().toISOString().slice(0, 4)) - 3}-01-02`;
  r = await post(`/api/admin/employees/${emp!.id}/joined-on`, { joinedOn: hired });
  check(r.status === 200, '입사일 저장', JSON.stringify(r.json));
  r = await post(`/api/admin/employees/${emp!.id}/joined-on`, { joinedOn: '2999-01-01' });
  check(r.status === 400 && r.json.error === 'invalid_date', '미래 입사일 거절', r.json.error);
  await p.goto(`${BASE}/admin/leave`);
  const btn = p.getByRole('button', { name: /계산값 16일/ }).first();
  check(await btn.waitFor({ timeout: 15000 }).then(() => true, () => false), '계산값 16일 버튼 표시');
  await btn.click();
  check(await p.getByText('입사일 기준 계산값(16일)을 채웠습니다').first().isVisible(), '입력칸에 계산값 채움 (저장은 관리자)');
  await db.from('profiles').update({ joined_on: null }).eq('id', emp!.id);

  // 8. 직원 화면
  await p.goto(`${BASE}/punch/leave`);
  check(await p.getByRole('heading', { name: '휴가·외근' }).waitFor({ timeout: 15000 }).then(() => true, () => false), '직원 연차 화면 열림');
  check(await p.getByRole('link', { name: '휴가·외근' }).isVisible(), '하단 탭에 휴가·외근');
} finally {
  await browser.close();
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
}
console.log(fails ? `${fails}개 실패` : '모두 통과');
process.exitCode = fails ? 1 : 0;
