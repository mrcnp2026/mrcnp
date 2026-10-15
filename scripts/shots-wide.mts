// 와이드 메뉴 · 내 급여 조회 사진 (검사 전용 관리자 e2e-audit, 읽기만)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';
config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: e } = await db.from('profiles').select('id').eq('employee_no', 'e2e-audit').single();
await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', e!.id);
const token = randomBytes(32).toString('base64url');
await db.from('invites').insert({ employee_id: e!.id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(`${BASE}/register?token=${token}`);
  await createPassword(p);
  await p.goto(`${BASE}/punch/payslips`);
  await p.waitForLoadState('networkidle');
  await p.screenshot({ path: path.join(SHOTS, 'w1-my-pay.png') });
  await p.getByRole('button', { name: '와이드 메뉴' }).dispatchEvent('click'); // 개발 서버의 왼쪽 아래 표시가 단추를 가린다
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(SHOTS, 'w2-wide.png') });
  await p.goto(`${BASE}/admin/payroll/runs`);
  await p.waitForLoadState('networkidle');
  await p.screenshot({ path: path.join(SHOTS, 'w3-admin-wide.png') });
  await p.getByRole('button', { name: '메뉴 접기' }).dispatchEvent('click');
} finally {
  await b.close();
  await db.from('profiles').update({ locale: 'en' }).eq('id', e!.id);
}
