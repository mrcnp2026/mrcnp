// 연장 요청 3건 결정 (2026-11-03 의뢰인: 「9/9 반려하고 10월 2건은 승인해줘」).
//   npx tsx --conditions=react-server scripts/ops-overtime-decide-3.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// 9/9 강상목 반려 · 10/12 이택준 · 10/30 강호수 전액 승인. 화면과 같은 DB 함수 decide_overtime. 직원 폰 알림은 보내지 않는다
import { config } from 'dotenv';
import path from 'node:path';

const prod = process.argv.includes('--prod');
const apply = process.argv.includes('--apply');
const root = path.join(import.meta.dirname, '..');
const live = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
const dev = config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {};
Object.assign(process.env, prod
  ? { NEXT_PUBLIC_SUPABASE_URL: live.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: live.SUPABASE_SERVICE_ROLE_KEY }
  : { NEXT_PUBLIC_SUPABASE_URL: dev.DEV_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: dev.DEV_SUPABASE_SERVICE_ROLE_KEY });
const { createAdminClient } = await import('../src/lib/supabase/admin.ts');
const { OFFICE } = await import('../src/config/office.ts');

const PLAN = [
  { name: '강상목', date: '2026-09-09', decision: 'rejected', reason: '9월 급여는 시프티 기준으로 지급 끝 — 2026-11-03 의뢰인' },
  { name: '이택준', date: '2026-10-12', decision: 'approved', reason: null },
  { name: '강호수', date: '2026-10-30', decision: 'approved', reason: null },
] as const;
const db = createAdminClient();
console.log(prod ? '운영 DB' : '개발 DB');
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
for (const x of PLAN) {
  const { data: p } = await db.from('profiles').select('id').eq('name', x.name).single();
  const { data: r } = await db.from('overtime_requests').select('id, status, overtime_minutes').eq('employee_id', p!.id).eq('work_date', x.date).eq('is_test', false).maybeSingle();
  if (!r) { console.log(`${x.date} ${x.name}: 요청 없음`); continue; }
  console.log(`${x.date} ${x.name}: 지금 ${r.status} 연장 ${r.overtime_minutes}분 → ${x.decision === 'approved' ? '승인' : '반려'}`);
  if (!apply || r.status !== 'pending') continue;
  const { data, error } = await db.rpc('decide_overtime', { p_id: r.id, p_decision: x.decision, p_approved_minutes: null, p_approved_night: null, p_approved_holiday: null, p_decided_by: sys!.id, p_reason: x.reason, p_request_id: null });
  console.log(`  → ${error ? `실패 ${error.code} ${error.message}` : data}`);
}
if (!apply) console.log('(보기만 — 적용하려면 --apply)');
