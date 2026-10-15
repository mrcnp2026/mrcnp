// 최고관리자 직권 수정 검사 (2026-10-15 의뢰인: 등급 두 가지 · 최고관리자는 출퇴근 · 휴가를 직권으로 추가 · 수정 · 삭제).
//   npx tsx scripts/e2e-direct.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 검사 관리자(e2e-audit)를 잠시 최고관리자로 올리고, 검사 직원(e2e-audit2)의 기록을 고친다. 끝나면 등급 · 기록을 되돌린다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id, name, admin_level').eq('employee_no', 'e2e-audit').single();
const { data: other } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit2').single();
const { data: supers } = await db.from('profiles').select('id').eq('admin_level', 'super');
if ((supers ?? []).some((s) => s.id !== emp!.id)) {
  console.log('❌ 이미 다른 최고관리자(super)가 있어 검사 계정을 올릴 수 없습니다(묶음 13 전 DB는 1명 제한)');
  process.exit(1);
}
await db.from('profiles').update({ active: true, role: 'admin', admin_level: 'super', locale: 'ko' }).eq('id', emp!.id);
// 31일 넘게 지난 날의 직권 휴가를 시험하려고 입사일을 앞당긴다(끝나면 되돌린다)
const { data: otherRow } = await db.from('profiles').select('joined_on').eq('id', other!.id).single();
await db.from('profiles').update({ active: true, role: 'employee', admin_level: null, locale: 'ko', joined_on: '2026-07-01' }).eq('id', other!.id);
// 지난 검사가 남긴 직권 정정을 닫는다(같은 시각 기록이 여러 날에 남아 있으면 화면에서 엉뚱한 줄을 고른다)
{
  const { data: oldEv } = await db.from('punch_events').select('id').eq('employee_id', other!.id).eq('note', 'e2e 직권 검사');
  if (oldEv?.length) await db.from('punch_corrections').update({ status: 'cancelled', decided_at: new Date().toISOString() }).in('target_id', oldEv.map((x) => x.id)).eq('status', 'approved');
}
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};

// 출퇴근: 확정 · 마감이 없는 지난 평일 하나에 출근 기록을 넣는다
const kst = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
let D = '';
for (let i = 2; i < 40 && !D; i++) {
  const d = kst(new Date(Date.now() - i * 86400e3));
  const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
  if (wd === 0 || wd === 6) continue;
  const [{ count: c1 }, { count: c2 }, { count: c3 }] = await Promise.all([
    db.from('day_confirms').select('id', { count: 'exact', head: true }).eq('employee_id', other!.id).eq('work_date', d),
    db.from('punch_events').select('id', { count: 'exact', head: true }).eq('employee_id', other!.id).eq('work_date', d),
    db.from('attendance_closes').select('id', { count: 'exact', head: true }).lte('period_start', d).gte('period_end', d),
  ]);
  if (!c1 && !c2 && !c3) D = d;
}
check(!!D, '검사할 지난 평일 찾음', D);
const MM = String(10 + Math.floor(Math.random() * 40));
const T0 = `09:${MM}`; // 검사마다 다른 시각 — 화면에서 이 줄만 고른다
const { data: ev, error: evErr } = await db.from('punch_events').insert({ employee_id: other!.id, kind: 'in', punched_at: `${D}T${T0}:00+09:00`, work_date: D, source: 'web', is_test: true, note: 'e2e 직권 검사' }).select('id').single();
check(!evErr && !!ev, '검사용 출근 기록 넣음', evErr?.message ?? '');

