// 관리자 PC 화면 사진 — 1440×900 (2026-10-19 디자인 손보기: 표 전반의 톤). 임시 관리자 계정, 끝나면 계정과 자료를 지운다.
//   npx tsx scripts/shots-pc.mts <사진 폴더> [주소...]
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';
import { dropAccounts, tempAccount } from './lib/e2e-temp.mts';
const [OUT, ...urls] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:4123';
const { id, token } = await tempAccount(`e2e-pc-${Date.now().toString(36)}`, '디자인 점검', 'admin', { can_view_payroll: true });
const br = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  for (const [i, url] of urls.entries()) {
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, `${String(i + 1).padStart(2, '0')}.png`) });
    console.log(url);
  }
} finally {
  await br.close();
  await dropAccounts([id]);
}
