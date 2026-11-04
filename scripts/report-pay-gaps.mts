// 직원별 통상시급 산출에 빠진 것 (2026-11-04 의뢰인: 시급 · 통상시급 산출 → 자동 급여 계산 → 급여대장). 읽기만 한다.
//   node --conditions=react-server --import ./scripts/lib/server-stub-hooks.mjs --import tsx scripts/report-pay-gaps.mts [--prod]   — 기본은 개발 DB
import { config } from 'dotenv';
import path from 'node:path';

const prod = process.argv.includes('--prod');
const root = path.join(import.meta.dirname, '..');
const live = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
const dev = config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {};
Object.assign(process.env, prod
  ? { NEXT_PUBLIC_SUPABASE_URL: live.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: live.SUPABASE_SERVICE_ROLE_KEY }
  : { NEXT_PUBLIC_SUPABASE_URL: dev.DEV_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: dev.DEV_SUPABASE_SERVICE_ROLE_KEY });
const { loadStaffPayBoard } = await import('../src/lib/payroll/staff-data.ts');
const { referenceHourly } = await import('../src/lib/payroll/contract.ts');
const { toKstDate } = await import('../src/lib/time.ts');

const GAP: Record<string, string> = { no_contract: '계약(급여 형태 · 금액) 없음', no_monthly_hours: '월 소정근로시간 없음', no_tax: '4대보험 · 세금 설정 없음', no_joined_on: '입사일 없음' };
const TYPE: Record<string, string> = { HOURLY: '시급', MONTHLY: '월급', ANNUAL: '연봉' };
console.log(prod ? '운영 DB — 읽기만' : '개발 DB — 읽기만');
const rows = (await loadStaffPayBoard(toKstDate(new Date()))).filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name));
let ok = 0;
for (const r of rows) {
  const c = r.contract;
  const hourly = c ? referenceHourly(c) : null;
  const gaps = r.gaps.map((g) => GAP[g] ?? g);
  if (!gaps.length) ok++;
  console.log([r.name.padEnd(5), c ? `${TYPE[c.payType] ?? c.payType} ${c.amount.toLocaleString()}원${c.monthlyHours ? ` ÷ ${c.monthlyHours}시간` : ''}` : '-', hourly ? `통상시급(참고) ${hourly.toLocaleString()}원` : '', `고정수당 ${r.items}개`, gaps.length ? `빠짐: ${gaps.join(' · ')}` : '다 있음'].join(' | '));
}
console.log(`\n다 있는 직원 ${ok}명 / 전체 ${rows.length}명`);