const L1 = '2029-06-04';
const L2 = '2029-06-05';
const LOLD = '2026-08-04'; // 31일보다 지난 날 — 직권은 넣을 수 있어야 한다
const made: string[] = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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

  // ── 등급: 두 가지만 보인다 ──
  await p.goto(`${BASE}/admin/members/${other!.id}`);
  await p.waitForLoadState('networkidle');
  const radios = p.locator('[data-grade-form] input[type=radio]');
  check((await radios.count()) === 2, '권한 등급 고르기에 두 가지(최고관리자 · 일반직원)만', `${await radios.count()}개`);
  const labels = await p.locator('[data-grade-form] label').allInnerTexts();
  check(labels.some((x) => x.includes('최고관리자')) && labels.some((x) => x.includes('일반직원')) && !labels.some((x) => x.includes('총괄관리자') || x.includes('지점관리자')), '총괄 · 지점관리자는 보이지 않음');
  check(labels.some((x) => x.includes('최대 3명')), '최고관리자 줄에 「지금 n명 / 최대 3명」');
  await shot('direct-1-grade');

  // ── 출퇴근 직권 수정: 화면에 「고치기」 → 시각 바꾸기 ──
  await p.goto(`${BASE}/admin/records/${other!.id}?m=${D.slice(0, 7)}`);
  await p.waitForLoadState('networkidle');
  const day = p.locator('li', { has: p.locator('details') }).filter({ hasText: T0 }).first();
  await day.locator('details summary').first().click();
  const fixBtn = day.locator('[data-direct-fix]').first();
  check(await fixBtn.isVisible(), '찍힌 기록 줄에 「고치기」 버튼');
  await fixBtn.click();
  const form = p.locator('form', { has: p.locator('input[type=time]') }).filter({ hasText: '직권 수정' }).first();
  await form.locator('input[type=time]').fill('08:55');
  await form.locator('textarea').fill('직원이 늦게 찍음 — 실제 08:55 도착 확인');
  await shot('direct-2-fix-form');
  await Promise.all([p.waitForResponse((r) => r.url().includes('/fix') && r.request().method() === 'POST', { timeout: 60000 }), form.getByRole('button', { name: '바꾸기', exact: true }).click()]);
  await p.waitForTimeout(1500);
  const { data: c1 } = await db.from('punch_corrections').select('id, correction_type, status, new_punched_at, requested_by').eq('target_id', ev!.id);
  const mod = (c1 ?? []).find((c) => c.correction_type === 'modify' && c.status === 'approved');
  check(!!mod && new Date(mod.new_punched_at).toISOString() === new Date(`${D}T08:55:00+09:00`).toISOString() && mod.requested_by === emp!.id, '시각 바꾸기 → 승인된 수정 정정(08:55, 관리자 이름)', JSON.stringify(c1));
  const { count: evLeft } = await db.from('punch_events').select('id', { count: 'exact', head: true }).eq('id', ev!.id);
  check(evLeft === 1, '원본 기록은 그대로 남음');
  await p.waitForLoadState('networkidle');
  await p.reload();
  await p.waitForLoadState('networkidle');
  const dayAfter = p.locator('li', { has: p.locator('details') }).filter({ hasText: '08:55' }).first();
  check(await dayAfter.isVisible().catch(() => false), '화면에 08:55로 보임', (await p.locator('li', { has: p.locator('details') }).filter({ hasText: T0 }).first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160));
  await shot('direct-2b-after');

  // 지우기 (API) — 앞의 수정은 취소되고 무효 정정 하나만 남는다
  const v = await post(`/api/admin/punches/${ev!.id}/fix`, { action: 'void', reason: '잘못 찍은 기록' });
  check(v.status === 200, '기록 지우기(무효) API', `${v.status} ${JSON.stringify(v.json)}`);
  const { data: c2 } = await db.from('punch_corrections').select('correction_type, status').eq('target_id', ev!.id);
  check((c2 ?? []).filter((c) => c.status === 'approved').length === 1 && (c2 ?? []).some((c) => c.correction_type === 'void' && c.status === 'approved') && (c2 ?? []).some((c) => c.correction_type === 'modify' && c.status === 'cancelled'), '앞의 수정은 취소, 무효 하나만 승인', JSON.stringify(c2));
  const bad = await post(`/api/admin/punches/${ev!.id}/fix`, { action: 'modify', time: '08:50' });
  check(bad.status === 400, '사유 없이는 거절', String(bad.status));
  const fut = await post(`/api/admin/punches/${ev!.id}/fix`, { action: 'modify', time: '23:59', nextDay: true, reason: '미래 시각' });
  check(fut.status === 400, '출근에 「다음 날」은 거절', String(fut.status));

  // ── 휴가 직권: 추가 → 고치기 → 삭제 ──
  const a = await post('/api/admin/leave/direct', { employeeId: other!.id, typeCode: 'sick', startDate: L1, endDate: L1, adminReason: '전화로 병가 알림' });
  check(a.status === 200 && a.json.result === 'ok', '휴가 직권 추가 → 바로 승인', `${a.status} ${JSON.stringify(a.json)}`);
  if (a.json.id) made.push(a.json.id);
  const r1 = (await db.from('leave_requests').select('status, requested_by').eq('id', a.json.id).single()).data;
  check(r1?.status === 'approved' && r1.requested_by === emp!.id, '상태 승인 · 넣은 사람은 최고관리자', JSON.stringify(r1));
  const e = await post('/api/admin/leave/direct', { employeeId: other!.id, replaceId: a.json.id, typeCode: 'sick', startDate: L2, endDate: L2, adminReason: '날짜 잘못 넣음' });
  check(e.status === 200, '휴가 직권 고치기', `${e.status} ${JSON.stringify(e.json)}`);
  if (e.json.id) made.push(e.json.id);
  const [o1, n1] = await Promise.all([db.from('leave_requests').select('status').eq('id', a.json.id).single(), db.from('leave_requests').select('status, start_date').eq('id', e.json.id).single()]);
  check(o1.data?.status === 'cancelled' && n1.data?.status === 'approved' && n1.data.start_date === L2, '기존 휴가는 취소, 고친 휴가는 승인(6/5)', `${o1.data?.status} / ${JSON.stringify(n1.data)}`);
  const old = await post('/api/admin/leave/direct', { employeeId: other!.id, typeCode: 'sick', startDate: LOLD, endDate: LOLD, adminReason: '지난 달 빠뜨린 병가' });
  if (old.json.error === 'no_rule') console.log('⏭ 31일 지난 날 직권 추가 — 건너뜀: 회사 근무 규칙이 그날 없음(근무 규칙 시작일 이전)');
  else check(old.status === 200 || old.json.error === 'day_confirmed' || old.json.error === 'period_locked', '31일 지난 날도 직권으로 넣음(확정 · 마감이면 막힘)', `${old.status} ${JSON.stringify(old.json)}`);
  if (old.json.id) made.push(old.json.id);
  const dup = await post('/api/admin/leave/direct', { employeeId: other!.id, typeCode: 'sick', startDate: L2, endDate: L2, adminReason: '겹침 시험' });
  check(dup.status === 409, '같은 날 겹치는 휴가는 직권이어도 막힘', `${dup.status} ${JSON.stringify(dup.json)}`);

  // 화면: 휴가 발생 화면에 직권 목록 · 고치기 · 삭제 · 넣기 양식
  await p.goto(`${BASE}/admin/leave/emp/${other!.id}`);
  await p.waitForLoadState('networkidle');
  const sec = p.locator('[data-direct-leave]');
  check(await sec.isVisible(), '휴가 발생 화면에 「승인 · 대기 중인 휴가」 직권 영역');
  const row = sec.locator('li', { hasText: '2029.06.05' }).first();
  check(await row.isVisible(), '고친 휴가(2029.06.05)가 목록에 보임');
  await row.locator('[data-direct-leave-edit]').click();
  check(await row.getByRole('button', { name: '고쳐서 승인' }).isVisible(), '「고치기」를 누르면 양식이 펼쳐짐');
  await shot('direct-3-leave');
  await row.getByRole('button', { name: '승인 취소' }).click();
  await Promise.all([p.waitForResponse((r) => r.url().includes('/decide') && r.request().method() === 'POST', { timeout: 60000 }), row.getByRole('button', { name: '확인' }).click()]);
  await p.waitForTimeout(500);
  const n2 = (await db.from('leave_requests').select('status').eq('id', e.json.id).single()).data;
  check(n2?.status === 'cancelled', '화면의 삭제(휴가 취소) → 취소됨', JSON.stringify(n2));

  // ── 최고관리자가 아니면 직권을 못 쓴다 ──
  await db.from('profiles').update({ admin_level: 'general' }).eq('id', emp!.id);
  const no1 = await post(`/api/admin/punches/${ev!.id}/fix`, { action: 'void', reason: '권한 시험' });
  const no2 = await post('/api/admin/leave/direct', { employeeId: other!.id, typeCode: 'sick', startDate: L1, endDate: L1, adminReason: '권한 시험' });
  check(no1.status === 403 && no2.status === 403, '총괄관리자는 직권 수정 · 휴가 직권 모두 403', `${no1.status} / ${no2.status}`);
  await p.goto(`${BASE}/admin/records/${other!.id}?m=${D.slice(0, 7)}`);
  await p.waitForLoadState('networkidle');
  check((await p.locator('[data-direct-fix]').count()) === 0, '총괄관리자 화면에는 「고치기」가 없음');
  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
  // 되돌리기: 휴가는 취소로 닫고, 정정은 취소, 검사 출근 기록은 그대로(원본은 지우지 않는다 — 연습 기록이라 묶음 13에서 함께 지운다)
  await db.from('leave_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('employee_id', other!.id).in('start_date', [L1, L2, LOLD]).in('status', ['approved', 'pending']);
  if (ev) await db.from('punch_corrections').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('target_id', ev.id).eq('status', 'approved');
  await db.from('profiles').update({ admin_level: emp!.admin_level ?? null }).eq('id', emp!.id);
  await db.from('profiles').update({ joined_on: otherRow?.joined_on ?? null }).eq('id', other!.id);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);
