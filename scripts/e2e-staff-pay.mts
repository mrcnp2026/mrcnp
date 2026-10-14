// 사원별 급여(계약 · 세무 · 개인 항목) 화면 검사 (2026-10-13) — 검사 전용 관리자(e2e-audit, 급여 담당)가 다른 검사 계정(e2e-audit2)의 계약을 넣고 고친다.
//   npx tsx scripts/e2e-staff-pay.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 계약 · 세무는 지울 수 없는 표다. 검사가 넣은 판은 끝에 「거둠(withdrawn)」으로 바꾸고 개인 항목은 끈다 — 다음 검사가 빈 상태에서 시작한다.
// 검사 계정은 사원별 급여 목록에 나오지 않는다(e2e- 계정 제외) → 목록은 열리는지만 본다.
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
const { data: emp } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit').single();
const { data: other } = await db.from('profiles').select('id, name').eq('employee_no', 'e2e-audit2').single();
const day = (n: number) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const cleanup = async () => {
  await db.from('payroll_contract_versions').update({ status: 'withdrawn' }).eq('employee_id', other!.id).eq('status', 'active');
  await db.from('payroll_employee_tax_versions').update({ status: 'withdrawn' }).eq('employee_id', other!.id).eq('status', 'active');
  await db.from('payroll_employee_items').update({ active: false }).eq('employee_id', other!.id).eq('active', true);
};
await cleanup();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', can_view_payroll: true }).eq('id', emp!.id);
await db.from('profiles').update({ active: true }).eq('id', other!.id); // 엑셀 양식은 재직 중인 직원만 담는다
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

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
  const api = `/api/admin/payroll/staff/${other!.id}`;
  const post = (body: unknown, url = api) => p.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  const open = async (url: string) => {
    await p.goto(`${BASE}${url}`);
    await p.waitForLoadState('networkidle');
    return p.locator('body').innerText();
  };
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  const list = await open('/admin/payroll/staff');
  check(list.includes('사원별 급여') && list.includes('설정 상태') && !list.includes(other!.name), '사원별 급여 목록이 열린다 (검사 계정은 안 나온다)');
  check((await p.locator('a[href="/admin/payroll/staff"]').count()) >= 1, '왼쪽 메뉴에 사원별 급여');
  await shot('staffpay-1-list');

  // ── 계약 ──
  let page = await open(`/admin/payroll/staff/${other!.id}`);
  check(page.includes(other!.name) && page.includes('계약이 없습니다.') && page.includes('세무 · 보험 설정이 없습니다.'), '상세: 계약 · 세무가 없다고 알려 준다');
  await p.getByRole('button', { name: '계약 넣기' }).click();
  await p.getByRole('spinbutton', { name: '월급 (원)' }).fill('3000000');
  await p.locator('input[name="monthlyHours"]').fill('209');
  await p.locator('input[name="ot"]').fill('40');
  await p.locator('input[name="validFrom"]').first().fill(day(-30));
  await p.getByRole('button', { name: '새 판으로 저장' }).click();
  await p.getByText('3,000,000원').first().waitFor({ timeout: 20000 });
  const { data: c1 } = await db.from('payroll_contract_versions').select('version, pay_type, amount, monthly_hours, included, valid_from, valid_to').eq('employee_id', other!.id).eq('status', 'active');
  const v = (c1?.[0]?.version as number) ?? 0; // 거둔 판이 있으면 판 번호는 이어서 올라간다
  check(c1?.length === 1 && Number(c1[0].amount) === 3000000 && Number(c1[0].monthly_hours) === 209 && (c1[0].included as { overtimeHours: number }).overtimeHours === 40 && c1[0].valid_to === null, '계약 1판 저장', JSON.stringify(c1));
  page = await p.locator('body').innerText();
  check(page.includes('14,354원') && page.includes('연장 40시간'), '통상시급(참고) 14,354원 · 포함 연장 40시간');
  await shot('staffpay-2-contract');

  check((await post({ action: 'contract', expectedVersion: v + 7, validFrom: day(0), reason: '인상', payType: 'MONTHLY', amount: 3200000, timeBasis: 'ROUNDED', monthlyHours: 209 })).status === 409, '판 번호가 다르면 저장되지 않는다');
  check((await post({ action: 'contract', expectedVersion: v, validFrom: day(-30), reason: '인상', payType: 'MONTHLY', amount: 3200000, timeBasis: 'ROUNDED', monthlyHours: 209 })).status === 422, '시작일이 앞 판과 같으면 거부');
  check((await post({ action: 'contract', expectedVersion: v, validFrom: day(0), reason: null, payType: 'MONTHLY', amount: 3200000, timeBasis: 'ROUNDED', monthlyHours: 209 })).status === 422, '고칠 때 사유가 없으면 거부');
  check((await post({ action: 'contract', expectedVersion: v, validFrom: day(0), reason: '인상', payType: 'MONTHLY', amount: 0, timeBasis: 'ROUNDED' })).json.error === 'contract_amount', '금액 0은 거부');
  const up = await post({ action: 'contract', expectedVersion: v, validFrom: day(0), reason: '인상', payType: 'MONTHLY', amount: 3200000, timeBasis: 'ROUNDED', monthlyHours: 209, included: { overtimeHours: 40 } });
  const { data: c2 } = await db.from('payroll_contract_versions').select('version, amount, valid_from, valid_to').eq('employee_id', other!.id).eq('status', 'active').order('version');
  check(up.status === 200 && c2?.length === 2 && c2[0].valid_to === day(0) && c2[1].valid_to === null && Number(c2[1].amount) === 3200000, '고치면 2판이 쌓이고 1판은 새 시작일로 닫힌다', JSON.stringify(c2));
  page = await open(`/admin/payroll/staff/${other!.id}`);
  check(page.includes('3,200,000원') && page.includes(`${v}판`) && page.includes(`${v + 1}판`) && page.includes('인상'), '화면: 지금 계약 3,200,000원 + 이력 2줄');

  // ── 세무 · 보험 ──
  const tax = (over: Record<string, unknown> = {}) => ({
    action: 'tax', expectedVersion: 0, validFrom: day(-30), reason: null, withholdingRatio: 100, familyCount: 3, childCount: 1,
    insurance: { pension: { state: 'YES', reportedWage: 3000000 }, health: { state: 'YES' }, employment: { state: 'YES' }, accident: { state: 'UNKNOWN' } }, studentLoan: { state: 'NO' }, ...over,
  });
  check((await post(tax({ childCount: 3 }))).json.error === 'tax_child', '자녀가 가족 수보다 많으면 거부');
  check((await post(tax({ insurance: { pension: { state: 'NO' }, health: { state: 'YES' }, employment: { state: 'YES' }, accident: { state: 'YES' } } }))).json.error === 'tax_insurance_reason', '가입 안 함인데 근거가 없으면 거부');
  check((await post(tax())).status === 200, '세무 1판 저장 (산재 = 모름)');
  page = await open(`/admin/payroll/staff/${other!.id}`);
  check(page.includes('보험 가입 여부가 「모름」인 것이 있습니다.') && page.includes('3명 (그중 자녀 1명)'), '모름이 남으면 「설정 미완료」 사유로 보인다');
  await p.getByRole('button', { name: '세무 · 보험 고치기 (새 판)' }).click();
  const taxForm = p.locator('form', { has: p.locator('select[name="accident.state"]') });
  await taxForm.locator('select[name="accident.state"]').selectOption('YES');
  await taxForm.locator('input[name="validFrom"]').fill(day(0));
  await taxForm.locator('input[name="reason"]').fill('확인함');
  await taxForm.getByRole('button', { name: '새 판으로 저장' }).click();
  await taxForm.waitFor({ state: 'detached', timeout: 20000 }); // 저장되면 양식이 닫힌다
  const { data: t2 } = await db.from('payroll_employee_tax_versions').select('version, insurance, valid_to').eq('employee_id', other!.id).eq('status', 'active').order('version');
  check(t2?.length === 2 && (t2[1].insurance as { accident: { state: string } }).accident.state === 'YES' && t2[0].valid_to === day(0), '세무 2판: 산재 가입으로', JSON.stringify(t2?.map((x) => x.version)));
  await shot('staffpay-3-tax');

  // ── 개인 항목 ──
  const { data: items } = await db.from('payroll_item_versions').select('code, ko_name').eq('status', 'active').eq('in_use', true).is('valid_to', null).limit(1);
  if (!items?.length) console.log('ℹ️ 쓸 수 있는 지급 · 공제 항목이 없어 개인 항목 검사는 건너뛴다');
  else {
    const code = items[0].code as string;
    check((await post({ action: 'item.add', itemCode: 'NO_SUCH_ITEM', amount: 1, validFrom: day(0) })).status === 404, '없는 항목은 붙일 수 없다');
    check((await post({ action: 'item.add', itemCode: code, amount: 150000, validFrom: day(-30), note: 'e2e' })).status === 200, '개인 항목 붙이기');
    check((await post({ action: 'item.add', itemCode: code, amount: 1, validFrom: day(0) })).status === 409, '같은 항목을 겹쳐 붙일 수 없다');
    page = await open(`/admin/payroll/staff/${other!.id}`);
    check(page.includes(items[0].ko_name as string) && page.includes('150,000원'), '화면에 붙인 항목과 금액');
    const { data: row } = await db.from('payroll_employee_items').select('id').eq('employee_id', other!.id).eq('active', true).single();
    check((await post({ action: 'item.end', itemId: row!.id, endOn: day(1) })).status === 200 && (await db.from('payroll_employee_items').select('valid_to').eq('id', row!.id).single()).data?.valid_to === day(1), '개인 항목 끝내기 — 끝나는 날이 적힌다');
  }

  // ── 엑셀 올리기 (2026-10-14) — 양식 받기 → 고쳐 올리기 → 빨간 칸 → 적용 ──
  await cleanup(); // 계약 판을 비우고 시작한다(엑셀로 넣는 것이 첫 판이 되게)
  await open('/admin/payroll/staff');
  const tpl = await p.evaluate(async () => { const r = await fetch('/api/admin/payroll/staff/import'); return { status: r.status, bytes: Array.from(new Uint8Array(await r.arrayBuffer())) }; });
  const wbI = new ExcelJS.Workbook();
  await wbI.xlsx.load(Buffer.from(tpl.bytes) as unknown as ArrayBuffer);
  const wsI = wbI.worksheets[0];
  let otherRow = 0;
  wsI.eachRow((r, n) => { if (String(r.getCell(1).value) === 'e2e-audit2') otherRow = n; });
  check(tpl.status === 200 && otherRow > 2 && String(wsI.getRow(2).getCell(1).value) === '사번', '양식 받기: 머리줄(사번 …)과 검사 계정 줄이 들어 있다', `${tpl.status} 줄 ${otherRow}`);
  wsI.getRow(otherRow).values = ['e2e-audit2', other!.name, '월급', 2_500_000, '끊은 급여용 시간', 209, ''];
  const badRow = wsI.addRow(['e2e-nobody', '없는 사람', '월급', '', '끊은 급여용 시간', 209, '']).number;
  const upload = async (wb: ExcelJS.Workbook) => {
    await p.locator('[data-import-file]').setInputFiles({ name: 'contracts.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
    await p.locator('table[data-import-preview]').waitFor({ timeout: 30000 });
    await p.waitForLoadState('networkidle');
  };
  await upload(wbI);
  const prev = await p.locator('table[data-import-preview]').innerText();
  check(prev.includes('없는 사번') && prev.includes('비어 있음') && prev.includes('바뀜') && (await p.getByRole('button', { name: /바뀐 1명 적용/ }).isDisabled()), '미리보기: 없는 사번 · 빈 금액은 빨간 칸, 틀린 줄이 있으면 적용을 막는다');
  wsI.getRow(badRow).values = ['', '', '', '', '', '', '']; // 틀린 줄을 비운다(빈 줄은 건너뛴다)
  await upload(wbI);
  await p.getByText('틀린 줄 0').waitFor({ timeout: 30000 }); // 새로 올린 파일의 미리보기가 뜰 때까지
  p.once('dialog', (d) => d.accept());
  await p.getByRole('button', { name: /바뀐 1명 적용/ }).click();
  await p.locator('table[data-import-preview]').getByText('저장됨').waitFor({ timeout: 30000 });
  const { data: imported } = await db.from('payroll_contract_versions').select('amount, pay_type, monthly_hours').eq('employee_id', other!.id).eq('status', 'active');
  check(imported?.length === 1 && Number(imported[0].amount) === 2_500_000 && imported[0].pay_type === 'MONTHLY' && Number(imported[0].monthly_hours) === 209, '적용: 바뀐 사람만 새 판으로 저장된다', JSON.stringify(imported));
  await shot('staffpay-5-import');

  // ── 기록 · 권한 ──
  const { data: audit } = await db.from('payroll_audit_events').select('action, detail').eq('employee_id', other!.id).order('id', { ascending: false }).limit(20);
  check((audit ?? []).some((a) => a.action === 'contract.save') && (audit ?? []).some((a) => a.action === 'tax.save') && !JSON.stringify(audit).includes('3200000'), '급여 전용 기록에 남고, 금액은 적히지 않는다');
  const { count: leaked } = await db.from('audit_logs').select('id', { count: 'exact', head: true }).in('target_table', ['payroll_contract_versions', 'payroll_employee_tax_versions', 'payroll_employee_items']);
  check((leaked ?? 0) === 0, '공용 변경 기록에는 계약 · 세무가 들어가지 않는다');
  await db.from('profiles').update({ can_view_payroll: false }).eq('id', emp!.id);
  check((await post({ action: 'contract', expectedVersion: v + 1, validFrom: day(5), reason: 'x', payType: 'MONTHLY', amount: 1, timeBasis: 'ROUNDED' })).status === 403, '급여 담당이 아닌 관리자는 저장하지 못한다');
  const denied = await open(`/admin/payroll/staff/${other!.id}`);
  check(denied.includes('급여 담당 관리자만 볼 수 있습니다.') && !denied.includes('3,200,000'), '급여 담당이 아닌 관리자에게는 금액이 보이지 않는다');
  check(!(await open('/admin/payroll/staff')).includes('설정 상태'), '목록도 보이지 않는다');
  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
  await cleanup();
  await db.from('profiles').update({ can_view_payroll: false }).eq('id', emp!.id);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
