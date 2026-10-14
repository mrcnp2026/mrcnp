// 리포트 · 조직도 화면 검사 (2026-10-13, M8) — 검사 전용 관리자(e2e-audit)로 근태 리포트 · 휴가 리포트를 열고 엑셀을 받아 화면의 합계와 맞는지 본다. 직원용 조직도와 휴가 화면도 연다.
//   npx tsx scripts/e2e-reports.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 읽기만 한다 — 내려받기 기록(download_logs) 말고는 아무것도 만들지 않는다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import ExcelJS from 'exceljs';
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
  const open = async (url: string) => {
    await p.goto(`${BASE}${url}`);
    await p.waitForLoadState('networkidle');
    return p.locator('body').innerText();
  };
  const xlsx = async (url: string) => {
    const r = await p.evaluate(async (u) => { const res = await fetch(u); const b = new Uint8Array(await res.arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return { status: res.status, b64: btoa(s) }; }, url);
    const wb = new ExcelJS.Workbook();
    if (r.status === 200) await wb.xlsx.load(Buffer.from(r.b64, 'base64') as unknown as ArrayBuffer);
    return { status: r.status, wb };
  };
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);

  // ── 근태 리포트 ──
  const att = await open('/admin/reports/attendance');
  check(att.includes('근태 리포트') && att.includes('부서별') && att.includes('합계') && att.includes('직원별'), '근태 리포트가 열린다');
  check((await p.locator('nav a[href="/admin/reports/attendance"], nav a[href="/admin/reports/leave"]').count()) >= 2, '왼쪽 메뉴 리포트 아래에 근태 · 휴가 리포트');
  const totalRow = p.locator('table').first().locator('tr', { hasText: '합계' }).locator('td');
  const peopleOnScreen = Number((await totalRow.nth(1).innerText()).trim());
  const closeOnScreen = (await totalRow.last().innerText()).trim();
  await shot('report-1-attendance');
  const month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
  const a = await xlsx(`/api/admin/reports/attendance?m=${month}`);
  const names = a.wb.worksheets.map((w) => w.name);
  check(a.status === 200 && JSON.stringify(names) === JSON.stringify(['부서별', '직원별', '메타']), '근태 리포트 엑셀: 부서별 · 직원별 · 메타 시트', names.join(','));
  const sum = a.wb.getWorksheet('부서별')!;
  let last = 0;
  sum.eachRow((row, i) => { if (row.getCell(1).value === '합계') last = i; });
  const xlPeople = Number(sum.getRow(last).getCell(2).value);
  const xlClosed = Number(sum.getRow(last).getCell(3).value);
  check(last > 0 && xlPeople === peopleOnScreen && closeOnScreen === `${xlClosed}/${xlPeople}명`, '화면의 합계와 엑셀의 합계가 같다 (대상 · 마감)', `화면 ${peopleOnScreen} · ${closeOnScreen} / 엑셀 ${xlPeople} · ${xlClosed}`);
  const empRows = a.wb.getWorksheet('직원별')!.rowCount - 2;
  check(empRows === (await p.locator('table:not([data-policy-groups]):not([data-type-use])').nth(1).locator('tbody tr').count()), '직원 수가 화면과 엑셀에서 같다', String(empRows));
  check(!JSON.stringify(a.wb.getWorksheet('직원별')!.getSheetValues()).includes('검사용2') && !JSON.stringify(a.wb.getWorksheet('직원별')!.getSheetValues()).includes('검사용3'), '꺼진 검사 계정은 리포트에 들어가지 않는다 (실제 관리자에게는 검사 계정이 아예 없다 — 보는 사람에 따라 숨김)');
  const { data: groups } = await db.from('org_groups').select('id, name').eq('active', true).is('parent_id', null).limit(1);
  if (groups?.length) {
    const filtered = await open(`/admin/reports/attendance?g=${groups[0].id}&basis=current`);
    const n = await p.locator('table').nth(1).locator('tbody tr').count();
    const f = await xlsx(`/api/admin/reports/attendance?m=${month}&g=${groups[0].id}&basis=current`);
    check(filtered.includes('근태 리포트') && f.wb.getWorksheet('직원별')!.rowCount - 2 === n && JSON.stringify(f.wb.getWorksheet('메타')!.getSheetValues()).includes(groups[0].name as string), '부서로 걸러도 화면과 엑셀이 같고, 엑셀에 조건이 적힌다', `${n}명`);
  }
  check((await xlsx('/api/admin/reports/attendance?m=2099-01')).status === 400, '앞날의 달은 거부');

  // ── 휴가 리포트 ──
  const lv = await open('/admin/reports/leave');
  check(lv.includes('휴가 리포트') && lv.includes('소진율') && lv.includes('부서별'), '휴가 리포트가 열린다');
  check(lv.includes('휴가 정책 그룹별') && (await p.locator('table[data-policy-groups] tbody tr').count()) >= 1 && lv.includes('휴가 종류별 사용'), '휴가 정책 그룹별 · 휴가 종류별 사용 표 (2026-10-15)');
  await shot('report-2-leave');
  const l = await xlsx('/api/admin/reports/leave');
  check(l.status === 200 && JSON.stringify(l.wb.worksheets.map((w) => w.name)) === JSON.stringify(['부서별', '직원별', '정책그룹별', '종류별 사용', '메타']), '휴가 리포트 엑셀');
  check(l.wb.getWorksheet('직원별')!.rowCount - 2 === (await p.locator('table:not([data-policy-groups]):not([data-type-use])').nth(1).locator('tbody tr').count()), '휴가 리포트도 직원 수가 화면과 엑셀에서 같다');
  check(JSON.stringify(l.wb.getWorksheet('메타')!.getSheetValues()).includes('사용 ÷ 받은 연차'), '엑셀에 소진율의 분모가 적혀 있다');
  const inact = await open('/admin/reports/leave?inactive=1');
  check(inact.includes('휴가 리포트'), '퇴사자 포함 조건으로도 열린다');

  // ── 직원: 조직도 · 휴가 사용 현황 ──
  const org = await open('/punch/org');
  check(org.includes('조직도') && !org.includes('검사용'), '직원용 조직도가 열리고 검사 계정은 안 보인다');
  const { data: someone } = await db.from('profiles').select('name, phone').eq('active', true).not('employee_no', 'like', 'e2e-%').limit(1);
  if (someone?.length) {
    check(org.includes(someone[0].name as string), '조직도에 직원 이름이 보인다');
    if (someone[0].phone) check(!org.includes(someone[0].phone as string), '조직도에 전화번호는 보이지 않는다');
    const found = await open(`/punch/org?q=${encodeURIComponent((someone[0].name as string).slice(0, 2))}`);
    check(found.includes(someone[0].name as string), '이름으로 찾을 수 있다');
  }
  check((await open('/punch/org?q=zzzz-없는사람')).includes('찾는 사람이 없습니다.'), '없는 이름은 「없다」고 나온다');
  await p.setViewportSize({ width: 390, height: 844 });
  await open('/punch/org');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, '폰 폭에서 조직도가 가로로 넘치지 않는다');
  await shot('report-3-org-phone');
  const leave = await open('/punch/leave');
  check(leave.includes('휴가') && errors.length === 0, '직원 휴가 화면이 오류 없이 열린다');
  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
