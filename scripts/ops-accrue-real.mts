// 운영 작업 (2026-10-14 의뢰인 지시: 「입사일을 2021년 1월 4일로 일단 진행해봐」) — 실제 직원의 연차 발생 후보를 만들고 승인한다.
//   npx tsx scripts/ops-accrue-real.mts   (앱이 localhost:4123에 켜져 있어야 한다)
// 휴가 원장 화면의 「연차 후보 만들기 → 골라서 승인」과 같은 API를 검사 전용 관리자(e2e-audit) 로그인으로 부른다.
// 실제 직원(e2e- 아닌 켜진 직원)의 후보만 승인한다. 검사 계정 후보가 생기면 반려한다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: adm } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
const { data: real } = await db.from('profiles').select('id, name, joined_on').eq('active', true).or('employee_no.is.null,employee_no.not.like.e2e-%');
const realIds = new Set((real ?? []).map((x) => x.id as string));
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', adm!.id);
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: adm!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await (await browser.newContext()).newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  const post = (body: unknown) => p.evaluate(async (b) => { const r = await fetch('/api/admin/leave/ledger', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, body);
  const made = await post({ action: 'accrue' });
  console.log('후보 만들기:', JSON.stringify(made.json));
  const { data: cands } = await db.from('leave_grant_lots').select('id, employee_id, lot_kind, accrual_from, accrual_to, usable_from, usable_to, quantity_minutes, state').eq('state', 'CANDIDATE');
  const mine = (cands ?? []).filter((c) => realIds.has(c.employee_id as string));
  const others = (cands ?? []).filter((c) => !realIds.has(c.employee_id as string));
  const name = new Map((real ?? []).map((x) => [x.id, x.name]));
  for (const c of mine) console.log(`  ${name.get(c.employee_id)} · ${c.lot_kind} · 발생 ${c.accrual_from}~${c.accrual_to} · 사용 ${c.usable_from}~${c.usable_to} · ${Number(c.quantity_minutes) / 480}일`);
  if (mine.length) console.log('승인:', JSON.stringify((await post({ action: 'decide', ids: mine.map((c) => c.id), decision: 'approve' })).json));
  if (others.length) console.log('검사 계정 후보 반려:', JSON.stringify((await post({ action: 'decide', ids: others.map((c) => c.id), decision: 'reject' })).json));
} finally {
  await browser.close();
  await db.from('profiles').update({ active: false, role: 'employee' }).eq('id', adm!.id);
}
