// 3공장 10월 대조 금액이 그대로인지 확인한다 (급여-77 ④: 규칙을 고칠 때 이미 맞춘 금액이 그대로인지). 개발 DB, 읽기만.
//   node --conditions=react-server --import ./scripts/lib/server-stub-hooks.mjs --import tsx scripts/check-3plant-oct.mts
// 기준: 26.10월 급여대장_3공장 — 정재호 · 강상목은 대장과 1원까지 같음, 이택준은 대장 10/23 오기라 앱 값(급여-71 ③).
import { config } from 'dotenv';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const live = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
const dev = config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {};
if (!dev.DEV_SUPABASE_URL || dev.DEV_SUPABASE_URL === live.NEXT_PUBLIC_SUPABASE_URL) throw new Error('개발 DB 주소가 없거나 운영과 같아서 멈춥니다');
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: dev.DEV_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: dev.DEV_SUPABASE_SERVICE_ROLE_KEY });
const { previewMonth } = await import('../src/lib/payroll/run-data.ts');
const { createAdminClient } = await import('../src/lib/supabase/admin.ts');

const WANT: Record<string, number> = { 정재호: 5_437_075, 강상목: 5_031_250, 이택준: 5_643_125 }; // 이택준 = 대장 5,631,875 + 10/23 오기 11,250
const { data: ppl } = await createAdminClient().from('profiles').select('id, name').in('name', Object.keys(WANT));
const nameOf = new Map((ppl ?? []).map((p) => [p.id as string, p.name as string]));
let bad = 0;
for (const r of await previewMonth('2026-10', false)) {
  const name = nameOf.get(r.employeeId);
  if (!name) continue;
  const pay = r.result.state === 'OK' ? r.result.totals.pay : null;
  const ok = pay === WANT[name];
  if (!ok) bad++;
  console.log(`${ok ? '같음' : '다름'} ${name} 앱 ${pay?.toLocaleString() ?? r.result.state} / 기준 ${WANT[name].toLocaleString()}`);
}
if (bad) process.exit(1);
