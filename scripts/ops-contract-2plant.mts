// 2공장 시급제 3명을 앱에 시급제로 바꾼다 (2026-11-18 의뢰인: 「앱을 시급제로 바꾸고 일단」). 개발 DB만.
//   npx tsx scripts/ops-contract-2plant.mts            넣을 내용만 보여 준다
//   npx tsx scripts/ops-contract-2plant.mts --apply    개발 DB에 넣는다
// 근거: 2공장 10월급여명세서.pdf의 기본시급(= 통상시급). 수당(만근 · 성과급 · 직급 · 출산보육)은 매달 고정인지 회사 확인 뒤에 넣는다.
// 3공장(ops-contract-3plant)과 같은 까닭으로 2026-10-01부터 새 판.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'node:path';

const FROM = '2026-10-01';
const apply = process.argv.includes('--apply');
const root = path.join(import.meta.dirname, '..');
const live = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
const dev = config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {};
if (!dev.DEV_SUPABASE_URL || dev.DEV_SUPABASE_URL === live.NEXT_PUBLIC_SUPABASE_URL) throw new Error('개발 DB 주소가 없거나 운영과 같아서 멈춥니다');
const db = createClient(dev.DEV_SUPABASE_URL, dev.DEV_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
console.log('개발 DB');

const PEOPLE = [
  { name: '정원채', hourly: 13_000 },
  { name: '최근원', hourly: 13_000 },
  { name: '노해균', hourly: 11_500 },
] as const;

const { data: actor } = await db.from('profiles').select('id, name').eq('active', true).eq('role', 'admin').eq('can_view_payroll', true).not('employee_no', 'like', 'e2e-%').limit(1).single();
if (!actor) throw new Error('급여를 볼 수 있는 관리자가 없습니다');

for (const p of PEOPLE) {
  const { data: who } = await db.from('profiles').select('id').eq('name', p.name).single();
  const { data: cur } = await db.from('payroll_contract_versions').select('version, valid_from, pay_type, amount').eq('employee_id', who!.id).eq('status', 'active').order('version', { ascending: false }).limit(1);
  const last = cur?.[0];
  const sameAlready = last && last.pay_type === 'HOURLY' && Number(last.amount) === p.hourly;
  console.log(`${p.name}: 지금 ${last ? `${last.pay_type} ${Number(last.amount).toLocaleString()}원 (${last.valid_from}~)` : '계약 없음'} → 시급 ${p.hourly.toLocaleString()}원 (${FROM}~)${sameAlready ? ' — 이미 같음' : ''}`);
  if (apply && !sameAlready) {
    const { data: emp } = await db.from('staff_employment_periods').select('id, starts_on, ends_on').eq('employee_id', who!.id).eq('active', true);
    const employmentId = (emp ?? []).find((e) => e.starts_on <= FROM && (e.ends_on === null || FROM <= e.ends_on))?.id ?? null;
    const { error } = await db.rpc('append_payroll_version_atomic', { p_table: 'payroll_contract_versions', p_identity: who!.id, p_values: { pay_type: 'HOURLY', amount: p.hourly, time_basis: 'ACTUAL', monthly_hours: 209, annual_divisor: null, included: { note: null, holidayHours: null, overtimeHours: null }, employment_id: employmentId }, p_valid_from: FROM, p_reason: '2공장 10월 명세서 시급 반영 — 2026-11-18', p_expected_version: (last?.version as number | undefined) ?? 0, p_actor: actor.id });
    if (error) throw new Error(`${p.name}: ${error.message}`);
  }
}
console.log(apply ? '넣음' : '(보기만 — 넣으려면 --apply)');
