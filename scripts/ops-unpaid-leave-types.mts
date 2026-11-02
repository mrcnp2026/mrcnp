// 무급 지각/외출 휴가 유형 1~7시간 (2026-11-02 의뢰인: 늦게 온 시간은 무급 — 시간별 무급 유형을 골라 뺀다, 급여-61).
//   npx tsx scripts/ops-unpaid-leave-types.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// 유급 아님 · 연차에서 빼지 않음: 연차는 유급이라 「무급 + 연차 차감」은 같은 시간을 두 번 빼는 셈이다(근기법 60조). 바꾸려면 휴가 유형 화면에서 켠다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const prod = process.argv.includes('--prod');
const apply = process.argv.includes('--apply');
const root = path.join(import.meta.dirname, '..');
const live = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
const dev = config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {};
const db = prod ? createClient(live.NEXT_PUBLIC_SUPABASE_URL, live.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : createClient(dev.DEV_SUPABASE_URL, dev.DEV_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: actor } = await db.from('profiles').select('id').eq('active', true).eq('role', 'admin').not('employee_no', 'like', 'e2e-%').limit(1).single();
console.log(prod ? '운영 DB' : '개발 DB');
for (let h = 1; h <= 7; h++) {
  const name = `무급 지각/외출 ${h}H`;
  const { data: same } = await db.from('leave_types').select('code').eq('active', true).eq('name', name);
  if (same?.length) { console.log(name, '이미 있음'); continue; }
  if (!apply) { console.log(name, '만들 것'); continue; }
  const { error } = await db.from('leave_types').insert({ code: `c_${randomBytes(5).toString('hex')}`, name, is_paid: false, deducts_balance: false, day_unit: h / 8, hours: h, start_time: null, end_time: null, group_name: '[무급] 지각 / 외출', sort: 120 + h, builtin: false, updated_by: actor!.id });
  console.log(name, error ? error.message : '만듦');
}
