// 퇴직급여 검사 (2026-10-14, M9 · DB 묶음 6) — 수동 검산 건의 만들기 · 확정 · 겹침 금지 · 거두기 · 새 판, 직원 예상 퇴직금.
//   npx tsx scripts/e2e-retirement.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
//   ADM = e2e-audit (급여 담당 관리자) · A = e2e-audit2 (직원)
// 퇴직급여 건은 지울 수 없는 표라, 검사가 만든 건은 끝에 전부 「거둠」으로 바꾼다(검사 계정의 건은 실제 관리자 화면에 보이지 않는다).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const practice = process.env.OPERATION_MODE !== 'live';
const who = async (no: string) => (await db.from('profiles').select('id, name').eq('employee_no', no).single()).data!;
const [ADM, A] = await Promise.all([who('e2e-audit'), who('e2e-audit2')]);
const Y = 2200 + Math.floor(Math.random() * 600); // 다른 검사 · 앞선 검사와 겹치지 않는 먼 해
const d = (yearOffset: number, md: string) => `${Y + yearOffset}-${md}`;
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const started = new Date().toISOString();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
try {
  await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', can_view_payroll: true }).eq('id', ADM.id);
  await db.from('profiles').update({ active: true, role: 'employee', locale: 'ko' }).eq('id', A.id);
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  const login = async (id: string): Promise<Page> => {
    for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
    const token = randomBytes(32).toString('base64url');
    await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });
    const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(`${BASE}/register?token=${token}`);
    await createPassword(pg);
    return pg;
  };
  const post = (pg: Page, body: unknown) => pg.evaluate(async (b) => { const r = await fetch('/api/admin/payroll/retirement', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, body);
  const open = async (pg: Page, url: string) => {
    await pg.goto(`${BASE}${url}`);
    await pg.waitForLoadState('networkidle');
    return pg.locator('body').innerText();
  };
  const row = async (id: string) => (await db.from('payroll_retirement_cases').select('state, amount, tax_amount, missing, revision, supersedes_id, is_test, case_kind, result_hash, input_snapshot').eq('id', id).single()).data!;
  const p = await login(ADM.id);
  const q = await login(A.id);
  const input = (from: string, to: string, more: object = {}) => ({ periodFrom: from, periodTo: to, wage3m: 9000000, days3m: 92, bonus1y: 0, leavePay1y: 0, excludedDays: 0, ordinaryDaily: null, ...more });

  // ── 화면에서 만들기: 자료에서 채우기 → 값 넣기 → 검산이 바로 보인다 → 만들기 ──
  const pre = await open(p, `/admin/payroll/retirement?emp=${A.id}&kind=FINAL&to=${d(2, '12-31')}`);
  check(pre.includes('퇴직급여') && pre.includes('노무 · 세무 확인이 필요합니다') && pre.includes(`${A.name} · 퇴직 정산`) && pre.includes('3개월 임금은 채우지 못했습니다'), '직원 · 마지막 근무일을 고르면 채운 것과 못 채운 것을 알려 준다');
  check((await p.locator('input[name="days3m"]').inputValue()) === '92', '3개월 일수는 달력으로 채운다 (10/1 ~ 12/31 = 92일)');
  check((await p.locator('[data-check]').innerText()).includes('금액을 낼 수 없음'), '임금이 비어 있으면 금액 대신 「낼 수 없음」');
  await p.locator('form:has([data-check]) input[type="date"]').first().fill(d(0, '01-01'));
  await p.locator('input[name="wage3m"]').fill('9000000');
  const days = Math.round((Date.parse(`${d(2, '12-31')}T00:00:00Z`) - Date.parse(`${d(0, '01-01')}T00:00:00Z`)) / 86400000) + 1;
  const want = Math.floor((9000000 / 92) * 30 * days / 365);
  const shown = await p.locator('[data-check]').innerText();
  check(shown.includes(`${days.toLocaleString('ko-KR')}일`) && shown.includes(`${want.toLocaleString('ko-KR')}원`), '넣는 대로 검산이 바뀐다 (계속근로일수 · 퇴직급여)', `${days}일 → ${want}`);
  await p.locator('input[name="ordinaryDaily"]').fill('120000');
  check((await p.locator('[data-check]').innerText()).includes('(통상임금)'), '통상임금이 더 크면 통상임금을 쓴다고 보인다');
  await p.locator('input[name="ordinaryDaily"]').fill('');
  await p.getByRole('button', { name: '이 값으로 만들기' }).click();
  await p.waitForURL(/\/admin\/payroll\/retirement\/[0-9a-f-]{36}/, { timeout: 30000 });
  await p.waitForLoadState('networkidle');
  const id1 = p.url().split('/').pop()!;
  let r1 = await row(id1);
  check(r1.state === 'DRAFT' && Number(r1.amount) === want && r1.is_test === practice && r1.case_kind === 'FINAL', '초안으로 저장된다 (화면의 검산과 서버 계산이 같다)', String(r1.amount));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'retire-1-draft.png'), fullPage: true });

  // ── 초안 고치기: 세액은 근거와 함께 ──
  check((await post(p, { action: 'update', id: id1, input: input('', ''), taxAmount: 100000, taxBasis: '' })).json.error === 'retirement_tax_basis', '근거 없이 세액만 넣을 수 없다');
  await p.locator('input[name="taxAmount"]').fill('123450');
  await p.locator('input[name="taxBasis"]').fill('세무사 계산서 e2e');
  await p.getByRole('button', { name: '저장', exact: true }).click();
  await p.getByText('저장했습니다.').waitFor({ timeout: 20000 });
  r1 = await row(id1);
  check(Number(r1.tax_amount) === 123450 && Number(r1.amount) === want, '세액과 근거를 저장한다 (퇴직급여는 그대로 — 세금을 프로그램이 빼지 않는다)');
  const moved = await post(p, { action: 'update', id: id1, input: input(d(-5, '01-01'), d(9, '12-31')), taxAmount: 123450, taxBasis: '세무사 계산서 e2e' });
  check(moved.status === 200 && Number((await row(id1)).amount) === want, '초안을 고쳐도 정산 기간은 바뀌지 않는다(기간은 만들 때 정한다)');

  // ── 확정 → 고칠 수 없다 ──
  await p.reload();
  await p.getByRole('button', { name: '확정', exact: true }).click();
  await p.getByRole('button', { name: '확정하기' }).click();
  await p.getByText('확정', { exact: true }).first().waitFor({ timeout: 20000 });
  for (let i = 0; i < 20 && (await row(id1)).state !== 'FINALIZED'; i++) await p.waitForTimeout(500);
  r1 = await row(id1);
  check(r1.state === 'FINALIZED' && !!r1.result_hash, '확정된다');
  check((await post(p, { action: 'update', id: id1, input: input('', ''), taxAmount: null, taxBasis: null })).status === 409, '확정본은 고칠 수 없다');
  const { error: dbEdit } = await db.from('payroll_retirement_cases').update({ amount: 1 }).eq('id', id1);
  check(!!dbEdit, '확정본은 DB에서도 금액을 바꿀 수 없다');
  const done = await open(p, `/admin/payroll/retirement/${id1}`);
  check(done.includes('검산') && done.includes(`${want.toLocaleString('ko-KR')}원`) && done.includes('세무사 계산서 e2e') && !done.includes('이 값으로 만들기'), '확정본 화면에는 넣은 값 · 검산 · 세액 근거가 그대로 보인다');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'retire-2-final.png'), fullPage: true });

  // ── 같은 기간을 두 번 정산하지 못한다 · 추계는 확정하지 못한다 · 빠진 입력은 확정하지 못한다 ──
  const mid = await post(p, { action: 'create', employeeId: A.id, kind: 'INTERIM', input: input(d(1, '01-01'), d(1, '12-31')) });
  const idMid = mid.json.id as string;
  const clash = await post(p, { action: 'finalize', id: idMid });
  check(mid.status === 200 && clash.status === 409 && clash.json.error === 'retirement_overlap', '확정한 기간과 겹치는 중간정산은 확정되지 않는다', JSON.stringify(clash.json));
  const est = await post(p, { action: 'create', employeeId: A.id, kind: 'ESTIMATE', input: input(d(3, '01-01'), d(5, '12-31')) });
  const estFin = await post(p, { action: 'finalize', id: est.json.id });
  check(est.status === 200 && estFin.json.error === 'retirement_estimate' && Number((await row(est.json.id as string)).amount) > 0, '추계는 금액은 나오지만 확정할 수 없다');
  const gap = await post(p, { action: 'create', employeeId: A.id, kind: 'FINAL', input: input(d(3, '01-01'), d(5, '12-31'), { wage3m: null }) });
  const rg = await row(gap.json.id as string);
  check(gap.status === 200 && rg.amount === null && JSON.stringify(rg.missing) === '["wage3m"]', '임금이 빠진 건은 금액이 비어 있다 (0원이 아니다)', JSON.stringify(rg.missing));
  check((await post(p, { action: 'finalize', id: gap.json.id })).json.error === 'retirement_incomplete', '빠진 입력이 있으면 확정되지 않는다');
  const short = await post(p, { action: 'create', employeeId: A.id, kind: 'FINAL', input: input(d(6, '03-01'), d(6, '12-31')) });
  check(short.status === 200 && (await row(short.json.id as string)).amount === null, '1년이 안 되는 기간은 금액을 내지 않는다');
  check((await post(p, { action: 'create', employeeId: A.id, kind: 'FINAL', input: input(d(3, '01-01'), d(2, '01-01')) })).status === 400, '끝이 시작보다 앞이면 만들 수 없다');
  check((await post(p, { action: 'create', employeeId: A.id, kind: 'BONUS', input: input(d(3, '01-01'), d(5, '12-31')) })).status === 400, '모르는 종류는 거부');

  // ── 거두기 → 새 판, 거둔 뒤에는 그 기간을 다시 확정할 수 있다 ──
  check((await post(p, { action: 'withdraw', id: id1, reason: '' })).status === 400, '사유 없이 거둘 수 없다');
  check((await post(p, { action: 'withdraw', id: id1, reason: 'e2e 임금 누락' })).status === 200 && (await row(id1)).state === 'WITHDRAWN', '사유를 적어 확정본을 거둔다');
  check((await post(p, { action: 'withdraw', id: id1, reason: '다시' })).status === 409 && (await post(p, { action: 'finalize', id: id1 })).status === 409, '거둔 건은 다시 거두거나 확정할 수 없다');
  const rev = await post(p, { action: 'revise', id: id1 });
  const r2 = rev.status === 200 ? await row(rev.json.id as string) : null;
  check(r2?.state === 'DRAFT' && r2.revision === 2 && r2.supersedes_id === id1 && Number(r2.amount) === want && Number(r2.tax_amount) === 123450, '거둔 건에서 새 판(2판 초안)을 만든다 — 넣은 값을 그대로 가져온다');
  const page2 = await open(p, `/admin/payroll/retirement/${rev.json.id}`);
  check(page2.includes('2판') && page2.includes('앞 판 보기'), '새 판 화면에 판 번호와 앞 판으로 가는 길');
  check((await post(p, { action: 'finalize', id: idMid })).status === 200, '앞 확정본을 거둔 뒤에는 그 기간의 중간정산을 확정할 수 있다');
  check((await post(p, { action: 'finalize', id: rev.json.id })).json.error === 'retirement_overlap', '그러면 이번에는 새 판이 겹쳐서 확정되지 않는다');
  const after = await open(p, `/admin/payroll/retirement?emp=${A.id}&kind=FINAL&to=${d(2, '12-31')}`);
  check(after.includes('확정한 중간정산이 있어') && (await p.locator('form:has([data-check]) input[type="date"]').first().inputValue()) === d(2, '01-01'), '확정한 중간정산이 있으면 그 다음날부터로 채운다');
  const list = await open(p, '/admin/payroll/retirement');
  check(list.includes(A.name) && list.includes('중간정산') && list.includes('거둠') && list.includes('2판'), '목록에 건 · 상태 · 판이 보인다');
  check((await p.locator('nav a[href="/admin/payroll/retirement"]').count()) >= 1, '왼쪽 메뉴 급여 아래에 퇴직급여');

  // ── 권한 · 직원 예상 퇴직금 ──
  check((await post(q, { action: 'create', employeeId: A.id, kind: 'ESTIMATE', input: input(d(3, '01-01'), d(5, '12-31')) })).status === 403, '직원은 퇴직급여 건을 만들 수 없다');
  const denied = await open(q, `/admin/payroll/retirement/${id1}`);
  check(!denied.includes(`${want.toLocaleString('ko-KR')}`), '직원에게는 퇴직급여 화면의 금액이 보이지 않는다');
  const mine = await open(q, '/punch/retirement');
  const est1 = (await q.locator('[data-estimate]').innerText()).trim();
  check(mine.includes('예상 퇴직금') && mine.includes('들어 있지 않은 것') && mine.includes('퇴직소득세') && (est1 === '지금은 계산할 수 없음' || /^[\d,]+원$/.test(est1)), '직원: 예상 퇴직금 화면 — 금액이거나, 계산할 수 없으면 그 이유', est1);
  check(est1 !== '0원', '자료가 모자랄 때 0원으로 보이지 않는다');
  check((await open(q, '/punch/payslips')).includes('예상 퇴직금 보기'), '내 명세서 화면에서 예상 퇴직금으로 가는 길');
  if (SHOTS) await q.screenshot({ path: path.join(SHOTS, 'retire-3-mine.png'), fullPage: true });
  const { data: acts } = await db.from('payroll_audit_events').select('action').eq('actor_id', ADM.id).like('action', 'retirement.%').gte('created_at', started);
  const seen = new Set((acts ?? []).map((a) => a.action as string));
  check(['retirement.create', 'retirement.update', 'retirement.finalize', 'retirement.withdraw', 'retirement.revise'].every((a) => seen.has(a)), '만들기 · 고치기 · 확정 · 거두기 · 새 판이 급여 기록에 남는다', [...seen].join(','));
  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
  // 검사가 만든 건은 전부 거둔다(다음 검사와 겹치지 않게)
  await db.from('payroll_retirement_cases').update({ state: 'WITHDRAWN', reason: 'e2e 검사 끝' }).eq('employee_id', A.id).in('state', ['DRAFT', 'FINALIZED']).gte('created_at', started);
  await db.from('profiles').update({ can_view_payroll: false }).eq('id', ADM.id);
  await db.from('profiles').update({ role: 'employee', active: false }).eq('id', A.id);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
