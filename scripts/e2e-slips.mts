// 급여명세서 올리기 검사 (2026-10-16, 묶음 14) — 임시 검사 계정 둘(급여 담당 관리자 · 직원)을 만들어
// 엑셀 올리기 → 미리보기(칸 짐작 · 칸 바꾸기 · 막힌 줄) → 공개 → 다시 올리기(판 2) → 직원 「내 급여」 → 회수 → 직원 화면에서 사라짐 을 확인하고,
// 끝나면 검사 계정과 그 계정이 남긴 자료를 모두 지운다(운영 DB에 남기지 않는다).
//   npx tsx scripts/e2e-slips.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import ExcelJS from 'exceljs';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { chromium, type Page } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CONSENT_VERSION = (await import('../src/config/consent.ts')).CONSENT.version;
const M = '2026-08';

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};

async function account(no: string, name: string, role: 'admin' | 'employee') {
  const { data: u, error } = await db.auth.admin.createUser({ email: `${no}@staff.invalid`, email_confirm: true });
  if (error) throw new Error(`createUser ${no}: ${error.message}`);
  const id = u.user!.id;
  await db.from('profiles').insert({ id, name, employee_no: no, role, locale: 'ko', active: true, can_view_payroll: role === 'admin' });
  await db.from('consents').insert({ employee_id: id, kind: 'privacy_location', version: CONSENT_VERSION, locale: 'ko' });
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return { id, token };
}

/** 검사 계정과 그 계정을 가리키는 모든 기록을 지운다 — 외래키를 따라, 보호 장치는 이 트랜잭션에서만 끈다 */
async function cleanup(ids: string[]) {
  if (ids.length === 0) return;
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('begin');
    await c.query('set local session_replication_role = replica');
    const fks = (await c.query(`select c.conrelid::regclass::text child, a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid='public.profiles'::regclass and c.conrelid <> 'public.profiles'::regclass`)).rows as { child: string; col: string }[];
    for (const f of fks) await c.query(`delete from public.${f.child} where ${f.col}::text = any($1::text[])`, [ids]);
    await c.query(`delete from public.decision_log where decided_by::text = any($1::text[])`, [ids]);
    await c.query(`delete from public.profiles where id::text = any($1::text[])`, [ids]);
    await c.query('set local session_replication_role = origin');
    const left = (await c.query(`select count(*)::int n from public.payroll_uploaded_slips where employee_id::text = any($1::text[]) or uploaded_by::text = any($1::text[])`, [ids])).rows[0].n;
    await c.query('commit');
    for (const id of ids) await db.auth.admin.deleteUser(id);
    console.log(`정리: 검사 계정 ${ids.length}개와 자료 삭제 (남은 명세서 ${left})`);
  } catch (e) {
    await c.query('rollback');
    console.log(`❌ 정리 실패: ${(e as Error).message}`);
    fails++;
  } finally {
    await c.end();
  }
}

