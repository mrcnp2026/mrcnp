// PC 화면과 폰 화면에 보이는 내용이 서로 다른 곳을 찾는다 (2026-10-26 의뢰인: 「PC와 모바일이 틀려진 곳이 꽤 있다」).
//   env를 개발 DB 값으로 덮어쓴 로컬 서버(localhost:4123)에서 돌린다 — 운영 자료는 건드리지 않는다.
//   npx tsx scripts/e2e-parity.mts [사진 폴더]
// 같은 화면을 폰 폭(390)과 PC 폭(1440)으로 열어 보이는 글자(innerText)를 줄 단위로 모아 견준다.
//   「PC에만 있음」 = 폰에서 빠진 정보 · 「폰에만 있음」 = PC에서 빠진 정보. 숫자 · 날짜는 같은 칸으로 보도록 바꿔서 견준다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword, unlockConsole } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true }); // 이미 정해진 환경 변수(개발 DB 값)는 덮어쓰지 않는다
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
if (!/utxfsjbcyssnpynvzios/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) throw new Error('개발 DB가 아닙니다 — 멈춥니다');

const { data: adm } = await db.from('profiles').select('id').eq('employee_no', 'M009').single();
await db.from('profiles').update({ active: true, locale: 'ko' }).eq('id', adm!.id);
const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: adm!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: adm!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });

const PAGES: [string, string][] = [
  ['/punch', '직원 홈'], ['/punch/records', '내 출퇴근'], ['/punch/leave', '내 휴가'], ['/punch/requests', '내 요청'], ['/punch/payslips', '내 급여'], ['/punch/notices', '공지'], ['/punch/messages', '업무 메시지'], ['/punch/corrections', '정정 요청'],
  ['/admin', '관리자 홈'], ['/admin/inbox', '요청함'], ['/admin/records/calendar', '출퇴근 달력'], ['/admin/records/list', '출퇴근 기록'], ['/admin/records', '근로시간 월별'], ['/admin/missing', '미출근'], ['/admin/anomalies', '이상자'], ['/admin/closing', '근태 마감'],
  ['/admin/schedule', '근무일정'], ['/admin/leave', '휴가 관리'], ['/admin/leave/ledger', '연차 장부'], ['/admin/leave/promotion', '연차 촉진'], ['/admin/members', '직원'], ['/admin/members/groups', '조직도'], ['/admin/hr-log', '인사 이력'],
  ['/admin/payroll', '근로시간 요약'], ['/admin/payroll/staff', '사원별 급여'], ['/admin/payroll/check', '급여 사전준비'], ['/admin/payroll/runs', '급여대장'], ['/admin/payroll/daily', '일용직'], ['/admin/payroll/insurance', '사회보험'],
  ['/admin/payroll/retirement', '퇴직 급여'], ['/admin/payroll/pension', '퇴직연금'], ['/admin/payroll/labor-cost', '인건비 현황'], ['/admin/reports/attendance', '근태 리포트'], ['/admin/reports/leave', '휴가 리포트'], ['/admin/reports/annual', '연간 리포트'],
  ['/admin/notices', '공지 관리'], ['/admin/messages', '업무 메시지 관리'], ['/admin/training', '교육'], ['/admin/jobs', '직무'], ['/admin/shifts', '근무일정 템플릿'], ['/admin/branches', '지점'], ['/admin/places', '출퇴근 장소'], ['/admin/console', '통합설정'], ['/admin/backups', '백업'],
];

// 숫자 · 날짜는 같은 칸으로 본다. 아이콘 글자 · 빈 줄은 뺀다
const norm = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}/g, 'D').replace(/\d{1,2}:\d{2}/g, 'T').replace(/[\d,.]+/g, '#').replace(/\s+/g, ' ').trim();
const lines = (txt: string) => [...new Set(txt.split('\n').map(norm).filter((l) => l.length >= 2 && !/^[#›‹+\-–·]+$/.test(l)))];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report: { url: string; name: string; pcOnly: string[]; phoneOnly: string[]; shared: number; error?: string }[] = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  await unlockConsole(p, db, adm!.id);
  const read = async (url: string, w: number, h: number, shot: string) => {
    await p.setViewportSize({ width: w, height: h });
    await p.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(600);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, shot), fullPage: true }).catch(() => {});
    return p.evaluate(() => (document.querySelector('main') as HTMLElement | null)?.innerText ?? document.body.innerText);
  };
  for (const [url, name] of PAGES) {
    const slug = url.replace(/\//g, '_').replace(/^_/, '') || 'home';
    try {
      const phone = lines(await read(url, 390, 844, `${slug}-phone.png`));
      const pc = lines(await read(url, 1440, 900, `${slug}-pc.png`));
      const A = new Set(phone), B = new Set(pc);
      const pcOnly = pc.filter((l) => !A.has(l)), phoneOnly = phone.filter((l) => !B.has(l));
      report.push({ url, name, pcOnly, phoneOnly, shared: pc.filter((l) => A.has(l)).length });
      console.log(`${(pcOnly.length + phoneOnly.length === 0 ? '✅' : '⚠️')} ${name.padEnd(14)} 같은 줄 ${String(pc.filter((l) => A.has(l)).length).padStart(3)} | PC에만 ${String(pcOnly.length).padStart(3)} | 폰에만 ${String(phoneOnly.length).padStart(3)}  ${url}`);
    } catch (e) {
      report.push({ url, name, pcOnly: [], phoneOnly: [], shared: 0, error: String((e as Error).message).slice(0, 120) });
      console.log(`❌ ${name} ${url} ${(e as Error).message.slice(0, 80)}`);
    }
  }
} finally {
  await browser.close();
}
const out = path.join(SHOTS ?? '.', 'parity-report.json');
writeFileSync(out, JSON.stringify(report, null, 1));
console.log('\n상세:', out);
