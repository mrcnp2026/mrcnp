// 3공장 시급제 3명의 근로계약서 조건을 급여 설정에 넣는다 (2026-11-02 의뢰인: 「근로계약서의 공제 · 지급 항목 · 시간을 반영해 봐」).
//   npx tsx scripts/ops-contract-3plant.mts            개발 DB, 넣을 내용만 보여 준다
//   npx tsx scripts/ops-contract-3plant.mts --apply    개발 DB에 넣는다
//   npx tsx scripts/ops-contract-3plant.mts --prod --apply   운영 DB (2026-11-02 의뢰인 승인 — 운영에도 가짜 월급제 샘플이 남아 있었다)
// 근거: 근로계약서(시급제) — 시급, 만근수당 200,000(월 15일 이상 출근 · 무단결근 없음), 위험수당 300,000(강상목 · 정재호), 공제 = 소득세 · 고용 · 건강 · 국민연금.
// 계약 시작은 7/1(이택준 6/1)이지만, 개발 DB의 가짜 월급제 판이 7~9월 명세서에 쓰여 있어 같은 날짜로 바꾸지 못한다 → 2026-10-01부터 새 판.
// 만근 · 위험수당은 통상임금에서 뺀다(EXCLUDED) — 26.10 대장이 연장 · 휴일을 계약 시급 그대로 × 1.5로 줬다. 법 판단은 검증 대기(위험수당은 고정 · 일률이라 통상임금일 수 있다).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'node:path';

const FROM = '2026-10-01';
const apply = process.argv.includes('--apply');
const prod = process.argv.includes('--prod');
const root = path.join(import.meta.dirname, '..');
const live = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
const dev = config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {};
if (!prod && (!dev.DEV_SUPABASE_URL || dev.DEV_SUPABASE_URL === live.NEXT_PUBLIC_SUPABASE_URL)) throw new Error('개발 DB 주소가 없거나 운영과 같아서 멈춥니다');
const db = prod ? createClient(live.NEXT_PUBLIC_SUPABASE_URL, live.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : createClient(dev.DEV_SUPABASE_URL, dev.DEV_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
console.log(prod ? '운영 DB' : '개발 DB');

const PEOPLE = [
  { name: '강상목', hourly: 12_500, items: { FULL_ATTENDANCE: 200_000, HAZARD_ALLOWANCE: 300_000 } },
  { name: '이택준', hourly: 15_000, items: { FULL_ATTENDANCE: 200_000 } },
  { name: '정재호', hourly: 14_300, items: { FULL_ATTENDANCE: 200_000, HAZARD_ALLOWANCE: 300_000 } },
] as const;
const ITEMS = [
  { code: 'FULL_ATTENDANCE', ko_name: '만근수당', en_name: 'Perfect attendance allowance', default_amount: 200_000, sort: 210 },
  { code: 'HAZARD_ALLOWANCE', ko_name: '위험수당', en_name: 'Hazard allowance', default_amount: 300_000, sort: 220 },
];

const { data: actor } = await db.from('profiles').select('id, name').eq('active', true).eq('role', 'admin').eq('can_view_payroll', true).not('employee_no', 'like', 'e2e-%').limit(1).single();
if (!actor) throw new Error('급여를 볼 수 있는 관리자가 없습니다');
const rpc = async (p_table: string, p_identity: string, p_values: Record<string, unknown>, reason: string, expected: number) => {
  const { data, error } = await db.rpc('append_payroll_version_atomic', { p_table, p_identity, p_values, p_valid_from: FROM, p_reason: reason, p_expected_version: expected, p_actor: actor.id });
  if (error) throw new Error(`${p_table} ${p_identity}: ${error.message}`);
  return data;
};

// 1. 회사 항목 (없을 때만)
for (const it of ITEMS) {
  const { data: has } = await db.from('payroll_item_versions').select('id').eq('code', it.code).eq('status', 'active').limit(1);
  console.log(`항목 ${it.ko_name}: ${has?.length ? '이미 있음' : '새로 만듦'}`);
  if (!has?.length && apply) {
    const { code, ...v } = it;
    await rpc('payroll_item_versions', code, { ...v, kind: 'PAYMENT', calc_kind: 'FIXED', fixed_allowance: true, tax_treatment: 'TAXABLE', ordinary_wage: 'EXCLUDED' }, '3공장 근로계약서 (2026-11-02)', 0);
  }
}

// 2. 사람별 계약 · 개인 항목
for (const p of PEOPLE) {
  const { data: who } = await db.from('profiles').select('id').eq('name', p.name).single();
  const { data: cur } = await db.from('payroll_contract_versions').select('version, valid_from, pay_type, amount').eq('employee_id', who!.id).eq('status', 'active').order('version', { ascending: false }).limit(1);
  const last = cur?.[0];
  const sameAlready = last && last.pay_type === 'HOURLY' && Number(last.amount) === p.hourly;
  console.log(`${p.name}: 지금 ${last ? `${last.pay_type} ${Number(last.amount).toLocaleString()}원 (${last.valid_from}~)` : '계약 없음'} → 시급 ${p.hourly.toLocaleString()}원 (${FROM}~)${sameAlready ? ' — 이미 같음' : ''}`);
  if (apply && !sameAlready) {
    const { data: emp } = await db.from('staff_employment_periods').select('id, starts_on, ends_on').eq('employee_id', who!.id).eq('active', true);
    const employmentId = (emp ?? []).find((e) => e.starts_on <= FROM && (e.ends_on === null || FROM <= e.ends_on))?.id ?? null;
    await rpc('payroll_contract_versions', who!.id, { pay_type: 'HOURLY', amount: p.hourly, time_basis: 'ACTUAL', monthly_hours: 209, annual_divisor: null, included: { note: null, holidayHours: null, overtimeHours: null }, employment_id: employmentId }, '근로계약서(시급제) 반영 — 2026-11-02', (last?.version as number | undefined) ?? 0);
  }
  for (const [code, amount] of Object.entries(p.items)) {
    const { data: has } = await db.from('payroll_employee_items').select('id').eq('employee_id', who!.id).eq('item_code', code).eq('active', true).limit(1);
    console.log(`  ${code} ${amount.toLocaleString()}원: ${has?.length ? '이미 있음' : '붙임'}`);
    if (!has?.length && apply) {
      const { error } = await db.from('payroll_employee_items').insert({ employee_id: who!.id, item_code: code, amount, note: '근로계약서', valid_from: FROM, created_by: actor.id });
      if (error) throw new Error(`${p.name} ${code}: ${error.message}`);
    }
  }
}
console.log(apply ? '넣음' : '(보기만 — 넣으려면 --apply)');
