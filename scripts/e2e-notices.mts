// 공지 끝까지 확인 (②-5 7-15) — 관리자 작성 → 번역 직접 입력 → 숫자 대조로 게시 막힘 → 고쳐서 게시 →
// 직원 팝업(언어 버튼 따라감) → 확인 기록(판·언어) → 내용 변경 시 다시 뜸 → 보관.
//   npx tsx scripts/e2e-notices.mts   (앱이 localhost:4123에 켜져 있어야 한다)
// 검사 전용 직원(e2e-audit)만 대상으로 한다 — 실제 사람에게는 팝업이 가지 않는다. 끝나면 보관하고 e2e-audit을 다시 끈다.
// 본문 문장 속 링크는 글줄 높이라 44px 검사에서 뺀다 (문장 안 링크 예외).
// 공지는 지울 수 없으므로(삭제 없음) 보관함에 "[점검]" 공지가 남는다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = 'http://localhost:4123';
const STARTED_AT = new Date().toISOString();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const results: string[] = [];
let failed = 0;
const check = (ok: boolean, what: string) => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

const SCAN = `(() => {
  const out = []; const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push('PAGE scrollWidth ' + document.documentElement.scrollWidth);
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 && cs.position !== 'fixed') out.push('OUTSIDE ' + el.tagName + ' ' + (el.textContent || '').trim().slice(0, 30));
    if (['BUTTON', 'A', 'SELECT', 'SUMMARY'].includes(el.tagName) && !(el.tagName === 'A' && el.closest('p')) && (r.height < 43.5 || r.width < 43.5) && cs.position !== 'absolute') out.push('SMALL-TARGET ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + (el.textContent || '').trim().slice(0, 30));
  }
  return [...new Set(out)];
})()`;
async function scanAll(p: Page, label: string, url?: string) {
  for (const w of [320, 360, 1280]) {
    await p.setViewportSize({ width: w, height: 800 });
    if (url) {
      await p.goto(BASE + url);
      await p.waitForLoadState('networkidle');
    }
    const f = (await p.evaluate(SCAN)) as string[];
    check(f.length === 0, `${label} @${w} 넘침·작은 버튼 없음${f.length ? ': ' + f.join(' | ') : ''}`);
  }
  await p.setViewportSize({ width: 360, height: 800 });
}

const { data: emp } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').maybeSingle();
if (!emp) throw new Error('e2e-audit 직원이 없습니다. 먼저 scripts/audit-overflow.mts를 한 번 돌리세요.');
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', emp.id);
// 이미 게시된 실제 공지는 검사 계정이 "확인함"으로 둔다 — 팝업이 화면을 가려 검사가 멈추지 않게 (검사 계정 것만, 실제 직원 확인 현황과 무관)
{
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  for (const n of live ?? []) {
    await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: emp.id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
  }
}

