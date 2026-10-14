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
import ExcelJS from 'exceljs';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const practice = process.env.OPERATION_MODE !== 'live';
const { data: emp } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit').single();
const { data: other } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit2').single();
// 먼 미래의 빈 달 — 대장 · 마감 기록은 지울 수 없어서 예전 검사가 쓴 달은 피한다
let year = 0, mon = 0;
for (let i = 0; i < 30; i++) {
  year = 2090 + Math.floor(Math.random() * 11); // 인건비 화면이 2100년까지만 고른다
  mon = 1 + Math.floor(Math.random() * 12);
  const f = `${year}-${String(mon).padStart(2, '0')}-01`;
  const [{ count: runs }, { count: closes }] = await Promise.all([
    db.from('payroll_runs').select('id', { count: 'exact', head: true }).eq('period_from', f),
    db.from('attendance_closes').select('id', { count: 'exact', head: true }).eq('employee_id', other!.id).eq('period_from', f),
  ]);
  if (!runs && !closes) break;
}
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
  // 검사 계정에게 공개 중인 명세서(앞선 검사가 남긴 것 포함)는 회수해 둔다 — 다음 검사의 「내 명세서」가 빈 상태에서 시작하게
  const { data: evs } = await db.from('payroll_publication_events').select('id, statement_id, run_id, kind').eq('employee_id', other!.id).order('id');
  const latest = new Map<string, { run_id: string; kind: string }>();
  for (const e of evs ?? []) latest.set(e.statement_id as string, { run_id: e.run_id as string, kind: e.kind as string });
  for (const [statementId, e] of latest) if (e.kind === 'PUBLISHED') await db.from('payroll_publication_events').insert({ statement_id: statementId, run_id: e.run_id, employee_id: other!.id, kind: 'UNPUBLISHED', reason: 'e2e 정리', actor_id: emp!.id });
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
  { const again = await post('/api/admin/payroll/runs', { action: 'create', month: YM }); check(again.status === 200 && again.json.id === runId && again.json.existed === true, '같은 달 대장을 또 만들면 새로 만들지 않고 있던 대장을 연다', JSON.stringify(again.json)); }
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
  // 상여 검사용: 정규 급여 + 상여를 합친 금액이 드는 구간 (검사용 값)
  await db.from('payroll_tax_rows').insert(taxes.map((t, i) => ({ reference_version_id: refId, wage_from: 3500000, wage_to: 3520000, family_count: i + 1, base_tax: t + 45150 })));

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
  check(mine.includes('내 급여 조회') && mine.includes('아직 공개된 명세서가 없습니다.'), '직원: 공개 전에는 내 명세서가 비어 있다');
  check(!(await see(`/punch/payslips/${slipId}`)).includes('2,916,670'), '직원: 공개 전에는 주소를 직접 쳐도 금액이 보이지 않는다');
  page = await open(`/admin/payroll/runs/${runId}`);
  check(page.includes('공개 중 0명 · 공개 안 함 1명'), '관리자: 확정한 대장에 공개 상태가 보인다');
  await p.getByRole('button', { name: '공개하지 않은 1명에게 공개' }).click();
  await p.getByText('1명에게 공개했습니다.').waitFor({ timeout: 30000 });
  await shot('payrun-4-published');
  mine = await see('/punch/payslips');
  check(mine.includes(YM) && mine.includes('2,916,670'), '직원: 공개하면 목록에 그 달과 실지급액이 보인다'); // 2026-10-15 다우오피스 모양: 금액 칸에 「원」 없이 숫자만
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
  check((await see('/punch/payslips')).includes('2,916,670'), '직원: 정정본이 공개되기 전에는 원본이 그대로 보인다');
  // 고칠 것: 공제 5,000원이 빠졌다 → 조정으로 넣고 계산 · 검토 · 확정
  check((await post(api2, { action: 'override.add', employeeId: other!.id, itemCode: 'ETC_CUT', kind: 'DEDUCTION', amount: 5000, reason: 'e2e 누락된 공제' })).status === 200, '정정 판에 공제 조정을 넣는다');
  check((await post(api2, { action: 'calculate', expectedVersion: r2.version })).json.calculated?.ok === 1, '정정 판 계산');
  r2 = await run2();
  {
    const dpage = await open(`/admin/payroll/runs/${run2Id}`);
    check(dpage.includes('정정 차액 — 1판 → 2판') && (await p.locator('table[data-diff] tbody tr').count()) === 1 && dpage.includes('(-5,000)'), '정정 판 화면: 직원별 정정 차액(공제 +5,000 · 실지급 -5,000)');
  }
  // ── 사회보험: 취득/상실 확인 + 고지 보험료 정산 (정정 판이 계산됐고 아직 확정 전인 지금) ──
  {
    const INS = '/api/admin/payroll/insurance';
    const QD = `${YM}-03`;
    const en = await post(INS, { action: 'enroll.add', employeeId: other!.id, event: 'ACQUIRE', qualifyOn: QD, insurers: ['NP', 'HI', 'EI', 'IA'] });
    check(en.status === 200 && en.json.added === 4, '취득 줄 4개(4대보험)를 넣는다', JSON.stringify(en.json));
    const en2 = await post(INS, { action: 'enroll.add', employeeId: other!.id, event: 'ACQUIRE', qualifyOn: QD, insurers: ['NP', 'HI'] });
    check(en2.json.added === 0 && en2.json.skipped === 2, '같은 줄은 두 번 들어가지 않는다');
    const enRow = async () => (await db.from('payroll_insurance_enrollments').select('id, version, state, confirmed_on, evidence').eq('employee_id', other!.id).eq('qualify_on', QD).eq('insurer', 'NP').eq('active', true).single()).data!;
    let np = await enRow();
    check((await post(INS, { action: 'enroll.set', id: np.id, expectedVersion: np.version, state: 'CONFIRMED', confirmedOn: QD, evidence: '' })).json.error === 'insurance_evidence', '근거 없이 확인 완료로 바꿀 수 없다');
    check((await post(INS, { action: 'enroll.set', id: np.id, expectedVersion: np.version, state: 'CONFIRMED', confirmedOn: QD, evidence: '900101-1234567 접수' })).json.error === 'insurance_no_rrn', '근거 칸에 주민번호 꼴은 넣을 수 없다');
    check((await post(INS, { action: 'enroll.set', id: np.id, expectedVersion: np.version, state: 'CHECKING' })).status === 200, '확인 중으로');
    check((await post(INS, { action: 'enroll.set', id: np.id, expectedVersion: np.version, state: 'CONFIRMED', confirmedOn: QD, evidence: 'e2e 접수 123' })).status === 409, '앞 화면의 판 번호로는 바꿀 수 없다');
    np = await enRow();
    check((await post(INS, { action: 'enroll.set', id: np.id, expectedVersion: np.version, state: 'CONFIRMED', confirmedOn: QD, evidence: 'e2e 접수 123' })).status === 200 && (await enRow()).state === 'CONFIRMED', '확인한 날 · 근거를 적어 확인 완료');
    const enPage = await open('/admin/payroll/insurance');
    check(enPage.includes('사회보험') && enPage.includes(other!.name) && enPage.includes('확인 완료') && enPage.includes('e2e 접수 123') && enPage.includes('미신고') && enPage.includes('공단 신고는 이 프로그램이 하지 않습니다'), '취득 · 상실 화면에 상태 · 근거와 「신고하지 않는다」 안내');
    await shot('payrun-5a-insurance');
    check((await q.evaluate(async (u) => (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, INS)) === 403, '직원은 사회보험 처리를 할 수 없다');

    // 고지 보험료 — 검사 계정은 보험을 전부 「가입 안 함」으로 뒀으므로 이미 뗀 금액은 0원이고 차액 = 고지액
    check((await post(INS, { action: 'notice.save', insurer: 'NP', month: YM, rows: [{ employeeId: other!.id, employee: 150000 }, { employeeId: other!.id, employee: 1 }] })).json.error === 'insurance_rows', '같은 직원을 두 줄 넣을 수 없다');
    const nf = await post(INS, { action: 'notice.save', insurer: 'NP', month: YM, rows: [{ employeeId: other!.id, employee: 150000, employer: 150000, note: 'e2e 고지' }] });
    check(nf.status === 200 && !!nf.json.id, '고지 보험료를 손으로 넣는다');
    const { data: nrow } = await db.from('payroll_insurance_notices').select('id, mapping_state, components').eq('file_id', nf.json.id).single();
    check(nrow?.mapping_state === 'MAPPED' && (nrow.components as Record<string, string>)['employee.notice'] === '150000', '직원을 직접 골라 넣은 줄은 바로 이어진다');
    const { error: fix } = await db.from('payroll_insurance_notices').update({ components: {} }).eq('id', nrow!.id);
    check(!!fix, '넣은 고지 금액은 DB에서도 고칠 수 없다');
    const first = await open(`/admin/payroll/insurance/notice/${nf.json.id}`);
    check(first.includes('150,000원') && first.includes('급여대장을 고르면'), '대장을 고르기 전에는 고지액만 보인다');
    const cmp = await open(`/admin/payroll/insurance/notice/${nf.json.id}?run=${run2Id}`);
    const cells = (await p.locator('table[data-notice] tbody tr').first().locator('td').allInnerTexts()).map((v) => v.trim());
    check(cells[1] === '150,000원' && cells[3] === '0원' && cells[4] === '+150,000원' && cmp.includes('대장에 넣기'), '대장을 고르면 이미 뗀 금액과 차액이 보인다', cells.slice(1, 5).join(' | '));
    await p.getByRole('button', { name: `${other!.name} 차액을 대장에 넣기` }).click();
    await p.getByText('이 대장에 +150,000원').waitFor({ timeout: 30000 });
    await shot('payrun-5b-notice');
    const { data: al } = await db.from('payroll_insurance_allocations').select('id, amount, override_id, active').eq('notice_id', nrow!.id).eq('active', true);
    const { data: ov } = await db.from('payroll_statement_overrides').select('id, item_code, kind, proposed_amount').eq('run_id', run2Id).eq('item_code', 'PENSION_SETTLE').eq('active', true);
    check(al?.length === 1 && Number(al[0].amount) === 150000 && ov?.length === 1 && al[0].override_id === ov[0].id && ov[0].kind === 'DEDUCTION', '차액이 대장의 「국민연금 정산」 공제 조정으로 들어간다');
    check((await post(INS, { action: 'notice.allocate', noticeId: nrow!.id, runId: run2Id })).json.error === 'insurance_allocated', '같은 고지 금액을 두 번 넣을 수 없다');
    check((await post(INS, { action: 'notice.withdraw', id: nf.json.id, reason: 'e2e 거두기' })).json.error === 'insurance_in_use', '대장에 들어간 줄이 있으면 묶음을 거둘 수 없다');
    r2 = await run2();
    check((await post(api2, { action: 'review', expectedVersion: r2.version })).json.error === 'payroll_stale', '차액을 넣으면 다시 계산하기 전에는 검토할 수 없다');
    check((await post(api2, { action: 'calculate', expectedVersion: r2.version })).json.calculated?.ok === 1, '차액을 넣고 다시 계산');
    r2 = await run2();
    const { data: sIns } = await db.from('payroll_statements').select('id, deduction_total, net_total').eq('generation_id', r2.current_generation_id).eq('employee_id', other!.id).single();
    check(Number(sIns?.net_total) === 2911670 - 150000, '명세서의 실지급이 차액만큼 줄어든다', String(sIns?.net_total));
    check((await open(`/admin/payroll/runs/${run2Id}/${other!.id}`)).includes('국민연금 정산'), '명세서에 「국민연금 정산」 줄이 보인다');
    await open(`/admin/payroll/insurance/notice/${nf.json.id}?run=${run2Id}`);
    await p.getByRole('button', { name: `${other!.name} 차액을 대장에서 빼기` }).click();
    await p.getByRole('button', { name: `${other!.name} 차액을 대장에 넣기` }).waitFor({ timeout: 30000 });
    const { data: ov2 } = await db.from('payroll_statement_overrides').select('id').eq('run_id', run2Id).eq('item_code', 'PENSION_SETTLE').eq('active', true);
    const { data: al2 } = await db.from('payroll_insurance_allocations').select('id').eq('notice_id', nrow!.id).eq('active', true);
    check(!ov2?.length && !al2?.length, '대장에서 빼면 조정과 반영 기록이 꺼진다');
    check((await post(INS, { action: 'notice.withdraw', id: nf.json.id, reason: '' })).status === 400 && (await post(INS, { action: 'notice.withdraw', id: nf.json.id, reason: 'e2e 거두기' })).status === 200, '뺀 뒤에는 사유를 적어 묶음을 거둘 수 있다');
    check((await post(INS, { action: 'notice.allocate', noticeId: nrow!.id, runId: run2Id })).status === 409, '거둔 묶음은 대장에 넣을 수 없다');
    const ia = await post(INS, { action: 'notice.save', insurer: 'IA', month: YM, rows: [{ employeeId: other!.id, employee: 0, employer: 30000 }] });
    check((await open(`/admin/payroll/insurance/notice/${ia.json.id}?run=${run2Id}`)).includes('산재보험은 근로자 부담이 없어'), '산재보험 고지는 기록만 하고 대장에 넣지 않는다');
    await post(INS, { action: 'notice.withdraw', id: ia.json.id, reason: 'e2e 검사 끝' });
    const list = await open('/admin/payroll/insurance?v=notice');
    check(list.includes(YM) && list.includes('국민연금') && list.includes('거둠') && (await p.locator('nav a[href="/admin/payroll/insurance"]').count()) >= 1, '고지 보험료 목록과 왼쪽 메뉴');
    // 다음 검사를 위해: 취득 줄은 끄고, 정정 판은 차액 없이 다시 계산해 둔다
    await db.from('payroll_insurance_enrollments').update({ active: false }).eq('employee_id', other!.id).eq('qualify_on', QD).eq('active', true);
    r2 = await run2();
    check((await post(api2, { action: 'calculate', expectedVersion: r2.version })).json.calculated?.ok === 1, '차액을 뺀 뒤 다시 계산');
    r2 = await run2();
  }
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

  // ── 엑셀 받기 ──
  const xl = await p.evaluate(async (u) => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type') ?? '', head: Array.from(b.slice(0, 2)), size: b.length }; }, `/api/admin/payroll/runs/${run2Id}/export`);
  check(xl.status === 200 && xl.type.includes('spreadsheetml') && xl.head[0] === 0x50 && xl.head[1] === 0x4b && xl.size > 5000, '대장 엑셀을 받을 수 있다', `${xl.status} ${xl.size}바이트`);
  const xlDenied = await q.evaluate(async (u) => (await fetch(u)).status, `/api/admin/payroll/runs/${run2Id}/export`);
  check(xlDenied === 403, '직원은 대장 엑셀을 받을 수 없다', String(xlDenied));

  // ── 상여 대장: 같은 달에 확정한 급여와 합쳐 세금은 차액만 ──
  check((await post('/api/admin/payroll/runs', { action: 'create', kind: 'BONUS', month: YM, title: 'e2e-상여' })).json.error === 'payroll_pay_date', '상여 대장은 지급일을 정해야 만들어진다');
  const bMade = await post('/api/admin/payroll/runs', { action: 'create', kind: 'BONUS', month: YM, payDate: `${YM}-25`, title: 'e2e-상여' });
  const bId = bMade.json.id as string;
  const bApi = `/api/admin/payroll/runs/${bId}`;
  const bRun = async () => (await db.from('payroll_runs').select('status, version, run_kind, sequence, current_generation_id').eq('id', bId).single()).data!;
  let b = await bRun();
  check(bMade.status === 200 && b.run_kind === 'BONUS' && b.sequence === 1, '상여 대장 만들기 (1차)');
  for (const m of mem!.filter((x) => x.employee_id !== other!.id)) await post(bApi, { action: 'exclude', employeeId: m.employee_id, reason: 'e2e 검사 — 검사 계정만 계산' });
  check((await post(bApi, { action: 'calculate', expectedVersion: b.version })).json.calculated?.blocked === 1, '상여 금액을 넣지 않으면 차단');
  b = await bRun();
  const { data: bs0 } = await db.from('payroll_statements').select('blockers').eq('generation_id', b.current_generation_id).eq('employee_id', other!.id).single();
  check(((bs0?.blockers ?? []) as { code: string }[]).some((x) => x.code === 'no_bonus_amount'), '차단 사유: 상여 금액 없음');
  check((await post(bApi, { action: 'override.add', employeeId: other!.id, itemCode: 'BONUS', kind: 'PAYMENT', amount: 500000, reason: 'e2e 상여' })).status === 200, '상여 금액을 조정으로 넣는다');
  check((await post(bApi, { action: 'calculate', expectedVersion: b.version })).json.calculated?.ok === 1, '상여 계산');
  b = await bRun();
  const { data: bs } = await db.from('payroll_statements').select('id, pay_total, deduction_total, net_total, snapshot, blockers').eq('generation_id', b.current_generation_id).eq('employee_id', other!.id).single();
  const { data: bl } = await db.from('payroll_statement_items').select('item_code, amount').eq('statement_id', bs!.id).order('item_code');
  // 정규(정정 2판) 과세 3,010,000 · 소득세 84,850 · 지방 8,480 + 상여 500,000 → 묶음 과세 3,510,000의 세액 130,000 / 13,000 → 차액 45,150 / 4,520
  check(JSON.stringify(bl?.map((l) => [l.item_code, Number(l.amount)])) === JSON.stringify([['BONUS', 500000], ['INCOME_TAX', 45150], ['LOCAL_TAX', 4520]]) && Number(bs!.net_total) === 450330, '상여 세금은 차액만: 소득세 45,150 · 지방소득세 4,520 → 실지급 450,330', JSON.stringify(bl));
  check((bs!.snapshot as { prior: { taxable: number; incomeTax: number } }).prior.taxable === 3010000 && (bs!.snapshot as { prior: { incomeTax: number } }).prior.incomeTax === 84850, '앞선 명세로 정정 2판(가장 새 확정 판)을 썼다');
  check(((bs!.blockers ?? []) as { code: string; warning?: boolean }[]).some((x) => x.code === 'insurance_not_calculated' && x.warning), '4대보험을 계산하지 않았다는 경고가 붙는다');
  check(!(await db.from('payroll_statement_items').select('id').eq('statement_id', bs!.id).eq('item_code', 'BASE')).data?.length, '상여 대장에는 기본급 줄이 없다');
  check((await post(bApi, { action: 'review', expectedVersion: b.version })).status === 200, '상여 검토');
  b = await bRun();
  check((await post(bApi, { action: 'finalize', expectedVersion: b.version })).status === 200, '상여 확정');
  check((await post(bApi, { action: 'publish' })).json.publish?.published === 1, '상여 명세서 공개');
  mine = await see('/punch/payslips');
  check(mine.includes('450,330원') && mine.includes('상여') && mine.includes('2,911,670원'), '직원: 급여 명세서와 상여 명세서가 따로 보인다');
  const bSlip = await see(`/punch/payslips/${bs!.id}`);
  check(bSlip.includes('인쇄 · PDF로 저장') && bSlip.includes('명세 번호') && bSlip.includes('귀속 기간') && bSlip.includes(other!.name), '직원 명세서: 회사 · 명세 번호 · 귀속 기간 · 이름과 인쇄 버튼');
  check(!(await open('/admin/payroll/runs')).includes('e2e-상여'), '검사용 상여 대장도 목록에 보이지 않는다');

  // ── 명세서 PDF ──
  const pdfOf = (pg: typeof p, u: string) => pg.evaluate(async (url) => { const res = await fetch(url); const b = new Uint8Array(await res.arrayBuffer()); return { status: res.status, type: res.headers.get('content-type') ?? '', head: String.fromCharCode(...b.slice(0, 5)), size: b.length, name: decodeURIComponent(res.headers.get('content-disposition') ?? ''), cache: res.headers.get('cache-control') ?? '' }; }, u);
  const myPdf = await pdfOf(q, `/api/payslips/${sNew!.id}/pdf`);
  check(myPdf.status === 200 && myPdf.type === 'application/pdf' && myPdf.head === '%PDF-' && myPdf.size > 10000 && myPdf.size < 300000, '직원: 내 명세서를 PDF로 받는다 (글꼴은 쓴 글자만 심는다)', `${myPdf.status} ${myPdf.size}바이트`);
  check(myPdf.name.includes('급여명세_') && myPdf.name.includes('_rev2.pdf') && myPdf.cache.includes('no-store'), 'PDF 파일 이름에 귀속월 · 사번 · 판이 들어가고, 저장해 두지 않게 내려준다', myPdf.name);
  check((await pdfOf(p, `/api/payslips/${sNew!.id}/pdf`)).status === 404, '다른 사람의 명세서 PDF는 받을 수 없다(없는 것으로 답한다)');
  check((await pdfOf(q, `/api/admin/payroll/runs/${run2Id}/pdf?emp=${other!.id}`)).status === 403, '직원은 관리자용 PDF 주소로 받을 수 없다');
  const admPdf = await pdfOf(p, `/api/admin/payroll/runs/${run2Id}/pdf?emp=${other!.id}`);
  check(admPdf.status === 200 && admPdf.head === '%PDF-' && !admPdf.name.includes('검토용'), '급여 담당자: 확정한 대장의 명세서 PDF');
  check((await pdfOf(p, `/api/admin/payroll/runs/${run2Id}/pdf?emp=${emp!.id}`)).status === 404, '대장에 명세서가 없는 사람은 PDF가 없다');
  check((await see(`/punch/payslips/${sNew!.id}`)).includes('PDF 받기') && (await open(`/admin/payroll/runs/${run2Id}/${other!.id}`)).includes('명세서 PDF'), '명세서 화면에 PDF 받기 버튼');
  const { count: pdfLogs } = await db.from('payroll_audit_events').select('id', { count: 'exact', head: true }).in('action', ['statement.pdf', 'statement.pdf.self']).eq('employee_id', other!.id).gte('created_at', new Date(Date.now() - 600e3).toISOString());
  check((pdfLogs ?? 0) >= 2, 'PDF를 받으면 급여 기록에 남는다', String(pdfLogs));

  // ── 인건비 현황: 정정본만 세고(원본을 두 번 세지 않는다), 급여 + 상여를 달로 더한다 ──
  const labor = async (qs: string) => {
    await open(`/admin/payroll/labor-cost?y=${year}${qs}`);
    const tds = p.locator('table[data-labor="byMonth"] tr', { hasText: YM }).locator('td');
    return (await tds.count()) === 7 ? (await tds.allInnerTexts()).map((v) => v.trim()) : [];
  };
  const both = await labor('');
  check(both[1] === '2' && both[2] === '3,510,000' && both[4] === '3,362,000', '인건비 현황: 그 달의 정규(정정 2판) + 상여 = 명세서 2건', both.join(' | '));
  check(both[6] === both[2].replace(/,/g, '') || Number(both[6].replace(/,/g, '')) === Number(both[2].replace(/,/g, '')) + Number(both[5].replace(/,/g, '')), '총인건비 = 지급 합계 + 사업주 부담', `${both[6]}`);
  const reg = await labor('&k=REGULAR');
  check(reg[1] === '1' && reg[4] === '2,911,670', '정규만 고르면 정정본 한 건만 (원본 2,916,670은 세지 않는다)', reg.join(' | '));
  const body = await p.locator('body').innerText();
  check(body.includes(other!.name) && body.includes('총인건비 = 지급 합계 + 사업주 부담') && body.includes('달별') && body.includes('부서별') && body.includes('직원별'), '인건비 현황에 달 · 부서 · 직원 표와 안내');
  // 인건비 표 확장 (2026-10-14): 직무별 · 지급항목별 · 공제항목별, 1인당 평균, 엑셀
  await open(`/admin/payroll/labor-cost?y=${year}`);
  const payItems = await p.locator('table[data-labor="byPayItem"] tbody tr').allInnerTexts();
  check((await p.locator('table[data-labor="byJob"]').count()) === 1 && payItems.length >= 2 && (await p.locator('table[data-labor="byDeductionItem"]').count()) === 1 && (await p.getByText('1인당 평균 총인건비').count()) === 1, '인건비 현황에 직무별 · 지급항목별 · 공제항목별 표와 1인당 평균', payItems.slice(0, 3).join(' / '));
  const xl2 = await p.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type') ?? '', bytes: Array.from(new Uint8Array(await r.arrayBuffer())) }; }, `/api/admin/payroll/labor-cost?y=${year}`);
  const wbL = new ExcelJS.Workbook();
  if (xl2.status === 200) await wbL.xlsx.load(Buffer.from(xl2.bytes) as unknown as ArrayBuffer);
  check(xl2.status === 200 && xl2.type.includes('spreadsheetml') && wbL.worksheets.length === 7, '인건비 현황 엑셀 — 요약 · 월 · 부서 · 직무 · 직원 · 지급항목 · 공제항목 7장', `${xl2.status} ${wbL.worksheets.map((w) => w.name).join(',')}`);
  check((await q.evaluate(async (u) => (await fetch(u)).status, `/api/admin/payroll/labor-cost?y=${year}`)) === 403, '직원은 인건비 엑셀을 받을 수 없다');
  await shot('payrun-9-labor-cost');
  check((await p.locator('nav a[href="/admin/payroll/labor-cost"]').count()) >= 1, '왼쪽 메뉴 급여 아래에 인건비 현황');
  check((await see('/admin/payroll/labor-cost')).includes('3,362,000') === false, '직원에게는 인건비 현황이 보이지 않는다');

  // ── 예상 지급 · 공제 (오늘은 승인된 세액표가 없어 예상할 수 없다고 나와야 한다) ──
  const prev = await open(`/admin/payroll/staff/${other!.id}`);
  check(prev.includes('예상 지급 · 공제') && prev.includes('아래 이유로 예상할 수 없습니다.') && prev.includes('승인된 기준 자료가 없습니다'), '사원별 급여: 예상 지급 · 공제 칸 — 자료가 없으면 이유를 보여 준다');
  await ctx2.close();

  // ── 기록 · 권한 ──
  const { data: audit } = await db.from('payroll_audit_events').select('action, detail').in('run_id', [runId, run2Id]);
  const { data: audit2 } = await db.from('payroll_audit_events').select('action').eq('actor_id', emp!.id).like('action', 'insurance.%').gte('created_at', new Date(Date.now() - 1800e3).toISOString()); // 대장 번호가 없는 사회보험 기록
  const acts = new Set([...(audit ?? []), ...(audit2 ?? [])].map((a) => a.action));
  check(['run.create', 'run.calculate', 'run.review', 'run.finalize', 'member.exclude', 'override.add', 'run.publish', 'statement.unpublish', 'run.correct', 'run.export', 'insurance.enroll.add', 'insurance.enroll.state', 'insurance.notice.save', 'insurance.allocate', 'insurance.unallocate', 'insurance.notice.withdraw'].every((a) => acts.has(a)) && !JSON.stringify(audit).includes('3010000') && !JSON.stringify(audit).includes('2906670'), '급여 전용 기록에 누가 무엇을 했는지 남고, 금액은 적히지 않는다');
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
