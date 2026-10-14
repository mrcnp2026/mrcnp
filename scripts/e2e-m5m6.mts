// M5 · M6 화면 검사 (2026-10-13) — 이상자 관리 · 마감 화면의 이상 기록 칸 · 휴가 종류별 신청 규칙 · 이월 · 퇴사 연차 정산.
//   npx tsx scripts/e2e-m5m6.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 회사의 실제 기준(연차 생성 기준 · 실제 휴가 종류의 규칙)은 바꾸지 않는다. 검사 계정과 검사용 휴가 종류만 쓴다.
// 남는 것(지울 수 없는 표): 검사 계정의 지급 건 1개 · 원장 2줄 · 승인된 정산 1건, 검사용 휴가 종류의 규칙 판 1개, 이상자 기준 판(처음 한 번).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword, unlockConsole } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const TYPE = 'c_28e8998d56'; // 검사용 휴가 종류 (e2e-10시 반차, 꺼 둠)
const NOTE = `e2e-정산 ${randomBytes(2).toString('hex')}`;
const day = (n: number) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name: string) => {
    if (!SHOTS) return;
    await p.waitForLoadState('networkidle');
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  const post = (url: string, body: unknown) => p.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  const open = async (url: string) => {
    await p.goto(`${BASE}${url}`);
    await p.waitForLoadState('networkidle');
    return p.locator('body').innerText();
  };
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  await unlockConsole(p, db as never, emp!.id); // 통합설정 숫자 4자리 (2026-10-14)

  // ── M6 이상자 관리 ──
  const an = await open('/admin/anomalies');
  check(an.includes('이상자 관리') && an.includes('유형별 기준') && an.includes('퇴근 누락') && an.includes('근무지 미확인'), '이상자 관리 화면: 목록과 유형별 기준');
  check((await p.locator('main select').count()) === 10, '유형 10개마다 기준을 고른다');
  await shot('m6-1-anomalies');
  const { data: pol } = await db.from('payroll_policy_versions').select('version, validated_payload').eq('policy_kind', 'attendance.anomaly').eq('status', 'active').is('valid_to', null).maybeSingle();
  if (!pol) {
    const defaults = { missing_out: 'block', orphan_out: 'block', overlap: 'block', missing_in: 'check', duplicate: 'check', late: 'check', early: 'check', no_plan_work: 'check', unverified_place: 'check', leave_day_punch: 'check' };
    const r = await post('/api/admin/anomalies', { policy: defaults, expectedVersion: 0 });
    const { count } = await db.from('payroll_policy_versions').select('id', { count: 'exact', head: true }).eq('policy_kind', 'attendance.anomaly');
    check(r.status === 200 && count === 1, '기준을 저장하면 판이 쌓인다 (기본값 그대로 저장)', `${r.status}`);
  } else console.log(`ℹ️ 이상자 기준이 이미 ${pol.version}판으로 저장돼 있어 다시 저장하지 않는다`);
  check((await post('/api/admin/anomalies', { policy: { late: 'x' }, expectedVersion: 0 })).status === 400, '틀린 기준은 거부');
  const { data: cur } = await db.from('payroll_policy_versions').select('validated_payload').eq('policy_kind', 'attendance.anomaly').eq('status', 'active').is('valid_to', null).single();
  check((await post('/api/admin/anomalies', { policy: cur!.validated_payload, expectedVersion: 999 })).status === 409, '판 번호가 다르면 저장되지 않는다');
  const cl = await open('/admin/closing');
  check(cl.includes('이상 기록'), '마감 관리 표에 「이상 기록」 칸');
  check((await p.locator('a[href="/admin/anomalies"]').count()) >= 1, '왼쪽 메뉴에 이상자 관리');
  await shot('m6-2-closing');

  // ── M5 종류별 신청 규칙 (검사용 종류로) ──
  const tp = await open(`/admin/leave/types/${TYPE}`);
  check(tp.includes('신청 규칙') && tp.includes('사유를 꼭 적어야 함'), '휴가 유형 상세에 「신청 규칙」');
  const { data: before } = await db.from('leave_type_policy_versions').select('version').eq('type_code', TYPE).eq('status', 'active').is('valid_to', null).maybeSingle();
  // 늘 엄한 규칙을 새 판으로 저장하고, 이 단락 끝에서 느슨한 규칙으로 되돌린다 — 같은 검사용 종류를 쓰는 e2e-leave-types가 한도에 걸리지 않게 (2026-10-14)
  {
    const r = await post('/api/admin/leave/ledger', { action: 'typeRule', code: TYPE, expectedVersion: before?.version ?? 0, rule: { maxDaysPerRequest: 0.25, minNoticeDays: 3, reasonRequired: true } });
    check(r.status === 200, '신청 규칙 저장', JSON.stringify(r));
  }
  check((await post('/api/admin/leave/ledger', { action: 'typeRule', code: TYPE, expectedVersion: 999, rule: { maxDaysPerRequest: 1, minNoticeDays: 0, reasonRequired: false } })).status === 409, '판 번호가 다르면 규칙이 저장되지 않는다');
  check((await post('/api/admin/leave/ledger', { action: 'typeRule', code: TYPE, expectedVersion: 0, rule: { maxDaysPerRequest: 0, reasonRequired: false } })).status === 400, '틀린 규칙은 거부');
  await db.from('leave_types').update({ active: true }).eq('code', TYPE);
  try {
    // 규칙: 한 번에 0.25일까지 · 3일 전까지 · 사유 필수. 이 종류는 0.5일짜리라 한도에 먼저 걸린다
    const r1 = await post('/api/leave', { typeCode: TYPE, startDate: day(30), reason: '검사' });
    check(r1.status === 400 && (r1.json.error === 'leave_too_long' || r1.json.error === 'no_workdays'), '한도를 넘는 신청은 거부된다', JSON.stringify(r1.json));
    // 적용 대상(L13) · 허용 요일(L12) — 2026-10-15
    const ver = async () => (await db.from('leave_type_policy_versions').select('version').eq('type_code', TYPE).eq('status', 'active').is('valid_to', null).maybeSingle()).data?.version ?? 0;
    const OTHER = '00000000-0000-4000-8000-000000000001';
    let rr = await post('/api/admin/leave/ledger', { action: 'typeRule', code: TYPE, expectedVersion: await ver(), rule: { maxDaysPerRequest: 30, minNoticeDays: 0, reasonRequired: false, targets: { groupIds: [], employeeIds: [OTHER] } } });
    let mon = new Date(Date.now() + 60 * 86400e3);
    while (mon.getUTCDay() !== 1) mon = new Date(mon.getTime() + 86400e3);
    const r2 = await post('/api/leave', { typeCode: TYPE, startDate: mon.toISOString().slice(0, 10), reason: '검사' });
    check(rr.status === 200 && r2.status === 403 && r2.json.error === 'leave_not_target', '적용 대상이 아닌 직원의 신청은 서버가 막는다', JSON.stringify(r2.json));
    let tue = new Date(Date.now() + 60 * 86400e3);
    while (tue.getUTCDay() !== 2) tue = new Date(tue.getTime() + 86400e3);
    rr = await post('/api/admin/leave/ledger', { action: 'typeRule', code: TYPE, expectedVersion: await ver(), rule: { maxDaysPerRequest: 30, minNoticeDays: 0, reasonRequired: false, weekdays: [1], targets: { groupIds: [], employeeIds: [emp!.id] } } });
    const r3 = await post('/api/leave', { typeCode: TYPE, startDate: tue.toISOString().slice(0, 10), reason: '검사' });
    check(rr.status === 200 && r3.status === 400 && r3.json.error === 'leave_weekday', '월요일만 허용한 종류를 화요일에 신청하면 막는다', JSON.stringify(r3.json));
  } finally {
    await db.from('leave_types').update({ active: false }).eq('code', TYPE);
    const { data: cur } = await db.from('leave_type_policy_versions').select('version').eq('type_code', TYPE).eq('status', 'active').is('valid_to', null).maybeSingle();
    const back = await post('/api/admin/leave/ledger', { action: 'typeRule', code: TYPE, expectedVersion: cur?.version ?? 0, rule: { maxDaysPerRequest: 30, minNoticeDays: 0, reasonRequired: false } });
    check(back.status === 200, '검사가 끝나면 신청 규칙을 느슨하게 되돌린다', JSON.stringify(back));
  }

  // ── M5 이월 · 퇴사 정산 (검사 계정의 직접 지급 건으로) ──
  const made = await post('/api/admin/leave/ledger', { action: 'manual', employeeId: emp!.id, kind: 'manual', days: 2, usableFrom: day(0), usableTo: '', note: NOTE });
  const { data: lot } = await db.from('leave_grant_lots').select('id, state').eq('note', NOTE).single();
  check(made.status === 200 && lot?.state === 'APPROVED', '직접 지급 2일');
  const carry = await post('/api/admin/leave/ledger', { action: 'carry', lotId: lot!.id });
  const { data: polL } = await db.from('leave_policy_versions').select('payload').eq('status', 'active').is('valid_to', null).limit(1).maybeSingle();
  const carryOn = Number((polL?.payload as { carryMaxDays?: number } | null)?.carryMaxDays ?? 0) > 0;
  check(carry.status === 200 && carry.json.carry?.result === (carryOn ? 'not_expired' : 'no_policy'), `이월: ${carryOn ? '아직 안 끝난 건은 못 넘긴다' : '이월 한도가 0이면 넘기지 않는다'}`, JSON.stringify(carry.json));
  const retireOn = day(1 + Math.floor(Math.random() * 300));
  await open(`/admin/leave/ledger?emp=${emp!.id}`);
  await p.locator('input[name="retireOn"]').fill(retireOn);
  await p.getByRole('button', { name: '정산 후보 만들기' }).click();
  const row = p.locator('tr', { hasText: retireOn }).filter({ hasText: '후보' });
  await row.waitFor({ timeout: 20000 });
  const { data: st } = await db.from('leave_settlements').select('id, state, unused_minutes, snapshot').eq('employee_id', emp!.id).eq('retire_on', retireOn).single();
  const mine = (st?.snapshot as { lots: { lotId: string; minutes: number }[] }).lots.find((l) => l.lotId === lot!.id);
  check(st?.state === 'CANDIDATE' && mine?.minutes === 960 && st.unused_minutes >= 960, '정산 후보: 남은 2일이 미사용 연차에 들어간다', `${st?.unused_minutes}분`);
  const { count: n0 } = await db.from('leave_ledger').select('id', { count: 'exact', head: true }).eq('lot_id', lot!.id);
  check(n0 === 1, '후보만으로는 원장이 바뀌지 않는다');
  await shot('m5-1-settle');
  await row.getByRole('button', { name: '승인' }).click();
  await p.getByText('정산을 승인했습니다.').waitFor({ timeout: 20000 });
  const { data: led } = await db.from('leave_ledger').select('event, minutes, effective_on').eq('lot_id', lot!.id).order('id');
  check(led?.length === 2 && led[1].event === 'settle' && led[1].minutes === -960 && led[1].effective_on === retireOn, '승인하면 퇴사일 날짜로 「정산」 줄이 들어가 0이 된다', JSON.stringify(led));
  const again = await post('/api/admin/leave/ledger', { action: 'settle', employeeId: emp!.id, retireOn });
  check(again.status === 409, '같은 퇴사일로 다시 정산할 수 없다', String(again.status));
  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
  await db.from('leave_types').update({ active: false }).eq('code', TYPE);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