async function sheet(rows: (string | number)[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('8월');
  for (const r of rows) ws.addRow(r);
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'slips-')), `급여대장-${M}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}

const made: string[] = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const adm = await account('e2e-slip-adm', '검사 급여담당', 'admin');
  made.push(adm.id);
  const emp = await account('e2e-slip-emp', '검사 직원', 'employee');
  made.push(emp.id);

  const login = async (token: string, width = 1280): Promise<Page> => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => check(false, '화면 오류 없음', e.message));
    await p.goto(`${BASE}/register?token=${token}`);
    await createPassword(p);
    return p;
  };
  const shot = async (p: Page, name: string) => {
    if (!SHOTS) return;
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  const a = await login(adm.token);

  // 입구: 급여대장 목록의 버튼 · 메뉴
  await a.goto(`${BASE}/admin/payroll/runs`);
  await a.waitForLoadState('networkidle');
  check(await a.locator('[data-slip-entry]').isVisible(), '급여대장 목록에 「명세서 엑셀 올리기」 버튼');
  await a.locator('[data-slip-entry]').click();
  await a.waitForURL(/\/admin\/payroll\/slips/);
  await a.goto(`${BASE}/admin/payroll/slips?m=${M}`);
  await a.waitForLoadState('networkidle');
  check(await a.locator('[data-slip-upload]').isVisible(), '올리기 화면(DB 표 있음 — 묶음 14 적용)');

  // 1차: 회사 엑셀 모양 — 제목 줄 · 빈 줄 · 머리 · 두 사람 · 합계 줄
  const f1 = await sheet([
    ['2026년 8월 급여대장'],
    [],
    ['사번', '성명', '부서', '기본급', '식대', '특근비', '국민연금', '소득세', '지급합계', '공제합계', '차인지급액'],
    ['e2e-slip-emp', '검사 직원', '생산', 2500000, 200000, 50000, 112500, 30000, 2750000, 142500, 2607500],
    ['e2e-slip-adm', '검사 급여담당', '관리', 3000000, 200000, 0, 135000, 60000, 3200000, 195000, 3005000],
    ['', '합계', '', 5500000, 400000, 50000, 247500, 90000, 5950000, 337500, 5612500],
  ]);
  const pick = async (file: string) => {
    const [chooser] = await Promise.all([a.waitForEvent('filechooser'), a.locator('[data-slip-pick]').click()]);
    await Promise.all([a.waitForResponse((r) => r.url().endsWith('/api/admin/payroll/slips') && r.request().method() === 'POST', { timeout: 60000 }), chooser.setFiles(file)]);
    await a.locator('[data-slip-rows]').waitFor({ timeout: 30000 });
  };
  await pick(f1);
  const rowsText = await a.locator('[data-slip-rows] tbody tr').allInnerTexts();
  check(rowsText.length === 2, '미리보기 2명(합계 줄은 건너뜀)', String(rowsText.length));
  check(rowsText.every((t) => t.includes('정상')), '두 줄 모두 정상(합계 일치)', rowsText.join(' | '));
  const guessedCol = a.locator('[data-slip-columns] li', { hasText: '특근비' });
  check(await guessedCol.getByText('짐작').isVisible(), '모르는 칸(특근비)은 「짐작」 표시 · 지급');
  await shot(a, 'slips-1-preview');
  // 칸 바꾸기 → 합계가 달라져 막힘 → 되돌리면 정상
  await Promise.all([a.waitForResponse((r) => r.url().endsWith('/api/admin/payroll/slips')), guessedCol.locator('select').selectOption('SKIP')]);
  await a.waitForTimeout(500);
  check((await a.locator('[data-slip-rows] tbody tr', { hasText: '검사 직원' }).innerText()).includes('다름'), '특근비를 「안 씀」으로 바꾸면 합계 다름으로 막힘');
  check(await a.locator('[data-slip-apply]').isDisabled(), '막힌 줄이 있으면 공개 버튼이 꺼짐');
  await Promise.all([a.waitForResponse((r) => r.url().endsWith('/api/admin/payroll/slips')), guessedCol.locator('select').selectOption('PAYMENT')]);
  await a.waitForTimeout(500);
  check(await a.locator('[data-slip-apply]').isEnabled(), '되돌리면 다시 공개 가능');
  await a.locator('[data-slip-apply]').click();
  await Promise.all([a.waitForResponse((r) => r.url().endsWith('/api/admin/payroll/slips') && r.status() === 200, { timeout: 60000 }), a.locator('[data-slip-confirm]').click()]);
  await a.locator('[data-slip-done]').waitFor({ timeout: 30000 });
  check(true, '공개 완료 안내');
  await a.waitForTimeout(2000);
  const before = await a.locator('#slip-list tbody tr').count();
  await a.reload();
  await a.waitForLoadState('networkidle');
  const after = await a.locator('#slip-list tbody tr').count();
  check(before === 3, '공개 직후(새로고침 없이) 목록 2명 + 합계 줄', String(before));
  check(after === 3, '다시 열어도 목록 2명 + 합계 줄', String(after));
  const { data: s1 } = await db.from('payroll_uploaded_slips').select('net_total, revision, state, is_test, lines').eq('employee_id', emp.id);
  check(s1?.length === 1 && Number(s1[0].net_total) === 2607500 && s1[0].revision === 1 && s1[0].state === 'PUBLISHED', 'DB: 직원 명세서 1장 · 실지급 2,607,500', JSON.stringify(s1?.map((x) => [x.net_total, x.revision, x.state, x.is_test])));
  check((s1?.[0].lines as { label: string }[]).some((l) => l.label === '특근비'), 'DB: 특근비 줄 저장');
  await shot(a, 'slips-2-published');

  // 2차: 직원 금액만 고쳐서 다시 → 판 2
  const f2 = await sheet([
    ['사번', '성명', '기본급', '소득세', '차인지급액'],
    ['e2e-slip-emp', '검사 직원', 2600000, 30000, 2570000],
  ]);
  await pick(f2);
  await a.locator('[data-slip-apply]').click();
  await Promise.all([a.waitForResponse((r) => r.url().endsWith('/api/admin/payroll/slips') && r.status() === 200, { timeout: 60000 }), a.locator('[data-slip-confirm]').click()]);
  await a.locator('[data-slip-done]').waitFor({ timeout: 30000 });
  const { data: s2 } = await db.from('payroll_uploaded_slips').select('revision, state').eq('employee_id', emp.id).order('revision');
  check(JSON.stringify(s2) === JSON.stringify([{ revision: 1, state: 'REPLACED' }, { revision: 2, state: 'PUBLISHED' }]), '다시 올리면 앞 판 「바뀜」 · 새 판 2', JSON.stringify(s2));

  // 직원 화면
  const e = await login(emp.token, 390);
  await e.goto(`${BASE}/punch/payslips?m=${M}`);
  await e.waitForLoadState('networkidle');
  const body = await e.locator('main').innerText();
  check(body.includes('2,570,000'), '직원 「내 급여」 목록에 8월 명세서(판 2, 실지급 2,570,000)');
  await e.goto(`${BASE}${await e.locator('a[href^="/punch/payslips/"]').first().getAttribute('href')}`);
  await e.waitForLoadState('networkidle');
  const one = await e.locator('main').innerText();
  check(one.includes('기본급') && one.includes('2,600,000') && one.includes('소득세'), '명세서 한 장: 기본급 2,600,000 · 소득세 줄', one.replace(/\s+/g, ' ').slice(0, 160));
  await shot(e, 'slips-3b-one');
  await e.goto(`${BASE}/punch/payslips?m=${M}`);
  await shot(e, 'slips-3-employee');
  const pdf = await e.evaluate(async () => { const id = new URL((document.querySelector('a[href^="/api/payslips/"]') as HTMLAnchorElement).href).pathname.split('/')[3]; const r = await fetch(`/api/payslips/${id}/pdf`); return { s: r.status, t: r.headers.get('content-type') }; });
  check(pdf.s === 200 && (pdf.t ?? '').includes('pdf'), '직원 명세서 PDF 인쇄', JSON.stringify(pdf));

  // 회수 → 직원 화면에서 사라짐
  await a.goto(`${BASE}/admin/payroll/slips?m=${M}`);
  await a.waitForLoadState('networkidle');
  const row = a.locator('#slip-list tbody tr', { hasText: '검사 직원' });
  await row.locator('[data-slip-withdraw]').click();
  await row.locator('input').fill('금액 확인 필요');
  await Promise.all([a.waitForResponse((r) => r.url().includes('/slips/withdraw')), row.getByRole('button', { name: '회수', exact: true }).click()]);
  await a.waitForTimeout(800);
  const { data: s3 } = await db.from('payroll_uploaded_slips').select('state').eq('employee_id', emp.id).eq('revision', 2).single();
  check(s3?.state === 'WITHDRAWN', '회수 → DB 상태 회수');
  await e.reload();
  await e.waitForLoadState('networkidle');
  check(!(await e.locator('main').innerText()).includes('2,570,000'), '회수하면 직원 화면에서 사라짐');

  // 권한: 직원은 올리기 · 회수 불가
  const no = await e.evaluate(async () => (await fetch('/api/admin/payroll/slips/withdraw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: ['00000000-0000-0000-0000-000000000000'], reason: '권한 시험' }) })).status);
  check(no === 403, '직원은 회수 API 403', String(no));
} catch (err) {
  check(false, '검사 중단', (err as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await cleanup(made);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);
