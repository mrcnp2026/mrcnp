// 출퇴근 기록 화면 폰 점검 (2026-10-19 디자인 손보기: 폰에서 표가 옆으로 밀리는 곳) — 390×844, 가로 넘침 · 화면보다 넓은 요소를 적고 사진을 찍는다
//   npx tsx scripts/shots-records.mts <사진 폴더> [주소...]
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';
import { dropAccounts, tempAccount } from './lib/e2e-temp.mts';
const BASE = process.env.BASE ?? 'http://localhost:4123';
const OUT = process.argv[2];
const urls = process.argv.slice(3);
// 임시 관리자 계정 — 끝나면 계정과 그 계정이 남긴 자료를 모두 지운다(운영 DB에 검사 자료를 남기지 않는다)
const { id, token } = await tempAccount(`e2e-design-${Date.now().toString(36)}`, '디자인 점검', 'admin', { can_view_payroll: true });
const br = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await (await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  for (const [i, url] of urls.entries()) {
    await p.goto(BASE + url);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(800);
    const m = await p.evaluate(() => {
      const vw = window.innerWidth;
      const wide = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > vw + 1 && getComputedStyle(e).display !== 'none'; })
        .map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).slice(0, 60)} ${Math.round(e.getBoundingClientRect().width)}px`).slice(0, 8);
      const scrollers = [...document.querySelectorAll('body *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX) && (e as HTMLElement).offsetParent !== null)
        .map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).slice(0, 50)} 안쪽 ${e.scrollWidth}px / 보이는 ${e.clientWidth}px`).slice(0, 8);
      return { page: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, wide, scrollers };
    });
    console.log(`\n# ${url}  페이지 폭 ${m.page}px · 높이 ${m.height}px`);
    for (const s of m.scrollers) console.log('  옆으로 밀리는 칸:', s);
    for (const s of m.wide) console.log('  화면보다 넓음:', s);
    await p.screenshot({ path: path.join(OUT, `${String(i + 1).padStart(2, '0')}.png`), fullPage: true });
  }
} finally {
  await br.close();
  await dropAccounts([id]);
}
