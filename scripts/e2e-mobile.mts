// 폰 사용성 검사 (2026-10-15 의뢰인: 「모바일에서 이 서비스를 이용하기 너무 힘들다」 — `모바일 사용성 분석 (2026-10-15).md` D)
//   npx tsx scripts/e2e-mobile.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 폰 폭 320 · 390에서 주요 화면을 열어 본다:
//   ① 가로 넘침 없음 ② 화면 길이가 폰 5장(390×844 기준 4,220px)을 넘지 않음 ③ 제목이 첫 화면 안에 보임
//   ④ 메뉴 서랍이 스크롤 없이 한 화면 ⑤ 폰 전용 모양(단계 한 줄 · 표 대신 카드 · 통합설정 접기 · 긴 목록 쪽 넘김)
// 읽기만 한다 — 기록을 만들지 않는다. 검사 전용 관리자(e2e-audit)를 켰다가 끝나면 끈다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword, openDrawer, unlockConsole } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: adm } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', can_view_payroll: true }).eq('id', adm!.id);
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: adm!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
}
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: adm!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const MAX_SCREENS = 5;
const PAGES: [string, string][] = [
  ['/punch', '직원 홈'],
  ['/punch/records', '내 출퇴근'],
  ['/punch/leave', '내 휴가'],
  ['/punch/requests', '내 요청'],
  ['/punch/payslips', '내 급여'],
  ['/admin', '관리자 홈'],
  ['/admin/inbox', '요청 처리'],
  ['/admin/records/list', '출퇴근 기록'],
  ['/admin/leave', '휴가 관리'],
  ['/admin/members', '직원'],
  ['/admin/payroll/runs', '급여대장'],
  ['/admin/payroll/staff', '사원별 급여'],
  ['/admin/reports/attendance', '근태 리포트'],
  ['/admin/schedule', '근무일정'],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name: string) => SHOTS && p.screenshot({ path: path.join(SHOTS, `mobile-${name}.png`) });
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  const open = async (url: string) => {
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
  };

  // ① ② ③ 화면마다: 넘침 · 길이 · 제목
  await unlockConsole(p, db, adm!.id);
  for (const w of [390, 320]) {
    await p.setViewportSize({ width: w, height: 844 });
    for (const [url, name] of [...PAGES, ['/admin/console', '통합설정'] as [string, string]]) {
      await open(url);
      const [sw, sh] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
      check(sw <= w, `가로 넘침 없음 @${w} ${name}`, `${sw}px`);
      if (w === 390) {
        check(sh <= 844 * MAX_SCREENS, `길이가 폰 ${MAX_SCREENS}장 이내 · ${name}`, `${sh}px = ${(sh / 844).toFixed(1)}장`);
        const h1 = await p.locator('main h1').first().boundingBox().catch(() => null);
        if (h1) check(h1.y + h1.height <= 844, `제목이 첫 화면에 보임 · ${name}`, `${Math.round(h1.y)}px`);
      }
    }
  }
  await p.setViewportSize({ width: 390, height: 844 });

  // ④ 메뉴 서랍 — 두 모드 모두 스크롤 없이 한 화면
  for (const [url, mode] of [['/punch', '직원 모드'], ['/admin', '관리자 모드']] as const) {
    await open(url);
    await openDrawer(p);
    const d = p.getByRole('dialog');
    check((await d.getByRole('tab', { name: mode }).getAttribute('aria-selected')) === 'true', `서랍이 지금 모드(${mode})로 열린다`);
    const [sh, ch] = await d.locator('[data-drawer-list]').evaluate((e) => [e.scrollHeight, e.clientHeight]);
    check(sh <= ch, `서랍(${mode}) 메뉴가 스크롤 없이 한 화면`, `${sh}/${ch}px`);
    await shot(`drawer-${mode}`);
    await p.keyboard.press('Escape');
  }

  // ⑤ 폰 전용 모양
  await open('/admin/payroll/runs');
  const steps = p.locator('[data-steps-phone]');
  check((await steps.count()) === 1 && /^\d\/\d/.test(((await steps.locator('summary').textContent()) ?? '').trim()), '급여 순서 안내가 폰에서는 「3/5 급여대장」 한 줄', (await steps.locator('summary').textContent()) ?? '');
  await steps.locator('summary').click();
  check((await steps.locator('li').count()) >= 4, '한 줄을 누르면 전체 단계가 펼쳐진다');
  check(!(await p.locator('main thead').first().isVisible().catch(() => false)), '급여대장 목록: 폰에서는 표 머리줄 없이 카드');

  await open('/admin/reports/attendance');
  check(await p.locator('[data-phone-employees]').isVisible(), '근태 리포트: 폰에서는 직원별 카드 목록');
  check(!(await p.locator('main table').first().isVisible()), '근태 리포트: 폰에서는 넓은 표를 숨긴다');

  await open('/admin/payroll/staff');
  check(await p.locator('[data-phone-staff]').isVisible(), '사원별 급여: 폰에서는 직원마다 한 줄 카드');

  await open('/admin/console');
  const folded = p.locator('main button[aria-expanded]');
  check((await folded.count()) >= 10 && (await p.locator('main button[aria-expanded="true"]').count()) === 0, '통합설정: 폰에서는 묶음이 접혀 있다', String(await folded.count()));
  await p.getByRole('searchbox', { name: '설정 찾기' }).fill('휴가 유형');
  check((await p.locator('main a[href="/admin/leave/types"]').count()) === 1, '통합설정: 「설정 찾기」로 항목을 바로 찾는다');
  await shot('console');

  await open('/punch/leave');
  const mine = p.locator('#mine > ul > li');
  check((await mine.count()) <= 10, '내 휴가 「내 신청」은 한 쪽에 10건까지', String(await mine.count()));

  await open('/admin');
  const [graphY, todoY] = await Promise.all([p.locator('main').getByText('최근 14일', { exact: false }).first().boundingBox(), p.locator('main').getByRole('heading', { name: '처리할 일' }).first().boundingBox()]);
  check(!!graphY && !!todoY && todoY.y < graphY.y, '관리자 홈(폰): 「처리할 일」이 그래프보다 위', `${Math.round(todoY?.y ?? -1)} < ${Math.round(graphY?.y ?? -1)}`);

  // 하단 탭 「전체」 격자
  await p.locator('nav.fixed').getByRole('button', { name: '전체' }).click();
  const grid = p.locator('[data-all-apps]');
  check((await grid.locator('a').count()) === 9, '「전체」: 관리자 앱 8 + 통합설정 = 9칸', String(await grid.locator('a').count()));
  await shot('all-apps');
  await p.keyboard.press('Escape');

  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
  await db.from('console_pins').delete().eq('employee_id', adm!.id);
  await db.from('profiles').update({ active: false, role: 'employee', can_view_payroll: false }).eq('id', adm!.id);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
