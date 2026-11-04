// 최고관리자 3명 연차 생성 제외 (2026-11-04 의뢰인: 「차지영 · 차재준 · 이상준 = 최고관리자 = 간주근무자 = 연차 · 근로일정 상관없음」).
//   npx tsx --conditions=react-server --import ./scripts/lib/server-stub-hooks.mjs scripts/ops-leave-exclude-1104.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// 「임원 (연차 생성 제외)」 묶음에 오늘부터 넣는다(이미 들어 있으면 그대로). 이미 받은 연차 지급 건은 지우지 않는다(지우는 기능은 없다).
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
const { setPolicyMember } = await import('../src/lib/leave-ledger-data.ts');
const { OFFICE } = await import('../src/config/office.ts');
const { toKstDate } = await import('../src/lib/time.ts');

const db = createAdminClient();
const today = toKstDate(new Date());
console.log(prod ? '운영 DB' : '개발 DB', apply ? '— 적용' : '— 보기만');
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
const { data: g } = await db.from('leave_policy_groups').select('id, name').eq('excluded', true).eq('active', true).single();
const { data: ppl } = await db.from('profiles').select('id, name').in('name', ['차지영', '차재준', '이상준']).eq('active', true);
for (const p of ppl ?? []) {
  const { data: m } = await db.from('leave_policy_members').select('group_id').eq('employee_id', p.id).eq('active', true).lte('valid_from', today).or(`valid_to.is.null,valid_to.gt.${today}`).maybeSingle();
  const { count } = await db.from('leave_grant_lots').select('id', { count: 'exact', head: true }).eq('employee_id', p.id).eq('state', 'APPROVED');
  if (m?.group_id === g!.id) { console.log(`  그대로: ${p.name} (이미 ${g!.name})`); continue; }
  console.log(`  넣음: ${p.name} → ${g!.name} (${today}부터)${count ? ` — 이미 받은 지급 건 ${count}개는 그대로` : ''}`);
  if (apply) await setPolicyMember({ employeeId: p.id, groupId: g!.id, validFrom: today, reason: '최고관리자 · 간주근무 — 연차 대상 아님 (2026-11-04 의뢰인)', me: { id: sys!.id } as never });
}
console.log(apply ? '적용 완료' : '(보기만 — 적용하려면 --apply)');