const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: emp.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let noticeId: string | null = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  await p.waitForTimeout(1500);

  // ── 관리자: 더보기 › 공지 › 새 공지 ──
  await p.goto(`${BASE}/admin/more`);
  check(await p.getByRole('link', { name: /공지/ }).isVisible(), '더보기에 「공지」가 있다');
  await scanAll(p, '공지 목록', '/admin/notices');
  await p.goto(`${BASE}/admin/notices/new`);
  await scanAll(p, '새 공지', '/admin/notices/new');
  await p.getByLabel('제목 (한국어)').fill('[점검] 3월 14일 휴무 안내');
  await p.getByLabel('본문 (한국어)').fill('3월 14일은 휴무입니다.\n자세히: https://example.com/a <b>굵게</b>');
  await p.getByLabel('직원 선택').check();
  await p.getByLabel('검사용(자동)').check();
  await p.getByRole('button', { name: '임시 저장' }).click();
  await p.waitForURL(/\/admin\/notices\/[0-9a-f-]{36}$/);
  noticeId = p.url().split('/').pop()!;
  check(true, `임시 저장 → 편집 화면으로 (${noticeId.slice(0, 8)})`);

  // 번역 초안 (키가 없으면 안내만 — 막지 않는다)
  await p.getByRole('button', { name: '번역 초안 만들기' }).click();
  await p.locator('text=/번역 초안을 만들었습니다|자동 번역이 아직 연결되지 않았습니다|번역 초안을 만들지 못했습니다/').waitFor({ timeout: 30000 });
  check(true, '번역 초안 버튼 → 결과 안내가 보인다');

  // 일부러 날짜를 틀리게 입력 → 「확인했음」 없이 게시하면 막혀야 한다
  const enTitle = p.locator('input[lang=en]');
  const enBody = p.locator('textarea[lang=en]');
  await enTitle.fill('[Check] Office closed March 15');
  await enBody.fill('The office is closed on March 15.');
  await p.getByRole('button', { name: '번역 저장' }).click();
  await p.getByText('숫자 확인 필요').waitFor({ timeout: 10000 });
  check(true, '날짜가 바뀐 번역 → 「숫자 확인 필요」 표시');
  await p.getByRole('button', { name: '게시' }).click();
  await p.getByRole('button', { name: '네' }).click();
  await p.getByText('번역의 숫자가 원문과 다릅니다').waitFor({ timeout: 10000 });
  check(true, '숫자 확인 필요 → 게시가 막힌다');

  // 고치고 확인 → 게시
  await enTitle.fill('[Check] Office closed March 14');
  await enBody.fill('The office is closed on March 14.\nMore: https://example.com/a <b>bold</b>');
  await p.getByLabel('확인했음').check();
  await p.getByRole('button', { name: '번역 저장' }).click();
  await p.getByText('확인됨').waitFor({ timeout: 10000 });
  await p.getByRole('button', { name: '게시' }).click();
  check(await p.getByText('1명에게 공지합니다').isVisible(), '게시 확인에 대상 인원 수(1명)');
  await p.getByRole('button', { name: '네' }).click();
  await p.getByText('게시 중').first().waitFor({ timeout: 10000 });
  check(true, '게시 → 「게시 중」');
  await scanAll(p, '공지 편집(게시 중)', `/admin/notices/${noticeId}`);

  // ── 직원(영어): 게시된 공지는 홈에서도 바로 뜬다 (2026-10-02 의뢰인 결정) ──
  await db.from('profiles').update({ role: 'employee', locale: 'en' }).eq('id', emp.id);
  await p.goto(`${BASE}/punch`);
  await p.waitForLoadState('networkidle');
  check(await p.getByRole('link', { name: /Notices \(1 unread\)/ }).isVisible(), '홈 상단 종 아이콘에 미확인 1');
  await p.getByRole('dialog').waitFor({ timeout: 5000 });
  check(true, '홈을 열자마자 팝업이 뜬다');
  const dlg = p.getByRole('dialog');
  check(await dlg.getByText('[Check] Office closed March 14').isVisible(), '팝업이 영어(상단 언어)로 보인다');
  check(await dlg.getByRole('link', { name: 'https://example.com/a' }).isVisible(), '주소는 링크');
  check(await dlg.getByText('<b>bold</b>', { exact: false }).isVisible(), 'HTML은 글자 그대로 (해석 안 함)');
  check(await dlg.getByText('This is a reference translation', { exact: false }).isVisible().catch(() => false) || (await dlg.locator('text=/translation/i').count()) > 0, '참고용 번역 안내가 보인다');
  await scanAll(p, '공지 팝업(en)');
  await dlg.getByRole('button', { name: 'Show Korean original' }).click();
  check(await dlg.getByText('[점검] 3월 14일 휴무 안내').isVisible(), '「한국어 원문 보기」 → 원문');
  await dlg.getByRole('button', { name: 'OK', exact: true }).click();
  await p.waitForTimeout(1500);
  const { data: reads } = await db.from('notice_reads').select('version, shown_locale').eq('notice_id', noticeId).eq('employee_id', emp.id);
  check(reads?.length === 1 && reads[0].version === 1 && reads[0].shown_locale === 'en', `확인 기록: 판 1 · 언어 en (${JSON.stringify(reads)})`);
  await p.goto(`${BASE}/punch/records`);
  await p.waitForLoadState('networkidle');
  check(!(await p.getByRole('dialog').isVisible()), '확인한 공지는 다시 안 뜬다');
  await scanAll(p, '직원 공지 목록(en)', '/punch/notices');

  // ── 직원 화면을 열어 둔 채로 관리자가 「내용 변경」 → 새로 고침 없이 30초 안에 다시 뜬다 (판 2) ──
  await db.from('profiles').update({ role: 'admin', locale: 'ko' }).eq('id', emp.id);
  await p.context().addCookies([{ name: 'locale', value: 'ko', url: BASE }]);
  await p.goto(`${BASE}/punch/records`); // 관리자도 직원 화면을 쓴다 — 이 화면을 열어 둔다
  await p.waitForLoadState('networkidle');
  const p2 = await p.context().newPage();
  await p2.goto(`${BASE}/admin/notices/${noticeId}`);
  await p2.waitForLoadState('networkidle');
  await p2.waitForFunction("!document.querySelector('[aria-busy=true]')");
  check(await p2.getByText('확인 1/1명').isVisible(), '확인 현황 1/1명');
  await p2.getByLabel('본문 (한국어)').fill('3월 14일은 휴무입니다. 3월 16일 09:00에 봬요.');
  await p2.getByRole('button', { name: '저장', exact: true }).click();
  await p2.getByText('저장했습니다.').waitFor();
  const { data: nv } = await db.from('notices').select('version').eq('id', noticeId).single();
  check(nv?.version === 2, `내용 변경(기본) → 판 2 (${nv?.version})`);
  await p2.close();
  const t0 = Date.now();
  await p.bringToFront();
  await p.getByRole('dialog').waitFor({ timeout: 40000 });
  check(await p.getByRole('dialog').getByText('3월 16일 09:00에 봬요', { exact: false }).isVisible(), `열어 둔 화면에 새로 고침 없이 다시 뜬다 (${Math.round((Date.now() - t0) / 1000)}초, 한국어)`);
  await scanAll(p, '공지 팝업(ko)');
  // 영어로 보면 번역이 옛 판이라는 안내
  await db.from('profiles').update({ role: 'employee', locale: 'en' }).eq('id', emp.id);
  await p.context().addCookies([{ name: 'locale', value: 'en', url: BASE }]);
  await p.goto(`${BASE}/punch/records`);
  await p.getByRole('dialog').waitFor({ timeout: 5000 });
  check(await p.getByRole('dialog').getByText('out of date', { exact: false }).isVisible(), '영어 번역에 「옛 내용」 안내');
  await p.getByRole('dialog').getByRole('button', { name: "Don't show again today" }).click();
  await p.goto(`${BASE}/punch/records`);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(1500);
  check(!(await p.getByRole('dialog').isVisible()), '「오늘 하루 보지 않기」 → 오늘은 안 뜬다');
  const { count: rc } = await db.from('notice_reads').select('id', { count: 'exact', head: true }).eq('notice_id', noticeId).eq('version', 2);
  check(rc === 0, '「오늘 하루 보지 않기」는 확인 기록이 아니다');
} catch (e) {
  check(false, `중단: ${(e as Error).message.split('\n')[0]}`);
  // 멈춘 화면을 남긴다 (shots/는 git에 올리지 않는다)
  await browser.contexts()[0]?.pages()[0]?.screenshot({ path: path.join(import.meta.dirname, '..', 'shots', 'e2e-fail.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  if (noticeId) await db.from('notices').update({ status: 'archived' }).eq('id', noticeId);
  await db.from('profiles').update({ role: 'employee', locale: 'en', active: false }).eq('id', emp!.id);
  await db.from('user_passkeys').update({ revoked_at: new Date().toISOString(), device_label: 'E2E 가상 인증기 (자동 확인용)' }).eq('employee_id', emp!.id).is('revoked_at', null).gte('created_at', STARTED_AT);
  await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', emp!.id).is('used_at', null).is('revoked_at', null);
  console.log(results.join('\n'));
  console.log(failed ? `\n실패 ${failed}건` : '\n전부 통과');
  if (failed) process.exitCode = 1;
}
