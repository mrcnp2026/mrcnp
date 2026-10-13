// 휴가 원장 화면 검사 (2026-10-13) — 검사 전용 관리자(e2e-audit)로 기준 시작 → 후보 만들기 → 자신에게 직접 지급 → 잔여 확인 → 거두기.
//   npx tsx scripts/e2e-leave-ledger.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 지급 건과 원장은 지울 수 없는 표다 — 검사가 만든 지급 건은 끝에 거둔다(거둔 건과 원장 2줄이 검사 계정에 남는다).
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
const { data: emp } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const NOTE = `e2e-원장 ${randomBytes(2).toString('hex')}`;
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
  const post = (body: unknown) => p.evaluate(async (b) => { const r = await fetch('/api/admin/leave/ledger', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, body);
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  await p.goto(`${BASE}/admin/leave/ledger`);
  await p.waitForLoadState('networkidle');
  check((await p.getByRole('heading', { name: '휴가 원장' }).count()) === 1, '휴가 원장 화면이 열린다');
  const seed = p.getByRole('button', { name: '통상 방식으로 시작' });
  if (await seed.count()) {
    await seed.click();
    await p.getByText('입사일 기준 — 입사한 날을 기준으로').waitFor({ timeout: 15000 });
  }
  check((await p.getByText('1년 이상: 15일, 3년차부터 2년마다 1일 추가 (최대 25일)').count()) === 1, '통상 방식 기준이 보인다');
  check((await p.getByText('임시 입력', { exact: true }).count()) >= 1, '기준에 「임시 입력」 표시');
  await shot('ledger-1-policy');

  await p.getByRole('button', { name: '연차 후보 만들기' }).click();
  await p.getByRole('status').waitFor({ timeout: 30000 });
  const first = await p.getByRole('status').innerText();
  check(/후보 \d+건을 만들었습니다/.test(first), '후보 만들기 결과가 나온다', first);
  const { count: c1 } = await db.from('leave_grant_lots').select('id', { count: 'exact', head: true }).in('state', ['CANDIDATE', 'APPROVED']);
  const again = await post({ action: 'accrue' });
  const { count: c2 } = await db.from('leave_grant_lots').select('id', { count: 'exact', head: true }).in('state', ['CANDIDATE', 'APPROVED']);
  check(again.status === 200 && again.json.accrual?.created === 0 && c1 === c2, '다시 눌러도 같은 연차가 또 생기지 않는다', `${c1} → ${c2}`);

  // 틀린 입력
  check((await post({ action: 'manual', employeeId: emp!.id, kind: 'manual', days: 0.3, usableFrom: '2026-10-13', usableTo: '', note: NOTE })).status === 400, '30분 단위가 아닌 일수는 거부');
  check((await post({ action: 'manual', employeeId: emp!.id, kind: 'manual', days: 1, usableFrom: '2026-10-13', usableTo: '2026-10-01', note: NOTE })).status === 400, '끝이 시작보다 앞이면 거부');
  check((await post({ action: 'decide', decision: 'approve', ids: ['x'] })).status === 400, '틀린 번호는 거부');

  // 입사일 → 후보 → 승인 → 휴가 사용 차감 → 취소 → 거두기 (검사 계정의 연습 신청으로)
  {
    const { data: me0 } = await db.from('profiles').select('joined_on').eq('id', emp!.id).single();
    const hired = new Date(Date.UTC(2025, 0, 1) + Math.floor(Math.random() * 200) * 86400e3).toISOString().slice(0, 10);
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    let reqId: string | null = null;
    try {
      await db.from('profiles').update({ joined_on: hired }).eq('id', emp!.id);
      const made = await post({ action: 'accrue' });
      check(made.status === 200 && made.json.accrual?.created >= 1, '입사일이 있으면 연차 후보가 생긴다', `입사 ${hired} · ${JSON.stringify(made.json.accrual)}`);
      const { data: cands } = await db.from('leave_grant_lots').select('id, lot_kind, quantity_minutes, basis').eq('employee_id', emp!.id).eq('state', 'CANDIDATE');
      const annual = cands?.find((c) => c.lot_kind === 'annual');
      check(!!annual && annual.quantity_minutes === 15 * 480, '근속 1년 연차 15일 후보', JSON.stringify(cands?.map((c) => [c.lot_kind, c.quantity_minutes])));
      await p.reload();
      await p.waitForLoadState('networkidle');
      check((await p.locator('tr', { hasText: emp!.name }).getByText('근속 1년 연차').count()) >= 1, '후보 표에 「근속 1년 연차」');
      await shot('ledger-1b-candidates');
      const ins = await db.from('leave_requests').insert({ employee_id: emp!.id, type_code: 'annual', start_date: today, end_date: today, days: 1, status: 'approved', is_test: true, reason: 'e2e-원장', requested_by: emp!.id }).select('id').single();
      reqId = ins.data?.id ?? null;
      check(!!reqId, '연습 휴가 신청 넣기', ins.error?.message ?? '');
      const ok = await post({ action: 'decide', decision: 'approve', ids: (cands ?? []).map((c) => c.id) });
      check(ok.status === 200 && ok.json.results?.every((r: { result: string }) => r.result === 'approved'), '후보 승인');
      const { data: l1 } = await db.from('leave_ledger').select('event, minutes, lot_id, is_test').eq('request_id', reqId!);
      check(l1?.length === 1 && l1[0].event === 'use' && l1[0].minutes === -480 && l1[0].is_test === true, '승인하면 이미 승인된 휴가가 원장에 사용 1일로 들어간다', JSON.stringify(l1));
      await p.goto(`${BASE}/admin/leave/ledger?emp=${emp!.id}`);
      await p.waitForLoadState('networkidle');
      const bal = p.locator('tr', { hasText: emp!.name }).filter({ hasText: hired });
      check((await bal.getByText('14일', { exact: true }).count()) >= 1, '잔여 표에 받은 15일 − 사용 1일 = 14일', (await bal.first().innerText().catch(() => '')).replace(/\s+/g, ' '));
      await shot('ledger-1c-balance');
      const twice = await post({ action: 'sync', employeeId: emp!.id });
      check(twice.json.sync?.added === 0, '다시 맞춰도 줄이 늘지 않는다');
      await db.from('leave_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', reqId!);
      const back = await post({ action: 'sync', employeeId: emp!.id });
      const { data: l2 } = await db.from('leave_ledger').select('event, minutes').eq('request_id', reqId!).order('id');
      check(back.json.sync?.added === 1 && l2?.length === 2 && l2[1].event === 'cancel' && l2[1].minutes === 480, '취소하면 되돌리는 줄이 들어간다', JSON.stringify(l2));
      const wd = await post({ action: 'decide', decision: 'withdraw', ids: (cands ?? []).map((c) => c.id) });
      check(wd.json.results?.every((r: { result: string }) => r.result === 'withdrawn'), '쓴 것이 전부 취소된 건은 거둘 수 있다', JSON.stringify(wd.json.results));
    } finally {
      await db.from('profiles').update({ joined_on: me0?.joined_on ?? null }).eq('id', emp!.id);
      if (reqId) await db.from('leave_requests').update({ status: 'cancelled' }).eq('id', reqId).eq('status', 'approved');
    }
  }

  // 직접 지급 → 잔여 → 거두기
  await p.goto(`${BASE}/admin/leave/ledger?emp=${emp!.id}`);
  await p.waitForLoadState('networkidle');
  await p.locator('input[name="days"]').fill('1.5');
  await p.locator('input[name="note"]').fill(NOTE);
  await p.getByRole('button', { name: '지급', exact: true }).click();
  await p.getByText(NOTE).waitFor({ timeout: 20000 });
  const { data: lot } = await db.from('leave_grant_lots').select('id, state, quantity_minutes').eq('note', NOTE).single();
  check(lot?.state === 'APPROVED' && lot.quantity_minutes === 720, '직접 지급 건이 승인 상태로 720분', JSON.stringify(lot));
  const { data: led } = await db.from('leave_ledger').select('event, minutes').eq('lot_id', lot!.id);
  check(led?.length === 1 && led[0].event === 'grant' && led[0].minutes === 720, '원장에 지급 줄 1개');
  const row = p.locator('tr', { hasText: NOTE });
  check((await row.getByText('승인', { exact: true }).count()) === 1 && (await row.getByText('1.5일').count()) === 2, '지급 건 줄에 승인 · 1.5일 · 남은 1.5일');
  await shot('ledger-2-emp');
  await row.getByRole('button', { name: '거두기' }).click();
  await p.locator('tr', { hasText: NOTE }).getByText('거둠', { exact: true }).waitFor({ timeout: 20000 });
  const { data: after } = await db.from('leave_ledger').select('event, minutes').eq('lot_id', lot!.id).order('id');
  check(after?.length === 2 && after[1].event === 'adjust' && after[1].minutes === -720, '거두면 조정 줄로 0이 된다');
  const { error: del } = await db.from('leave_ledger').delete().eq('lot_id', lot!.id);
  check(!!del, '원장 줄은 지울 수 없다');
  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
  // 검사가 만든 지급 건이 승인된 채 남았으면 거둔 것으로 맞춘다(원장은 조정 줄로)
  const { data: left } = await db.from('leave_grant_lots').select('id, employee_id, quantity_minutes, granted_on').eq('note', NOTE).eq('state', 'APPROVED');
  for (const l of left ?? []) {
    await db.from('leave_ledger').insert({ employee_id: l.employee_id, type_code: 'annual', lot_id: l.id, event: 'adjust', minutes: -l.quantity_minutes, effective_on: l.granted_on, dedupe_key: `withdraw:${l.id}`, reason: 'withdrawn' });
    await db.from('leave_grant_lots').update({ state: 'WITHDRAWN' }).eq('id', l.id);
  }
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
