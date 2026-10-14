// 메뉴 항목 점검 (2026-10-14 의뢰인: 「메뉴를 눌러 들어간 화면이 무슨 기능인지 · 어떻게 하라는 건지 한눈에 안 들어오면 잘된 개발이 아니다」).
// 메뉴 구성표(config/nav.ts)의 모든 항목을 PC 화면으로 열어 ① 화면 제목(h1)이 메뉴 이름과 같은가 ② 제목 아래 한 줄 설명이 있는가를 본다. 읽기만 한다.
//   npx tsx scripts/audit-titles.mts   (앱이 localhost:4123에 켜져 있어야 한다)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ADMIN_APPS, CONSOLE_APPS, MY_APPS } from '../src/config/nav.ts';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const ko = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'messages', 'ko.json'), 'utf8')) as { frame: { item: Record<string, string>; app: Record<string, string> } };
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: e } = await db.from('profiles').select('id, can_view_payroll').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko', can_view_payroll: true }).eq('id', e!.id);
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: e!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });

// 묶음 제목(예: 근무일정 › 달력형)이 있는 항목은 화면 제목이 묶음 제목이어도 맞는 것으로 본다. 관리자 홈은 현황판이라 뺀다
type K = { frame: { item: Record<string, string>; app: Record<string, string>; group: Record<string, string> } };
const fr = (ko as unknown as K).frame;
const flat = (space: string, apps: typeof MY_APPS) => apps.flatMap((a) => a.groups.flatMap((g) => g.items.map((l) => ({ space, app: fr.app[a.key], group: g.key ? fr.group[g.key] : null, ...l }))));
const items = [...flat('직원 모드', MY_APPS).filter((x) => x.key !== 'myHome'), ...flat('관리자 모드', ADMIN_APPS).filter((x) => x.key !== 'adminHome'), ...flat('통합설정', CONSOLE_APPS)];
const norm = (x: string) => x.replace(/\s+/g, '').replace(/[·・]/g, '');
const b = await chromium.launch({ channel: 'chrome', headless: true });
const out: string[] = [];
try {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  for (const it of items) {
    await p.goto(BASE + it.href);
    await p.waitForLoadState('networkidle');
    const r = (await p.evaluate(`(() => {
      const h = [...document.querySelectorAll('main h1')].find((x) => x.getClientRects().length > 0);
      if (!h) return { h1: '', desc: '' };
      // 제목 뒤에 처음 나오는 보이는 글 한 줄 = 설명
      const ps = [...document.querySelectorAll('main p')].filter((x) => x.getClientRects().length > 0 && (h.compareDocumentPosition(x) & 4));
      const help = h.querySelector('button[aria-label="설명 보기"]') ? '(? 설명)' : '';
      const desc = help || (ps[0]?.textContent?.trim() ?? '');
      return { h1: h.textContent.trim(), desc };
    })()`)) as { h1: string; desc: string };
    const label = ko.frame.item[it.key];
    const same = norm(r.h1).startsWith(norm(label)) || (!!it.group && norm(r.h1).startsWith(norm(it.group)));
    out.push(`${same && r.desc ? 'OK ' : 'XX '}| ${it.space} › ${it.app} › ${label} | 제목: ${r.h1 || '(없음)'} | 설명: ${r.desc ? r.desc.slice(0, 50) : '(없음)'} | ${it.href}`);
  }
} finally {
  await b.close();
  await db.from('profiles').update({ locale: 'en', can_view_payroll: e!.can_view_payroll }).eq('id', e!.id);
}
console.log(out.join('\n'));
console.log(`\n맞음 ${out.filter((x) => x.startsWith('OK')).length} / 전체 ${out.length}`);
