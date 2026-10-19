// 직원 PC 홈(스케줄 달력) 점검 사진 — 1440×900. 임시 직원 계정에 실제 직원의 소속 · 근무일정 틀을 붙여 일정이 보이게 한다. 끝나면 계정과 자료를 지운다.
//   npx tsx scripts/shots-desk.mts <사진 파일> <본뜰 직원 id> [주소]
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';
import { db, dropAccounts, tempAccount } from './lib/e2e-temp.mts';
const [OUT, LIKE, URL = '/punch'] = process.argv.slice(2);
const { data: src } = await db.from('profiles').select('group_id, shift_template_id, job_id, joined_on').eq('id', LIKE).single();
const { id, token } = await tempAccount(`e2e-desk-${Date.now().toString(36)}`, '디자인 점검', 'employee', { ...src });
const br = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(`http://localhost:4123/register?token=${token}`);
  await createPassword(p);
  await p.goto('http://localhost:4123' + URL);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(1000);
  await p.screenshot({ path: OUT, fullPage: true });
  console.log('높이', await p.evaluate(() => document.documentElement.scrollHeight));
} finally {
  await br.close();
  await dropAccounts([id]);
}
