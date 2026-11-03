// 강상목 재직 기간 하나로 합치기 (2026-11-03 의뢰인: 10-25 퇴사 · 10-27 재입사는 「테스트였네」).
//   npx tsx --conditions=react-server scripts/ops-fix-period-kangsm.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// 직원 화면에서 비활성(퇴사) → 다시 활성으로 눌러 생긴 두 줄: 2026-07-01~10-25, 2026-10-27~. 그래서 10-26이 재직 밖이었다.
// ① 10-27~ 줄을 끈다(지우지 않는다) ② 07-01 줄의 끝을 비운다 — 순서가 반대면 기간이 겹쳐 DB가 막는다
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

const db = createAdminClient();
console.log(prod ? '운영 DB' : '개발 DB');
const { data: p } = await db.from('profiles').select('id').eq('name', '강상목').single();
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
const { data: per } = await db.from('staff_employment_periods').select('id, starts_on, ends_on').eq('employee_id', p!.id).eq('active', true).order('starts_on');
for (const r of per ?? []) console.log(`지금: ${r.starts_on} ~ ${r.ends_on ?? '(끝 없음)'}`);
const first = per?.find((r) => r.starts_on === '2026-07-01' && r.ends_on === '2026-10-25');
const second = per?.find((r) => r.starts_on === '2026-10-27' && r.ends_on === null);
if (!first || !second) { console.log('예상한 두 줄이 아니다 — 아무것도 하지 않음'); process.exit(0); }
console.log('바꾼 뒤: 2026-07-01 ~ (끝 없음) 한 줄');
if (!apply) { console.log('(보기만 — 적용하려면 --apply)'); process.exit(0); }

const r1 = await db.from('staff_employment_periods').update({ active: false, updated_by: sys!.id, note: '테스트로 생긴 재입사 줄 — 2026-11-03 의뢰인 확인, 07-01 줄로 합침' }).eq('id', second.id);
if (r1.error) throw r1.error;
const r2 = await db.from('staff_employment_periods').update({ ends_on: null, end_reason: null, updated_by: sys!.id }).eq('id', first.id);
if (r2.error) throw r2.error;
console.log('적용함');
