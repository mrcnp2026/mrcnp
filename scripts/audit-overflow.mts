// 가로 넘침 검수 — 모든 화면 × 여러 폭 × 언어. 마스터 4-9·5장: 가로 스크롤은 버그다 (월간 표만 자기 상자 안 예외였지만 지금은 그것도 없앰).
//   npm run audit:overflow        (앱이 켜져 있어야 한다)
// 검사 전용 직원(사번 e2e-audit)을 쓴다 — 검사 동안만 활성·관리자로 켰다가 끝나면 비활성으로 끈다 (현황판 인원에 안 섞이게).
// 실제 사람의 등록(test·admin)은 건드리지 않는다. 기록은 만들지 않는다.
// 찾는 것: ① 페이지 가로 스크롤 ② 상자 안 가로 스크롤 ③ 화면 밖으로 나간 요소 ④ 글자가 잘린 버튼·칩·링크
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = 'http://localhost:4123';
// 이 스크립트가 만든 가짜 폰만 해제한다 — 사람이 직접 등록한 폰(의뢰인 PC 등)은 건드리지 않는다 (2026-10-02)
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// 안전 정지: 사람이 직접 등록한 폰이 있으면 이 스크립트는 아무것도 하지 않는다 (2026-10-02 — 의뢰인 폰·PC 등록을 지우지 않게)
for (const no of [] as string[]) {
  const { data: pp } = await db.from('profiles').select('id').eq('employee_no', no).maybeSingle();
  const { count } = pp ? await db.from('user_passkeys').select('id', { count: 'exact', head: true }).eq('employee_id', pp.id).is('revoked_at', null) : { count: 0 };
  if (count) {
    console.log(`중단: 사번 ${no}에 사람이 등록한 폰이 있습니다. 이 검사는 등록을 바꾸므로 실행하지 않습니다. (검사 전용 직원을 따로 만들어 쓰세요)`);
    process.exit(2);
  }
}
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280];

// 브라우저 안에서 도는 검사. 문자열로 넘긴다 — tsx가 함수에 끼워 넣는 __name 도우미가 브라우저에는 없어서
const SCAN = `(() => {
  const out = [];
  const vw = window.innerWidth;
  const label = (el) => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return '<' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '> "' + t + '"';
  };
  if (document.documentElement.scrollWidth > vw + 1) out.push('PAGE scrollWidth ' + document.documentElement.scrollWidth + ' > ' + vw);
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 && cs.position !== 'fixed') out.push('OUTSIDE ' + Math.round(r.right) + 'px ' + label(el));
    const ox = cs.overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) out.push('INNER-SCROLL ' + el.scrollWidth + '>' + el.clientWidth + ' ' + label(el));
    // 터치 영역 44px 이상 (마스터 5장) — 버튼·링크·선택 상자. 숨김(sr-only) 요소는 제외
    if (['BUTTON', 'A', 'SELECT', 'SUMMARY'].includes(el.tagName) && (r.height < 43.5 || r.width < 43.5) && cs.position !== 'absolute') out.push('SMALL-TARGET ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + label(el));
    const isControl = ['BUTTON', 'A', 'LABEL', 'SELECT'].includes(el.tagName) || el.classList.contains('rounded-chip');
    if (isControl && el.scrollWidth > el.clientWidth + 1) out.push((ox === 'visible' ? 'TEXT-OVERFLOW ' : 'CLIPPED ') + label(el));
  }
  return [...new Set(out)];
})()`;

async function scan(p: Page): Promise<string[]> {
  return p.evaluate(SCAN);
}

async function invite(id: string) {
  const token = randomBytes(32).toString('base64url');
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
  await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
  return token;
}

