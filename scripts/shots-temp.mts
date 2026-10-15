// 화면 사진 — 임시 계정으로 로그인해 찍고, 끝나면 계정을 지운다.
//   npx tsx scripts/shots-temp.mts <폴더> "<employee|admin>|<너비>|<주소>|<이름>,..."
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';
import { dropAccounts, tempAccount } from './lib/e2e-temp.mts';

const [dir, spec] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:4123';
const made: string[] = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const acc = { employee: await tempAccount('e2e-shot-emp', '사진 직원', 'employee'), admin: await tempAccount('e2e-shot-adm', '사진 관리자', 'admin') };
  made.push(acc.employee.id, acc.admin.id);
  for (const who of ['employee', 'admin'] as const) {
    const jobs = spec.split(',').map((s) => s.split('|')).filter((x) => x[0] === who);
    if (!jobs.length) continue;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/register?token=${acc[who].token}`);
    await createPassword(p);
    for (const [, w, url, name] of jobs) {
      await p.setViewportSize({ width: Number(w), height: 900 });
      await p.goto(`${BASE}${url}`);
      await p.waitForLoadState('networkidle');
      await p.keyboard.press('Escape').catch(() => {});
      await p.waitForTimeout(600);
      await p.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
      console.log('찍음', name);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await dropAccounts(made);
}
