// 급여대장 검사 (2026-10-13) — 검사 전용 관리자(e2e-audit, 급여 담당)가 대장을 만들고 계산 → 차단 해결 → 다시 계산 → 조정 → 검토 → 확정까지 간다.
//   npx tsx scripts/e2e-pay-run.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// ★ 회사의 실제 자료를 건드리지 않기 위해 먼 앞날의 달(2090년대)로 한다:
//   · 검사용 세액표를 그 한 달에만 적용되게 「승인」으로 넣고 끝에 거둔다(실제 급여에 쓰일 수 없는 기간이다)
//   · 검사 계정(e2e-audit2)의 계약 · 세무를 넣고 끝에 거둔다. 그 달의 근태 마감을 넣고 끝에 다시 연다
//   · 실제 직원은 대장의 대상에 들어오지만(켜져 있는 직원 전부) 사유를 적어 뺀다 — 실제 직원의 금액은 계산하지 않는다
// 남는 것(지울 수 없는 표): 확정된 검사 대장 1개(제목 e2e-, 목록에 안 보임) · 거둔 세액표 1개 · 다시 연 마감 1줄 · 거둔 계약/세무 판.
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
const practice = process.env.OPERATION_MODE !== 'live';
const { data: emp } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit').single();
const { data: other } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit2').single();
const year = 2090 + Math.floor(Math.random() * 9);
const mon = 1 + Math.floor(Math.random() * 12);
const YM = `${year}-${String(mon).padStart(2, '0')}`;
const FROM = `${YM}-01`;
const TO = new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10);
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
let refId: string | null = null;
let closeId: string | null = null;
const cleanup = async () => {
  await db.from('payroll_contract_versions').update({ status: 'withdrawn' }).eq('employee_id', other!.id).eq('status', 'active');
  await db.from('payroll_employee_tax_versions').update({ status: 'withdrawn' }).eq('employee_id', other!.id).eq('status', 'active');
  await db.from('payroll_employee_items').update({ active: false }).eq('employee_id', other!.id).eq('active', true);
  // 앞선 검사가 남긴 검사용 세액표(2090년대에만 적용)가 승인된 채 남아 있으면 거둔다
  await db.from('payroll_reference_versions').update({ state: 'WITHDRAWN' }).eq('state', 'APPROVED').eq('origin', 'manual').gte('valid_from', '2090-01-01').eq('review_reason', 'e2e');
  if (closeId) await db.from('attendance_closes').update({ state: 'REOPENED', reopened_by: emp!.id, reopened_at: new Date().toISOString(), reopen_reason: 'e2e 검사 끝' }).eq('id', closeId).eq('state', 'CLOSED');
};
await cleanup();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', can_view_payroll: true }).eq('id', emp!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // ── 준비: 계약 · 세무(보험은 전부 가입 안 함 — 요율 자료 없이도 계산되게), 검사용 세액표, 근태 마감 ──
  const c1 = await db.from('payroll_contract_versions').select('version').eq('employee_id', other!.id).order('version', { ascending: false }).limit(1);
  const t1 = await db.from('payroll_employee_tax_versions').select('version').eq('employee_id', other!.id).order('version', { ascending: false }).limit(1);
  const con = await db.from('payroll_contract_versions').insert({ employee_id: other!.id, pay_type: 'MONTHLY', amount: 3000000, time_basis: 'ACTUAL', monthly_hours: 209, valid_from: '2026-10-01', version: ((c1.data?.[0]?.version as number) ?? 0) + 1, created_by: emp!.id });
  const none = { state: 'NO', reportedWage: null, note: 'e2e' };
  const tax = await db.from('payroll_employee_tax_versions').insert({ employee_id: other!.id, withholding_ratio: 100, family_count: 1, child_count: 0, insurance: { pension: none, health: none, employment: none, accident: none }, student_loan: { state: 'NO', monthlyAmount: null }, valid_from: '2026-10-01', version: ((t1.data?.[0]?.version as number) ?? 0) + 1, created_by: emp!.id });
  if (con.error || tax.error) throw new Error(`setup: ${con.error?.message ?? tax.error?.message}`);

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

  const list = await open('/admin/payroll/runs');
  check(list.includes('급여대장') && list.includes('대장 만들기'), '급여대장 목록이 열린다');
  check((await p.locator('a[href="/admin/payroll/runs"]').count()) >= 1, '왼쪽 메뉴에 급여대장');

  // ── 만들기 ──
  const made = await post('/api/admin/payroll/runs', { action: 'create', month: YM });
  const runId = made.json.id as string;
  check(made.status === 200 && !!runId, `대장 만들기 (${YM})`, JSON.stringify(made.json));
  check((await post('/api/admin/payroll/runs', { action: 'create', month: YM })).status === 409, '같은 달 대장을 두 번 만들 수 없다');
  const api = `/api/admin/payroll/runs/${runId}`;
  const run = async () => (await db.from('payroll_runs').select('status, version, current_generation_id, totals').eq('id', runId).single()).data!;
  await db.from('payroll_runs').update({ title: 'e2e-검사 대장', version: (await run()).version + 1 }).eq('id', runId); // 목록에 보이지 않게
  const { data: mem } = await db.from('payroll_run_members').select('employee_id').eq('run_id', runId);
  check(!!mem?.some((m) => m.employee_id === other!.id), '계약이 있는 검사 계정이 대상에 들어 있다', `대상 ${mem?.length}명`);

  // ── 1차 계산: 근태 마감 · 세액표가 없다 → 차단 ──
  let r = await run();
  const calc1 = await post(api, { action: 'calculate', expectedVersion: r.version });
  check(calc1.status === 200 && calc1.json.calculated?.ok === 0 && calc1.json.calculated?.blocked === mem!.length, '1차 계산: 전원 차단 (0원으로 채우지 않는다)', JSON.stringify(calc1.json));
  r = await run();
  const { data: s1 } = await db.from('payroll_statements').select('state, blockers, pay_total, net_total').eq('generation_id', r.current_generation_id).eq('employee_id', other!.id).single();
  const codes1 = ((s1?.blockers ?? []) as { code: string; detail?: string }[]).map((b) => `${b.code}:${b.detail ?? ''}`);
  check(s1?.state === 'BLOCKED' && s1.pay_total === null && s1.net_total === null && codes1.includes('no_attendance:') && codes1.includes('reference_missing:income-tax'), '차단 사유: 근태 마감 없음 · 세액표 없음, 금액은 비어 있다', codes1.join(', '));
  let page = await open(`/admin/payroll/runs/${runId}`);
  check(page.includes('이 달의 근태를 마감하지 않았습니다.') && page.includes('승인된 기준 자료가 없습니다'), '화면에 차단 사유가 글로 보인다');
  await shot('payrun-1-blocked');
  check((await post(api, { action: 'review', expectedVersion: r.version })).json.error === 'payroll_has_blocked', '차단이 있으면 검토할 수 없다');
  check((await post(api, { action: 'publish' })).json.error === 'payroll_not_finalized', '확정 전에는 공개할 수 없다');
  check((await post(api, { action: 'finalize', expectedVersion: r.version })).json.error === 'payroll_wrong_status', '검토 없이 확정할 수 없다');
  check((await post(api, { action: 'calculate', expectedVersion: r.version + 5 })).status === 409, '판 번호가 다르면 계산되지 않는다');

  // ── 차단 해결: 실제 직원은 사유를 적어 빼고, 검사 계정은 마감 + 검사용 세액표 ──
  check((await post(api, { action: 'exclude', employeeId: other!.id, reason: '' })).status === 400, '사유 없이 대상에서 뺄 수 없다');
  for (const m of mem!.filter((x) => x.employee_id !== other!.id)) await post(api, { action: 'exclude', employeeId: m.employee_id, reason: 'e2e 검사 — 검사 계정만 계산' });
  const close = await db.from('attendance_closes').insert({ employee_id: other!.id, period_from: FROM, period_to: TO, is_test: practice, input_hash: 'e2e', closed_by: emp!.id }).select('id').single();
  closeId = (close.data?.id as string) ?? null;
  const payload = { wageMin: 770000, wageMaxExclusive: 10000000, families: 11, bandCount: 1, e2e: YM };
  const hash = sha(JSON.stringify(payload));
  const ref = await db.from('payroll_reference_versions').insert({ reference_kind: 'income-tax.table', origin: 'manual', valid_from: FROM, valid_to: TO, normalized_payload: payload, source_unit: '원', payload_hash: hash, state: 'APPROVED', reviewed_payload_hash: hash, review_reason: 'e2e', approved_by: emp!.id, approved_at: new Date().toISOString(), created_by: emp!.id }).select('id').single();
  refId = (ref.data?.id as string) ?? null;
  if (!closeId || !refId) throw new Error(`setup2: ${close.error?.message ?? ref.error?.message}`);
  const taxes = [84850, 67350, 32490, 26690, 22690, 18690, 14690, 11430, 8050, 4670, 1290]; // 검사용 값 (실제 세액표가 아니다)
  await db.from('payroll_tax_rows').insert(taxes.map((t, i) => ({ reference_version_id: refId, wage_from: 3000000, wage_to: 3020000, family_count: i + 1, base_tax: t })));

  page = await open(`/admin/payroll/runs/${runId}`);
  check(page.includes('다시 계산해야 검토 · 확정할 수 있습니다.'), '입력이 바뀌면 「오래됨」으로 알려 준다');
  await p.getByRole('button', { name: '다시 계산' }).click();
  await p.getByText('계산했습니다. 계산됨 1명, 차단 0명.').waitFor({ timeout: 60000 });
  r = await run();
  const { data: s2 } = await db.from('payroll_statements').select('id, state, pay_total, deduction_total, net_total, employer_total, snapshot, reference_bundle').eq('generation_id', r.current_generation_id).eq('employee_id', other!.id).single();
  check(s2?.state === 'OK' && Number(s2.pay_total) === 3000000 && Number(s2.deduction_total) === 93330 && Number(s2.net_total) === 2906670, '2차 계산: 기본급 3,000,000 − 소득세 84,850 − 지방소득세 8,480 = 2,906,670', JSON.stringify([s2?.pay_total, s2?.deduction_total, s2?.net_total]));
  const { data: lines } = await db.from('payroll_statement_items').select('item_code, kind, amount, source').eq('statement_id', s2!.id).order('item_code');
  check(JSON.stringify(lines?.map((l) => [l.item_code, Number(l.amount)])) === JSON.stringify([['BASE', 3000000], ['INCOME_TAX', 84850], ['LOCAL_TAX', 8480]]), '항목 줄: 기본급 · 소득세 · 지방소득세', JSON.stringify(lines));
  check((s2!.reference_bundle as Record<string, { id: string }>)['income-tax.table']?.id === refId, '명세서가 쓴 기준 자료의 판을 가리킨다');
  const { count: gens } = await db.from('payroll_calculation_generations').select('id', { count: 'exact', head: true }).eq('run_id', runId);
  check(gens === 2, '다시 계산하면 계산 세대가 쌓인다 (앞의 것은 남는다)', String(gens));
  page = await open(`/admin/payroll/runs/${runId}/${other!.id}`);
  check(page.includes('2,906,670원') && page.includes('기본급') && page.includes('소득세') && page.includes('근태 근거'), '직원 화면: 항목 · 금액 · 근태 근거');
  await shot('payrun-2-statement');

  // ── 조정 ──
  check((await post(api, { action: 'override.add', employeeId: other!.id, itemCode: 'BASE', kind: 'PAYMENT', amount: -1, reason: '음수' })).json.error === 'payroll_negative_pay', '지급 항목에 음수 조정은 거부');
  check((await post(api, { action: 'override.add', employeeId: other!.id, itemCode: 'BONUS', kind: 'PAYMENT', amount: 10000, reason: '' })).json.error === 'payroll_reason_required', '사유 없는 조정은 거부');
  check((await post(api, { action: 'override.add', employeeId: other!.id, itemCode: 'BONUS', kind: 'PAYMENT', amount: 10000, reason: 'e2e 특별 지급' })).status === 200, '조정 넣기 (직접 넣는 지급 10,000)');
  check((await post(api, { action: 'review', expectedVersion: r.version })).json.error === 'payroll_stale', '조정을 넣으면 다시 계산하기 전에는 검토할 수 없다');
  check((await post(api, { action: 'calculate', expectedVersion: r.version })).json.calculated?.ok === 1, '3차 계산');
  r = await run();
  const { data: s3 } = await db.from('payroll_statements').select('pay_total, net_total').eq('generation_id', r.current_generation_id).eq('employee_id', other!.id).single();
  check(Number(s3?.pay_total) === 3010000 && Number(s3?.net_total) === 3010000 - 93330, '조정이 반영된다: 지급 3,010,000 (과세 3,010,000도 같은 구간이라 세액 그대로)', JSON.stringify(s3));

  // ── 검토 → 확정 ──
  page = await open(`/admin/payroll/runs/${runId}`);
  await p.getByRole('button', { name: '검토 완료' }).click();
  await p.getByText('검토됨', { exact: true }).first().waitFor({ timeout: 30000 });
  check((await run()).status === 'REVIEWED', '검토됨');
  await p.getByRole('button', { name: '확정', exact: true }).click();
  await p.getByText('확정하면 이 대장은 바꿀 수 없습니다.').waitFor();
  await p.getByRole('button', { name: '확정', exact: true }).last().click();
  await p.getByText('확정한 대장입니다.').waitFor({ timeout: 30000 });
  r = await run();
  check(r.status === 'FINALIZED', '확정');
  await shot('payrun-3-final');
  check((await post(api, { action: 'calculate', expectedVersion: r.version })).json.error === 'payroll_finalized', '확정 뒤에는 다시 계산할 수 없다');
  check((await post(api, { action: 'override.add', employeeId: other!.id, itemCode: 'BONUS', kind: 'PAYMENT', amount: 1, reason: '늦은 조정' })).json.error === 'payroll_finalized', '확정 뒤에는 조정할 수 없다');
  check((await post(api, { action: 'include', employeeId: mem!.find((x) => x.employee_id !== other!.id)?.employee_id ?? other!.id })).json.error === 'payroll_finalized', '확정 뒤에는 대상을 바꿀 수 없다');
  const direct = await db.from('payroll_runs').update({ status: 'DRAFT', version: r.version + 1 }).eq('id', runId);
  check(!!direct.error, 'DB에서 직접 고치려 해도 막힌다', direct.error?.code ?? '');
  check(!(await open('/admin/payroll/runs')).includes(YM), '검사 대장은 목록에 보이지 않는다');

  // ── 공개 · 내 명세서 (검사 계정 e2e-audit2가 직원으로 들어가 본다) ──
  const { data: fin } = await db.from('payroll_statements').select('id').eq('generation_id', r.current_generation_id).eq('employee_id', other!.id).single();
  const slipId = fin!.id as string;
  await db.from('profiles').update({ active: true, role: 'employee', locale: 'ko' }).eq('id', other!.id);
  const token2 = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: other!.id, token_hash: createHash('sha256').update(token2).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const q = await ctx2.newPage();
  q.on('pageerror', (e) => errors.push(e.message));
  await q.goto(`${BASE}/register?token=${token2}`);
  await createPassword(q);
  const see = async (url: string) => {
    await q.goto(`${BASE}${url}`);
    await q.waitForLoadState('networkidle');
    return q.locator('body').innerText();
  };
  let mine = await see('/punch/payslips');
  check(mine.includes('내 명세서') && mine.includes('아직 공개된 명세서가 없습니다.'), '직원: 공개 전에는 내 명세서가 비어 있다');
  check(!(await see(`/punch/payslips/${slipId}`)).includes('2,916,670'), '직원: 공개 전에는 주소를 직접 쳐도 금액이 보이지 않는다');
  page = await open(`/admin/payroll/runs/${runId}`);
  check(page.includes('공개 중 0명 · 공개 안 함 1명'), '관리자: 확정한 대장에 공개 상태가 보인다');
  await p.getByRole('button', { name: '공개하지 않은 1명에게 공개' }).click();
  await p.getByText('1명에게 공개했습니다.').waitFor({ timeout: 30000 });
  await shot('payrun-4-published');
  mine = await see('/punch/payslips');
  check(mine.includes(`${YM} 급여`) && mine.includes('2,916,670원'), '직원: 공개하면 목록에 그 달과 실지급액이 보인다');
  const slip = await see(`/punch/payslips/${slipId}`);
  check(slip.includes('기본급') && slip.includes('3,000,000원') && slip.includes('소득세') && slip.includes('84,850원') && slip.includes('2,916,670원'), '직원: 명세서에 항목과 금액');
  check(!slip.includes('사업주') && !slip.includes('e2e 특별 지급'), '직원: 사업주 부담 · 조정 사유는 보이지 않는다');
  if (SHOTS) await q.screenshot({ path: path.join(SHOTS, 'payrun-5-myslip.png'), fullPage: true });
  check((await q.locator('a[href="/punch/payslips"]').count()) >= 1, '직원 화면 위쪽 탭에 명세서');
  // 다른 사람의 명세서: 관리자 계정(e2e-audit)이 직원 화면 주소로 열어도 보이지 않는다
  check(!(await open(`/punch/payslips/${slipId}`)).includes('2,916,670'), '다른 사람의 명세서는 주소를 알아도 열리지 않는다');
  const denyApi = await q.evaluate(async (u) => (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'publish' }) })).status, api);
  check(denyApi === 403, '직원은 공개 처리를 할 수 없다', String(denyApi));
  check((await post(api, { action: 'unpublish', employeeId: other!.id, reason: '' })).json.error === 'payroll_reason_required', '사유 없이 공개를 회수할 수 없다');
  check((await post(api, { action: 'unpublish', employeeId: other!.id, reason: 'e2e 검사 회수' })).status === 200, '공개 회수');
  check((await see('/punch/payslips')).includes('아직 공개된 명세서가 없습니다.') && !(await see(`/punch/payslips/${slipId}`)).includes('2,916,670'), '직원: 회수하면 다시 보이지 않는다');
  const { data: evs } = await db.from('payroll_publication_events').select('id, kind, reason').eq('statement_id', slipId).order('id');
  check(JSON.stringify(evs?.map((e) => e.kind)) === JSON.stringify(['PUBLISHED', 'UNPUBLISHED']) && evs![1].reason === 'e2e 검사 회수', '공개 · 회수가 기록으로 쌓인다');
  check(!!(await db.from('payroll_publication_events').delete().eq('id', evs![0].id)).error, '공개 기록은 지울 수 없다');

  // ── 정정 판: 확정본은 그대로 두고 2판을 만들어 확정 · 공개한다 ──
  check((await post(api, { action: 'publish' })).json.publish?.published === 1, '원본을 다시 공개 (정정 전 상태)');
  check((await post(api, { action: 'correct', reason: '' })).json.error === 'payroll_reason_required', '사유 없이 정정을 시작할 수 없다');
  page = await open(`/admin/payroll/runs/${runId}`);
  await p.getByRole('button', { name: '정정 시작' }).click();
  await p.locator('input[name="reason"]').last().fill('e2e 공제 누락');
  await p.getByRole('button', { name: '정정 판 만들기' }).click();
  await p.waitForURL((u) => /\/admin\/payroll\/runs\/[0-9a-f-]{36}$/.test(u.pathname) && !u.pathname.endsWith(runId), { timeout: 30000 });
  const run2Id = new URL(p.url()).pathname.split('/').pop()!;
  const api2 = `/api/admin/payroll/runs/${run2Id}`;
  const run2 = async () => (await db.from('payroll_runs').select('status, version, revision, supersedes_id, correction_reason, current_generation_id').eq('id', run2Id).single()).data!;
  let r2 = await run2();
  check(r2.revision === 2 && r2.supersedes_id === runId && r2.correction_reason === 'e2e 공제 누락' && r2.status === 'DRAFT', '정정 2판이 초안으로 생긴다 (원본을 가리키고 사유가 남는다)');
  check((await run()).status === 'FINALIZED', '원본은 확정 상태 그대로다');
  const { data: mem2 } = await db.from('payroll_run_members').select('employee_id, inclusion_state').eq('run_id', run2Id);
  const { data: ov2 } = await db.from('payroll_statement_overrides').select('item_code, proposed_amount').eq('run_id', run2Id).eq('active', true);
  check(mem2?.length === mem!.length && mem2.filter((m) => m.inclusion_state === 'INCLUDED').length === 1 && ov2?.length === 1 && ov2[0].item_code === 'BONUS', '대상자(뺀 사람 포함)와 금액 조정이 그대로 옮겨진다');
  check((await post(api, { action: 'correct', reason: '또 정정' })).json.error === 'payroll_correction_exists', '정정이 진행 중이면 또 만들 수 없다');
  check((await post(api2, { action: 'correct', reason: '초안에서 정정' })).json.error === 'payroll_not_finalized', '확정 전인 판에서는 정정을 시작할 수 없다');
  page = await open(`/admin/payroll/runs/${runId}`);
  check(page.includes('정정 2판을 만드는 중입니다'), '원본 화면에 정정이 진행 중이라고 보인다');
  check((await see('/punch/payslips')).includes('2,916,670원'), '직원: 정정본이 공개되기 전에는 원본이 그대로 보인다');
  // 고칠 것: 공제 5,000원이 빠졌다 → 조정으로 넣고 계산 · 검토 · 확정
  check((await post(api2, { action: 'override.add', employeeId: other!.id, itemCode: 'ETC_CUT', kind: 'DEDUCTION', amount: 5000, reason: 'e2e 누락된 공제' })).status === 200, '정정 판에 공제 조정을 넣는다');
  check((await post(api2, { action: 'calculate', expectedVersion: r2.version })).json.calculated?.ok === 1, '정정 판 계산');
  r2 = await run2();
  check((await post(api2, { action: 'review', expectedVersion: r2.version })).status === 200, '정정 판 검토');
  r2 = await run2();
  check((await post(api2, { action: 'finalize', expectedVersion: r2.version })).status === 200 && (await run2()).status === 'FINALIZED', '정정 판 확정');
  r2 = await run2();
  const { data: sNew } = await db.from('payroll_statements').select('id, net_total').eq('generation_id', r2.current_generation_id).eq('employee_id', other!.id).single();
  check(Number(sNew?.net_total) === 2911670, '정정 판의 실지급 2,911,670 (원본 2,916,670 − 공제 5,000)', String(sNew?.net_total));
  const { data: sOld } = await db.from('payroll_statements').select('net_total').eq('id', slipId).single();
  check(Number(sOld?.net_total) === 2916670, '원본 명세서의 금액은 바뀌지 않았다');
  check((await see('/punch/payslips')).includes('2,916,670원'), '직원: 정정본을 확정만 하고 공개하지 않으면 아직 원본이 보인다 (자동으로 공개되지 않는다)');
  check((await post(api, { action: 'unpublish', employeeId: other!.id, reason: 'e2e 원본 회수' })).status === 200 && (await post(api, { action: 'publish' })).json.error === 'payroll_superseded', '정정본이 확정되면 원본은 새로 공개할 수 없다');
  // 원본을 다시 공개 상태로 만들 수 없으므로, 「원본이 공개 중일 때 정정본을 공개하면 바뀐다」는 것은 기록을 직접 넣어 만든다
  await db.from('payroll_publication_events').insert({ statement_id: slipId, run_id: runId, employee_id: other!.id, kind: 'PUBLISHED', actor_id: emp!.id });
  page = await open(`/admin/payroll/runs/${run2Id}`);
  check(page.includes('정정 사유: e2e 공제 누락') && page.includes('정정 2판'), '정정 판 화면에 사유와 판 번호');
  await p.getByRole('button', { name: '공개하지 않은 1명에게 공개' }).click();
  await p.getByText('1명에게 공개했습니다.').waitFor({ timeout: 30000 });
  await shot('payrun-6-correction');
  const { data: evOld } = await db.from('payroll_publication_events').select('kind, superseding_statement_id').eq('statement_id', slipId).order('id', { ascending: false }).limit(1);
  check(evOld?.[0]?.kind === 'SUPERSEDED' && evOld[0].superseding_statement_id === sNew!.id, '정정본을 공개하면 원본 명세서는 「정정본으로 바뀜」으로 기록된다');
  mine = await see('/punch/payslips');
  check(mine.includes('2,911,670원') && mine.includes('정정 2판') && !mine.includes('2,916,670원'), '직원: 목록에는 정정된 명세서만 보인다');
  const fixed = await see(`/punch/payslips/${sNew!.id}`);
  check(fixed.includes('정정된 명세서입니다. 정정 사유: e2e 공제 누락') && fixed.includes('2,911,670원') && fixed.includes('이전 명세서 보기'), '직원: 정정 사유와 이전 명세서로 가는 길이 보인다');
  const old = await see(`/punch/payslips/${slipId}`);
  check(old.includes('정정되기 전의 명세서입니다.') && old.includes('2,916,670원'), '직원: 이전 명세서는 「정정 전」이라고 표시된 채 남아 있다');
  if (SHOTS) await q.screenshot({ path: path.join(SHOTS, 'payrun-7-myslip-corrected.png'), fullPage: true });
  check((await open(`/admin/payroll/runs/${runId}`)).includes('이 대장은 정정 2판으로 바뀌었습니다.'), '원본 화면에 정정됐다고 보인다');
  await ctx2.close();

  // ── 기록 · 권한 ──
  const { data: audit } = await db.from('payroll_audit_events').select('action, detail').eq('run_id', runId);
  const acts = new Set((audit ?? []).map((a) => a.action));
  check(['run.create', 'run.calculate', 'run.review', 'run.finalize', 'member.exclude', 'override.add', 'run.publish', 'statement.unpublish'].every((a) => acts.has(a)) && !JSON.stringify(audit).includes('3010000') && !JSON.stringify(audit).includes('2906670'), '급여 전용 기록에 누가 무엇을 했는지 남고, 금액은 적히지 않는다');
  await db.from('profiles').update({ can_view_payroll: false }).eq('id', emp!.id);
  check((await post('/api/admin/payroll/runs', { action: 'create', month: '2089-01' })).status === 403, '급여 담당이 아닌 관리자는 대장을 만들 수 없다');
  const denied = await open(`/admin/payroll/runs/${runId}/${other!.id}`);
  check(denied.includes('급여 담당 관리자만 볼 수 있습니다.') && !denied.includes('3,010,000'), '급여 담당이 아닌 관리자에게는 명세가 보이지 않는다');
  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
  await cleanup();
  await db.from('profiles').update({ can_view_payroll: false }).eq('id', emp!.id);
  await db.from('profiles').update({ active: false, role: 'employee' }).eq('id', other!.id);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
