// 월간 근태 확인서 엑셀 실제 서버 검사 (②-4 7-5). 검사 전용 직원(e2e-audit, 관리자로 잠시 켬)으로 이번 달 파일을 받아:
//   4시트 · 시트1 수식 없음 · 한글 파일 이름 · download_logs 한 줄 · 직원(관리자 아님)은 403
//   npx tsx scripts/e2e-report.mts [저장 경로.xlsx]   (BASE·APP_ORIGIN을 같은 주소로)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import ExcelJS from 'exceljs';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { hasFormula } from '../src/lib/export-xlsx';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const OUT = process.argv[2];
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp!.id);
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const ym = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date());

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(`${BASE}/register?token=${token}`);
  await p.getByRole('button', { name: /이 폰 등록하기/ }).click();
  await p.getByText('폰이 등록되었습니다.').waitFor({ timeout: 20000 });

  // 기록 탭의 버튼으로 받는다 (화면 → 경로 연결까지 확인)
  await p.goto(`${BASE}/admin/records?m=${ym}`);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('link', { name: '내려받기' }).first().click()]);
  const name = dl.suggestedFilename();
  check(/^근태확인서_.+_\d{4}-\d{2}_\d{12}(_미잠금)?(_연습)?\.xlsx$/.test(name), '한글 파일 이름 규칙', name);
  const file = OUT ?? path.join(import.meta.dirname, '..', 'shots', 'report.xlsx');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await dl.saveAs(file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  check(wb.worksheets.map((w) => w.name).join(',') === '월간근태확인서,원본데이터,정정이력,적용기준', '시트 4개', wb.worksheets.map((w) => w.name).join(','));
  check(!hasFormula(wb.getWorksheet('월간근태확인서')!), '시트1 수식 없음');
  check(String(wb.getWorksheet('적용기준')!.getCell('A1').value).includes('생성했습니다'), '적용기준에 생성자·일시');
  const { data: logs } = await db.from('download_logs').select('file_name, kind').eq('actor_id', emp!.id).gte('created_at', STARTED_AT);
  check(!!logs?.some((l) => l.kind === 'attendance_report' && l.file_name === name), 'download_logs에 먼저 기록', JSON.stringify(logs));

  // 관리자가 아니면 거절
  await db.from('profiles').update({ role: 'employee' }).eq('id', emp!.id);
  const st = await p.evaluate(async (u) => (await fetch(u)).status, `/api/admin/export/report?m=${ym}`);
  check(st === 403, '직원은 403', String(st));
  console.log('saved', file);
} finally {
  await browser.close();
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
}
console.log(fails ? `${fails}개 실패` : '모두 통과');
process.exitCode = fails ? 1 : 0;
