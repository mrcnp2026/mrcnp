// 일용직 검사 (2026-10-14, M9 · DB 묶음 6) — 대상자 · 고용 기간 · 근무 입력 · 일용 대장(계산 → 검토 → 확정), 같은 근무가 두 대장에 들어가지 않는지.
//   npx tsx scripts/e2e-daily.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
//   ADM = e2e-audit (급여 담당 관리자) · A = e2e-audit2 (직원 — 권한 확인용)
// 대상자 · 근무 · 대장은 지울 수 없는 표라 검사 줄이 남는다(대상자는 검사 표시, 대장은 제목 e2e-일용 → 실제 화면에 보이지 않는다). 끝에 대상자 · 고용 기간은 끄고 남은 초안 근무는 무효로 한다.
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
const who = async (no: string) => (await db.from('profiles').select('id, name').eq('employee_no', no).single()).data!;
const [ADM, A] = await Promise.all([who('e2e-audit'), who('e2e-audit2')]);
const TAG = randomBytes(3).toString('hex');
const M = `${2200 + Math.floor(Math.random() * 600)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`; // 다른 검사와 겹치지 않는 먼 달
const d = (day: number) => `${M}-${String(day).padStart(2, '0')}`;
const API = '/api/admin/payroll/daily';
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const started = new Date().toISOString();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
const payeeIds: string[] = [];
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
  const postTo = (pg: Page, url: string, body: unknown) => pg.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  const p = await login(ADM.id);
  const q = await login(A.id);
  const post = (body: unknown) => postTo(p, API, body);
  const open = async (url: string) => {
    await p.goto(`${BASE}${url}`);
    await p.waitForLoadState('networkidle');
    return p.locator('body').innerText();
  };
  const shot = async (name: string) => {
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  const NAME = `일용검사${TAG}`;
  const yes = { taxState: 'DAILY', ei: 'NO', np: 'NO', hi: 'NO' }, unknown = { taxState: 'UNKNOWN', ei: 'UNKNOWN', np: 'UNKNOWN', hi: 'UNKNOWN' };

  // ── 대상자 ──
  check((await post({ action: 'payee.add', internalNo: `d-${TAG}`, name: NAME })).json.error === 'daily_internal_no', '검사 계정은 검사용 번호(e2e-)로만 대상자를 만든다(실제 목록과 섞이지 않게)');
  await open('/admin/payroll/daily');
  await p.getByRole('button', { name: '대상자 등록' }).first().click(); // 등록 양식은 단추를 눌러 여는 창 (2026-10-14)
  await p.locator('input[name="internalNo"]').fill(`e2e-d1-${TAG}`);
  await p.locator('input[name="name"]').fill(NAME);
  await p.getByRole('button', { name: '등록', exact: true }).click();
  await p.locator('[data-payees]').getByText(`e2e-d1-${TAG}`).waitFor({ timeout: 30000 });
  const { data: p1row } = await db.from('payroll_payees').select('id, is_test, profile_id').eq('internal_no', `e2e-d1-${TAG}`).single();
  const P1 = p1row!.id as string;
  payeeIds.push(P1);
  check(p1row?.is_test === true && p1row.profile_id === null, '화면에서 대상자를 등록한다 (로그인 계정은 만들어지지 않는다)');
  const { count: profiles } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('name', NAME);
  check((profiles ?? 0) === 0, '직원 표에는 아무것도 생기지 않는다');
  check((await post({ action: 'payee.add', internalNo: `e2e-d1-${TAG}`, name: '다른 사람' })).json.error === 'daily_payee_exists', '내부번호는 겹칠 수 없다');
  const p2 = await post({ action: 'payee.add', internalNo: `e2e-d2-${TAG}`, name: NAME });
  const P2 = p2.json.id as string;
  payeeIds.push(P2);
  check(p2.status === 200, '이름이 같아도 내부번호가 다르면 다른 사람으로 등록된다');
  const { error: renum } = await db.from('payroll_payees').update({ internal_no: 'x' }).eq('id', P1);
  check(!!renum, '내부번호는 DB에서도 바꿀 수 없다');

  // ── 고용 기간 ──
  check((await post({ action: 'engagement.add', payeeId: P1, startsOn: d(1), endsOn: d(28), project: '현장A', dayRate: 200000, ...yes, basisNote: '' })).json.error === 'daily_basis', '세금 · 보험을 정했으면 근거를 적어야 한다');
  check((await post({ action: 'engagement.add', payeeId: P1, startsOn: d(1), endsOn: d(28), project: '현장A', dayRate: 200000, ...yes, basisNote: 'e2e 계약서 확인' })).status === 200, '고용 기간을 넣는다 (세금: 일용근로소득, 보험 적용 안 함)');
  check((await post({ action: 'engagement.add', payeeId: P1, startsOn: d(10), endsOn: '', project: '현장A', dayRate: 200000, ...unknown })).json.error === 'daily_engagement_overlap', '같은 현장의 기간은 겹칠 수 없다');
  check((await post({ action: 'engagement.add', payeeId: P1, startsOn: d(28), endsOn: d(1), project: '현장C', dayRate: '', ...unknown })).json.error === 'daily_period', '끝이 시작보다 앞이면 거부');
  check((await post({ action: 'engagement.add', payeeId: P2, startsOn: d(1), endsOn: '', project: '현장A', dayRate: '', ...unknown })).status === 200, '「모름」 상태로도 넣을 수 있다 (근거 없이)');
  const payeesPage = await open('/admin/payroll/daily');
  check(payeesPage.includes('세금 일용근로소득으로 뗌') && payeesPage.includes('모름 있음 — 계산 안 됨') && payeesPage.includes('e2e 계약서 확인') && payeesPage.includes('검증 대기'), '대상자 화면에 적용 상태 · 근거 · 「모름」 경고와 안내');
  await shot('daily-1-payees');

  // ── 근무 입력 ──
  const w1 = await post({ action: 'work.add', payeeId: P1, workDate: d(2), project: '현장A', quantity: 1, dayRate: '', items: [] });
  check(w1.status === 200, '근무 한 줄 (일단가를 비우면 고용 기간의 일단가)');
  check((await post({ action: 'work.add', payeeId: P1, workDate: d(2), project: '현장A', quantity: 1, dayRate: '', items: [] })).json.error === 'daily_work_exists', '같은 사람 · 날 · 현장은 두 번 넣을 수 없다');
  check((await post({ action: 'work.add', payeeId: P1, workDate: d(2), project: '현장A', segmentKey: 'B', quantity: 0.5, dayRate: '', items: [] })).status === 200, '구간을 나누면 같은 날에 한 줄 더 넣을 수 있다');
  check((await post({ action: 'work.add', payeeId: P1, workDate: d(3), project: '현장A', quantity: 1, dayRate: 150000, items: [{ kind: 'NONTAX', label: '식대', amount: 10000 }, { kind: 'DEDUCTION', label: '고용보험', amount: 1800 }] })).status === 200, '비과세 · 공제 항목과 함께');
  check((await post({ action: 'work.add', payeeId: P1, workDate: d(2), project: '현장Z', quantity: 1, dayRate: 100000, items: [] })).json.error === 'daily_no_engagement', '고용 기간이 없는 현장 · 날짜에는 넣을 수 없다');
  check((await post({ action: 'work.add', payeeId: P2, workDate: d(2), project: '현장A', quantity: 1, dayRate: '', items: [] })).json.error === 'daily_no_rate', '일단가가 어디에도 없으면 넣을 수 없다');
  check((await post({ action: 'work.add', payeeId: P2, workDate: d(2), project: '현장A', quantity: 1, dayRate: 180000, items: [] })).status === 200, '다른 대상자의 근무');
  check((await post({ action: 'work.add', payeeId: P1, workDate: d(4), project: '현장A', quantity: 5, dayRate: '', items: [] })).status === 400 && (await post({ action: 'work.add', payeeId: P1, workDate: d(4), project: '현장A', quantity: 1, dayRate: '', items: [{ kind: 'X', label: 'a', amount: 1 }] })).status === 400, '틀린 공수 · 항목은 거부');
  const workPage = await open(`/admin/payroll/daily?v=work&m=${M}`);
  check(workPage.includes(NAME) && workPage.includes('초안') && workPage.includes('식대(비과세 지급) 10,000') && (await p.locator('table[data-work] tbody tr').count()) === 4, '근무 입력 화면에 그 달의 줄 4개');
  await shot('daily-2-work');
  const rows = async (payee: string) => ((await db.from('payroll_daily_work').select('id, version, status, work_date, segment_key, day_rate').eq('payee_id', payee).order('work_date').order('segment_key')).data ?? []) as { id: string; version: number; status: string; work_date: string; segment_key: string; day_rate: number }[];
  check(Number((await rows(P1))[0].day_rate) === 200000, '비운 일단가는 고용 기간의 값으로 저장된다');

  // ── 일용 대장: 확정 안 한 근무 · 「모름」 상태는 계산하지 않는다 ──
  const made = await post({ action: 'run.create', month: M, payDate: d(28) });
  const RUN = made.json.id as string;
  const run = async () => (await db.from('payroll_runs').select('status, version, current_generation_id, run_kind, title, sequence').eq('id', RUN).single()).data!;
  let r = await run();
  check(made.status === 200 && r.run_kind === 'DAILY' && r.sequence === 1, '일용 대장을 만든다 (1차)');
  const c1 = await post({ action: 'run.calculate', id: RUN, expectedVersion: r.version });
  check(c1.json.calculated?.ok === 0 && c1.json.calculated?.blocked === 2, '확정 안 한 근무 · 「모름」 상태는 계산하지 않는다', JSON.stringify(c1.json));
  r = await run();
  const { data: bl } = await db.from('payroll_daily_statements').select('payee_id, state, blockers, gross_total, net_total').eq('generation_id', r.current_generation_id);
  const codes = (id: string) => ((bl ?? []).find((s) => s.payee_id === id)?.blockers as { code: string }[]).map((x) => x.code).join(',');
  check(codes(P1) === 'unconfirmed_work' && codes(P2) === 'unconfirmed_work,tax_unknown,insurance_unknown' && (bl ?? []).every((s) => s.gross_total === null && s.net_total === null), '막힌 사람은 금액이 비어 있다 (0원이 아니다)', `${codes(P1)} / ${codes(P2)}`);
  check((await post({ action: 'run.review', id: RUN, expectedVersion: r.version })).json.error === 'payroll_has_blocked', '막힌 사람이 있으면 검토할 수 없다');
  const board0 = await open(`/admin/payroll/daily/runs/${RUN}`);
  check(board0.includes('확정하지 않은 근무 줄이 있습니다.') && board0.includes('세금 적용 상태가 「모름」') && board0.includes('계산하지 못함') && board0.includes('검토용'), '대장 화면에 막힌 이유가 보인다');

  // ── 근무 확정 → 계산: 같은 날의 두 줄은 그 날 합계로 세금을 한 번 계산한다 ──
  await open(`/admin/payroll/daily?v=work&m=${M}`);
  await p.locator('table[data-work] tbody tr').first().getByRole('button', { name: '확정' }).click();
  await p.locator('table[data-work] tbody tr').first().getByText('확정', { exact: true }).first().waitFor({ timeout: 20000 });
  for (const w of (await rows(P1)).filter((x) => x.status === 'DRAFT')) await post({ action: 'work.status', id: w.id, expectedVersion: w.version, status: 'CONFIRMED' });
  check((await rows(P1)).every((x) => x.status === 'CONFIRMED'), '근무 줄을 확정한다 (화면 1줄 + 나머지)');
  const w0 = (await rows(P1))[0];
  check((await post({ action: 'work.status', id: w0.id, expectedVersion: w0.version - 1, status: 'VOID' })).status === 409, '앞 화면의 판 번호로는 바꿀 수 없다');
  const { error: edit } = await db.from('payroll_daily_work').update({ day_rate: 1, version: w0.version + 1 }).eq('id', w0.id);
  check(!!edit, '확정한 줄의 금액은 DB에서도 고칠 수 없다');
  const w2 = (await rows(P2))[0];
  check((await post({ action: 'work.status', id: w2.id, expectedVersion: w2.version, status: 'VOID' })).status === 200, '「모름」인 사람의 근무는 무효로 한다');
  r = await run();
  const c2 = await post({ action: 'run.calculate', id: RUN, expectedVersion: r.version });
  check(c2.json.calculated?.ok === 1 && c2.json.calculated?.blocked === 0, '다시 계산: 1명', JSON.stringify(c2.json));
  r = await run();
  const { data: s1 } = await db.from('payroll_daily_statements').select('*').eq('generation_id', r.current_generation_id).eq('payee_id', P1).single();
  // 2일: 200,000 + 100,000(0.5공수) = 300,000 → (300,000 − 150,000) × 2.7% = 4,050 · 지방 400 / 3일: 과세 150,000 → 0, 비과세 10,000, 공제 1,800
  check(Number(s1?.work_days) === 2.5 && Number(s1?.gross_total) === 460000 && Number(s1?.taxable_total) === 450000 && Number(s1?.nontax_total) === 10000 && Number(s1?.income_tax) === 4050 && Number(s1?.local_tax) === 400 && Number(s1?.other_deduction) === 1800 && Number(s1?.net_total) === 453750, '지급명세: 근무 2.5일 · 총지급 460,000 · 소득세 4,050 · 지방 400 · 공제 1,800 · 실지급 453,750', JSON.stringify({ g: s1?.gross_total, t: s1?.income_tax, n: s1?.net_total }));
  const board = await open(`/admin/payroll/daily/runs/${RUN}`);
  check(board.includes('453,750원') && board.includes('4,050원') && board.includes(`근무월 ${M} · 지급일 ${d(28)}`) && board.includes('daily-tax-temp-1') && board.includes('합계 (1명)'), '대장 화면에 지급명세 · 근무월/지급일 · 쓴 규칙');
  await shot('daily-3-run');

  // ── 검토 → (근무가 바뀌면 다시 계산) → 확정 ──
  await p.getByRole('button', { name: '검토 완료' }).click();
  for (let i = 0; i < 40 && (await run()).status !== 'REVIEWED'; i++) await p.waitForTimeout(500);
  r = await run();
  check(r.status === 'REVIEWED', '검토됨');
  const extra = await post({ action: 'work.add', payeeId: P1, workDate: d(4), project: '현장A', quantity: 1, dayRate: '', items: [] });
  check((await post({ action: 'run.finalize', id: RUN, expectedVersion: r.version })).json.error === 'payroll_stale', '계산한 뒤 근무가 늘면 확정할 수 없다(다시 계산해야 한다)');
  const ex = (await rows(P1)).find((x) => x.id === extra.json.id)!;
  await post({ action: 'work.status', id: ex.id, expectedVersion: ex.version, status: 'VOID' });
  check((await post({ action: 'run.finalize', id: RUN, expectedVersion: r.version })).status === 200 && (await run()).status === 'FINALIZED', '늘어난 줄을 무효로 하면 계산이 그대로라 확정된다');
  r = await run();
  check((await post({ action: 'run.calculate', id: RUN, expectedVersion: r.version })).json.error === 'payroll_finalized', '확정한 대장은 다시 계산할 수 없다');
  const { error: sEdit } = await db.from('payroll_daily_statements').update({ net_total: 1 }).eq('id', s1!.id);
  check(!!sEdit, '지급명세는 DB에서도 고칠 수 없다');
  const wNow = (await rows(P1))[0];
  check((await post({ action: 'work.status', id: wNow.id, expectedVersion: wNow.version, status: 'VOID' })).json.error === 'daily_work_in_run', '확정한 대장에 들어간 근무는 무효로 할 수 없다');
  check(!(await open(`/admin/payroll/daily/runs/${RUN}`)).includes('검토용'), '확정한 대장에는 「검토용」 표시가 없다');

  // ── 같은 달 2차 대장: 앞 대장에 들어간 근무는 다시 들어가지 않는다 ──
  const made2 = await post({ action: 'run.create', month: M, payDate: d(28) });
  const RUN2 = made2.json.id as string;
  const run2 = async () => (await db.from('payroll_runs').select('status, version, current_generation_id, sequence').eq('id', RUN2).single()).data!;
  let r2 = await run2();
  check(r2.sequence === 2 && (await post({ action: 'run.calculate', id: RUN2, expectedVersion: r2.version })).json.error === 'daily_no_work', '2차 대장: 남은 근무가 없으면 계산할 것이 없다');
  const w5 = await post({ action: 'work.add', payeeId: P1, workDate: d(5), project: '현장A', quantity: 1, dayRate: '', items: [] });
  await post({ action: 'work.status', id: w5.json.id, expectedVersion: 1, status: 'CONFIRMED' });
  const c3 = await post({ action: 'run.calculate', id: RUN2, expectedVersion: r2.version });
  r2 = await run2();
  const { data: s2 } = await db.from('payroll_daily_statements').select('gross_total, work_days').eq('generation_id', r2.current_generation_id).eq('payee_id', P1).single();
  check(c3.json.calculated?.ok === 1 && Number(s2?.gross_total) === 200000 && Number(s2?.work_days) === 1, '2차 대장에는 새 근무만 들어간다 (1차에 든 2.5일은 다시 세지 않는다)', JSON.stringify(s2));

  // ── 지급명세 엑셀 (2026-10-14) ──
  const xl = await p.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type') ?? '', size: (await r.arrayBuffer()).byteLength }; }, `/api/admin/payroll/daily/runs/${RUN}/export`);
  const { count: logs } = await db.from('download_logs').select('id', { count: 'exact', head: true }).eq('kind', 'daily_statements').eq('scope', RUN);
  check(xl.status === 200 && xl.type.includes('spreadsheetml') && xl.size > 3000 && (logs ?? 0) >= 1, '지급명세 엑셀을 받는다 (반출 기록이 남는다)', JSON.stringify(xl));
  check((await open(`/admin/payroll/daily/runs/${RUN}`)).includes('지급명세 엑셀 받기'), '대장 화면에 「지급명세 엑셀 받기」');

  // ── 정정 판 (2026-10-14): 확정한 1차를 고친다 — 원본은 그대로, 새 판에서 근무 하나를 무효로 하고 다시 계산 · 확정 ──
  check((await post({ action: 'run.correct', id: RUN, reason: '' })).json.error === 'payroll_reason_required', '사유 없이 정정할 수 없다');
  const cr = await post({ action: 'run.correct', id: RUN, reason: 'e2e 근무일 잘못 넣음' });
  const CR = cr.json.id as string;
  check(cr.status === 200 && !!CR, '정정 판을 만든다', JSON.stringify(cr.json));
  check((await post({ action: 'run.correct', id: RUN, reason: '또 정정' })).json.error === 'payroll_correction_exists', '진행 중인 정정이 있으면 또 만들 수 없다');
  const crun = async () => (await db.from('payroll_runs').select('status, version, current_generation_id, revision, supersedes_id').eq('id', CR).single()).data!;
  let cv = await crun();
  check(cv.revision === 2 && cv.supersedes_id === RUN, '정정 판은 2판이고 1판을 가리킨다');
  const half = (await rows(P1)).find((x) => x.segment_key === 'B')!;
  check((await post({ action: 'work.status', id: half.id, expectedVersion: half.version, status: 'VOID' })).status === 200, '정정 중에는 원본에 든 근무(0.5공수 구간)를 무효로 할 수 있다');
  await post({ action: 'run.calculate', id: CR, expectedVersion: cv.version });
  cv = await crun();
  const { data: cs } = await db.from('payroll_daily_statements').select('gross_total, work_days').eq('generation_id', cv.current_generation_id).eq('payee_id', P1).single();
  check(Number(cs?.work_days) === 2 && Number(cs?.gross_total) === 360000, '정정 판 계산: 0.5공수(10만원)가 빠져 2공수 · 360,000 (원본의 근무를 다시 센다)', JSON.stringify(cs));
  await post({ action: 'run.review', id: CR, expectedVersion: cv.version });
  cv = await crun();
  await post({ action: 'run.finalize', id: CR, expectedVersion: cv.version });
  check((await crun()).status === 'FINALIZED' && (await run()).status === 'FINALIZED', '정정 판 확정 — 원본도 그대로 남는다');
  const orig = await open(`/admin/payroll/daily/runs/${RUN}`);
  check(orig.includes('2판으로 정정되었습니다') && !orig.includes('정정하기'), '원본 화면: 「2판으로 정정되었습니다」 · 더는 정정할 수 없다');
  const corr = await open(`/admin/payroll/daily/runs/${CR}`);
  check(corr.includes('정정 판입니다') && corr.includes('e2e 근무일 잘못 넣음') && corr.includes('2판'), '정정 판 화면: 사유 · 판 번호');

  // ── 다른 화면과 섞이지 않는다 · 권한 · 기록 ──
  const list = await open('/admin/payroll/daily?v=runs');
  check(list.includes(`${M} 일용 1차`) && list.includes(`${M} 일용 2차`) && list.includes('확정') && (await p.locator('nav a[href="/admin/payroll/daily"]').count()) >= 1, '일용 대장 목록과 왼쪽 메뉴');
  check(!(await open(`/admin/payroll/runs/${RUN}`)).includes('453,750') && (await postTo(p, `/api/admin/payroll/runs/${RUN2}`, { action: 'calculate', expectedVersion: r2.version })).status === 404, '일용 대장은 정규 급여대장 화면 · 처리로 열리지 않는다');
  check((await postTo(q, API, { action: 'payee.add', internalNo: `e2e-x-${TAG}`, name: 'x' })).status === 403 && !(await (async () => { await q.goto(`${BASE}/admin/payroll/daily/runs/${RUN}`); await q.waitForLoadState('networkidle'); return q.locator('body').innerText(); })()).includes('453,750'), '직원은 일용직 화면을 쓰거나 볼 수 없다');
  const { data: acts } = await db.from('payroll_audit_events').select('action').eq('actor_id', ADM.id).like('action', 'daily.%').gte('created_at', started);
  const seen = new Set((acts ?? []).map((a) => a.action as string));
  check(['daily.payee.add', 'daily.engagement.add', 'daily.work.add', 'daily.work.confirm', 'daily.work.void', 'daily.run.create', 'daily.run.calculate', 'daily.run.review', 'daily.run.finalize'].every((a) => seen.has(a)), '대상자 · 근무 · 대장 처리가 급여 기록에 남는다', [...seen].join(','));
  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
  // 남은 초안 · 확정 근무(확정 대장에 들지 않은 것)는 무효로, 고용 기간 · 대상자는 끈다
  if (payeeIds.length) {
    const { data: left } = await db.from('payroll_daily_work').select('id, version').in('payee_id', payeeIds).neq('status', 'VOID').gte('work_date', d(5));
    for (const w of left ?? []) await db.from('payroll_daily_work').update({ status: 'VOID', version: (w.version as number) + 1 }).eq('id', w.id);
    await db.from('payroll_payee_engagements').update({ active: false }).in('payee_id', payeeIds);
    await db.from('payroll_payees').update({ active: false }).in('id', payeeIds);
  }
  await db.from('profiles').update({ can_view_payroll: false }).eq('id', ADM.id);
  await db.from('profiles').update({ role: 'employee', active: false }).eq('id', A.id);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
