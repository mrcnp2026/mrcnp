// 통합설정 숫자 4자리 잠금 검사 (2026-10-14 결정 사항 개발-29, DB 묶음 7) — 검사 전용 관리자 둘(e2e-audit · e2e-audit3).
//   npx tsx scripts/e2e-console.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 정하기(쉬운 숫자 · 다른 두 숫자 막기) → 잠금 화면 → 틀리기(남은 횟수) → 5번이면 잠김 → 열기 → 통합설정 화면 · 저장 기능 → 나가기 단추로 다시 잠김
// → 저장 기능은 열림 표 없이 막힘 → 다른 관리자가 숫자 지우기(본인 것은 못 지움). 시도 기록은 지울 수 없는 표라 남는다(검사 계정 것).
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
const [A, B] = await Promise.all([who('e2e-audit'), who('e2e-audit3')]);
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const PIN = '2580';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
try {
  await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).in('id', [A.id, B.id]);
  await db.from('console_pins').delete().in('employee_id', [A.id, B.id]);
  const login = async (id: string): Promise<Page> => {
    const token = randomBytes(32).toString('base64url');
    await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
    const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(`${BASE}/register?token=${token}`);
    await createPassword(pg);
    return pg;
  };
  const pin = (pg: Page, body: Record<string, unknown>) => pg.evaluate(`(async () => { const r = await fetch('/api/console/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }); return { status: r.status, json: await r.json().catch(() => ({})) }; })()`) as Promise<{ status: number; json: Record<string, unknown> }>;
  const save = (pg: Page) => pg.evaluate(`(async () => (await fetch('/api/admin/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status)()`) as Promise<number>;
  const shot = async (pg: Page, name: string) => {
    if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  };
  const pa = await login(A.id);

  // ── 처음: 정하기 화면 ──
  await pa.goto(`${BASE}/admin/jobs`);
  await pa.getByRole('heading', { name: '통합설정 숫자 4자리 정하기' }).waitFor({ timeout: 30000 });
  check(new URL(pa.url()).pathname === '/admin/jobs' && (await pa.getByRole('heading', { name: '직무' }).count()) === 0, '숫자를 정하기 전에는 통합설정 화면 대신 「숫자 정하기」가 뜬다(주소는 그대로)');
  await shot(pa, 'console-1-set');
  check((await save(pa)) === 403, '열지 않은 채로는 통합설정의 저장 기능이 막힌다');
  check((await pin(pa, { action: 'set', pin: '1234', again: '1234' })).json.error === 'pin_weak', '쉬운 숫자(1234)는 쓸 수 없다');
  check((await pin(pa, { action: 'set', pin: PIN, again: '2581' })).json.error === 'pin_mismatch', '두 번 넣은 숫자가 다르면 안 된다');
  await pa.locator('[data-console-pin]').fill(PIN);
  await pa.locator('[data-console-pin-again]').fill(PIN);
  await pa.getByRole('button', { name: '정하고 열기' }).click();
  await pa.getByRole('heading', { name: '통합설정 열기' }).waitFor({ timeout: 30000 });
  const { data: row } = await db.from('console_pins').select('pin_hash').eq('employee_id', A.id).single();
  check(!!row && row.pin_hash.startsWith('scrypt$') && !row.pin_hash.includes(PIN), '숫자는 저장되지 않고 한 방향으로 바꾼 값만 남는다');

  // ── 틀리기 · 잠김 ──
  const w1 = await pin(pa, { action: 'open', pin: '9999' });
  check(w1.status === 200 && w1.json.ok === false && w1.json.left === 4, '틀리면 남은 횟수(4번)를 알려 준다', JSON.stringify(w1.json));
  for (let i = 0; i < 3; i++) await pin(pa, { action: 'open', pin: '9999' });
  const w5 = await pin(pa, { action: 'open', pin: '9999' });
  check(w5.status === 423 && w5.json.error === 'pin_locked', '5번 틀리면 잠긴다');
  check((await pin(pa, { action: 'open', pin: PIN })).status === 423, '잠긴 동안에는 맞는 숫자도 안 된다');
  await pa.reload();
  check((await pa.getByText(/5번 틀려서 잠겼습니다/).count()) === 1, '잠금 화면에 언제부터 다시 넣을 수 있는지 보인다');
  await db.from('console_pins').update({ locked_until: null, failed_count: 0 }).eq('employee_id', A.id); // 검사: 15분을 기다리지 않는다

  // ── 열기 → 통합설정 ──
  await pa.reload();
  await pa.locator('[data-console-pin]').fill(PIN);
  await pa.getByRole('button', { name: '열기', exact: true }).click();
  await pa.getByRole('heading', { name: '직무' }).waitFor({ timeout: 30000 });
  check(true, '맞는 숫자를 넣으면 원래 화면(직무)이 열린다');
  check((await save(pa)) === 400, '연 뒤에는 저장 기능이 움직인다(빈 값이라 400)');
  await pa.goto(`${BASE}/admin/settings?tab=access`);
  await pa.waitForLoadState('networkidle');
  check(((await pa.getByRole('heading', { level: 1 }).first().textContent()) ?? '').startsWith('권한'), '연 동안에는 다른 통합설정 화면도 숫자 없이 오간다');
  await shot(pa, 'console-2-access');

  // ── 다른 관리자가 지우기 ──
  check((await pin(pa, { action: 'reset', employeeId: A.id })).json.error === 'pin_reset_self', '본인 숫자는 지울 수 없다');
  const pb = await login(B.id);
  await pin(pb, { action: 'set', pin: '1357', again: '1357' });
  check((await pin(pb, { action: 'reset', employeeId: A.id })).json.error === 'console_locked', '지우는 사람도 통합설정을 연 상태여야 한다');
  await pin(pb, { action: 'open', pin: '1357' });
  check((await pin(pb, { action: 'reset', employeeId: A.id })).status === 200 && !(await db.from('console_pins').select('employee_id').eq('employee_id', A.id).maybeSingle()).data, '다른 관리자가 숫자를 지우면 다음에 새로 정한다');
  const { data: tries } = await db.from('console_pin_attempts').select('kind, ok').eq('employee_id', A.id).order('created_at', { ascending: false }).limit(10);
  check((tries ?? []).some((x) => x.kind === 'reset') && (tries ?? []).some((x) => x.kind === 'open' && !x.ok), '정하기 · 열기(틀림) · 지우기가 기록에 남는다');

  // ── 나가기 → 다시 잠김 ──
  await pb.goto(`${BASE}/admin/console`);
  await pb.getByRole('link', { name: '관리자 모드로 나가기' }).first().click();
  await pb.waitForURL(/\/admin$/);
  await pb.waitForTimeout(1000);
  await pb.goto(`${BASE}/admin/console`);
  check((await pb.getByRole('heading', { name: '통합설정 열기' }).waitFor({ timeout: 30000 }).then(() => true, () => false)) && (await save(pb)) === 403, '[관리자 모드로 나가기]를 누르면 다시 잠긴다');
  check(errors.length === 0, '화면 오류 없음', errors[0] ?? '');
} catch (e) {
  check(false, '검사 중단', (e as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  await db.from('console_pins').delete().in('employee_id', [A.id, B.id]);
  await db.from('profiles').update({ role: 'employee', active: false, locale: 'en' }).eq('id', B.id);
  await db.from('profiles').update({ locale: 'en' }).eq('id', A.id);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