let { data: emp } = await db.from('profiles').select('id, role, locale').eq('employee_no', 'e2e-audit').maybeSingle();
if (!emp) {
  const { data: u } = await db.auth.admin.createUser({ email: 'e2e-audit@staff.invalid', email_confirm: true });
  await db.from('profiles').insert({ id: u.user!.id, name: '검사용(자동)', employee_no: 'e2e-audit', role: 'employee', locale: 'en', active: false });
  emp = { id: u.user!.id, role: 'employee', locale: 'en' };
}
await db.from('profiles').update({ active: true, role: 'employee' }).eq('id', emp!.id);
const original = { role: 'employee', locale: 'en', active: false };
// 이미 게시된 실제 공지는 검사 계정이 "확인함"으로 둔다 — 팝업이 화면을 가려 검사가 멈추지 않게 (검사 계정 것만, 실제 직원 확인 현황과 무관)
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) {
    await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp!.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const findings: string[] = [];
let checked = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const p = await ctx.newPage();

  const run = async (label: string, url: string, prep?: (p: Page) => Promise<void>) => {
    for (const w of WIDTHS) {
      await p.setViewportSize({ width: w, height: 800 });
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
      if (prep) await prep(p);
      for (const f of await scan(p)) findings.push(`[${label} @${w}] ${f}`);
      checked++;
    }
  };

  // 로그아웃 상태 화면
  await run('로그인(en)', '/login');
  await run('등록-잘못된 초대(en)', '/register?token=nope');
  const tok = await invite(emp!.id);
  await run('등록(en)', `/register?token=${tok}`);
  // 등록 → 직원 화면 (영어)
  await p.setViewportSize({ width: 360, height: 800 });
  await p.goto(`${BASE}/register?token=${tok}`);
  await createPassword(p);
  for (const f of await scan(p)) findings.push(`[등록 완료+설치 안내(en) @360] ${f}`);
  for (const loc of ['en', 'ko'] as const) {
    await db.from('profiles').update({ locale: loc }).eq('id', emp!.id);
    await run(`직원 홈(${loc})`, '/punch');
    await run(`내 기록(${loc})`, '/punch/records');
    await run(`정정 요청(${loc})`, '/punch/corrections');
    await run(`내 계정(${loc})`, '/punch/account');
    await run(`정정 요청-시각수정(${loc})`, '/punch/corrections', async (pg) => {
      await pg.locator('input[type=radio]').nth(1).check();
    });
  }
  // 관리자 화면 (한국어·영어)
  await db.from('profiles').update({ role: 'admin' }).eq('id', emp!.id);
  for (const loc of ['ko', 'en'] as const) {
    await db.from('profiles').update({ locale: loc }).eq('id', emp!.id);
    await run(`관리자가 본 출퇴근 화면(${loc})`, '/punch');
    await run(`관리자가 본 내 기록(${loc})`, '/punch/records');
    await run(`관리자 홈(${loc})`, '/admin?practice=1', async (pg) => {
      await pg.locator('[role=tablist] button').nth(1).click();
    });
    await run(`처리함(${loc})`, '/admin/inbox?practice=1');
    await run(`기록(${loc})`, '/admin/records?practice=1');
    await run(`직원(${loc})`, '/admin/members');
    await run(`더보기(${loc})`, '/admin/more');
    await run(`진단(${loc})`, '/admin/diag');
  }
  // 초대 창 (직원 카드의 "초대 링크 보내기" → 확인)
  await db.from('profiles').update({ locale: 'ko' }).eq('id', emp!.id);
  for (const w of [320, 360, 1280]) {
    await p.setViewportSize({ width: w, height: 800 });
    // 직원 상세의 로그인 카드에는 항상 초대 버튼이 있다 (목록에는 아직 가입 안 한 사람에게만 보인다)
    await p.goto(`${BASE}/admin/members/${emp!.id}`);
    await p.getByRole('button', { name: /링크 보내기|다시 보내기/ }).first().click();
    for (const f of await scan(p)) findings.push(`[직원-초대 확인 @${w}] ${f}`);
    await p.getByRole('button', { name: '만들기' }).first().click();
    await p.locator('text=링크 보내기 (문자·카카오톡)').first().waitFor({ timeout: 15000 });
    for (const f of await scan(p)) findings.push(`[직원-초대 QR 창 @${w}] ${f}`);
    checked += 2;
  }
} catch (e) {
  findings.push(`검수 중단: ${(e as Error).message.split('\n')[0]}`);
} finally {
  await browser.close();
  await db.from('profiles').update(original).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(`검사한 화면×폭: ${checked}`);
  console.log(findings.length ? findings.join('\n') : '넘치는 곳 없음');
  if (findings.length) process.exitCode = 1;
}
