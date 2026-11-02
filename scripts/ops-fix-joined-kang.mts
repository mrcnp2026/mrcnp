// 강혜주 입사일 바로잡기 + 지난 월차 넣기 (2026-11-03 의뢰인: 「강혜주 입사일은 2026년 1월 5일」).
//   npx tsx --conditions=react-server scripts/ops-fix-joined-kang.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// 시프티 · 앱에는 2025-08-04로 되어 있었고 시프티에서 연차가 한 번도 생기지 않아 잔액 0일이었다.
// ① 입사일 2026-01-05 (입사일 화면과 같은 일: profiles.joined_on + 재직 기간 새 시작일)
// ② 입사 1년 차 월차 k = 1~9 (2026-02-05 ~ 10-05, 각 1일, 쓸 수 있는 기간 ~ 2027-01-05) — 자동 발생 시작일(10-17) 전이라 앱이 만들지 않는 몫.
//    「옮긴 지급(migrated)」으로 넣는다: 자동 발생이 옮긴 월차 개수를 세어 k=10(11-05)부터 이어 만든다 — 같은 달이 두 번 생기지 않게
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
const { addManualLot } = await import('../src/lib/leave-ledger-data.ts');
const { OFFICE } = await import('../src/config/office.ts');

const JOINED = '2026-01-05';
const USABLE_TO = '2027-01-05';
const db = createAdminClient();
console.log(prod ? '운영 DB' : '개발 DB');
const { data: p } = await db.from('profiles').select('id, joined_on').eq('name', '강혜주').single();
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
const { data: open } = await db.from('staff_employment_periods').select('id, starts_on').eq('employee_id', p!.id).eq('active', true).is('ends_on', null).limit(1);
const { data: lots } = await db.from('leave_grant_lots').select('granted_on').eq('employee_id', p!.id).in('state', ['APPROVED', 'CANDIDATE']);
const months = Array.from({ length: 9 }, (_, i) => `2026-${String(i + 2).padStart(2, '0')}-05`);
const { data: notes } = await db.from('leave_grant_lots').select('note').eq('employee_id', p!.id).eq('state', 'APPROVED');
const todo = months.filter((m, i) => !(lots ?? []).some((l) => l.granted_on === m) && !(notes ?? []).some((n) => String(n.note ?? '').includes(`월차 ${i + 1}번째`)));
console.log(`입사일 ${p!.joined_on} → ${JOINED} · 재직 기간 시작 ${open?.[0]?.starts_on ?? '없음'} → ${JOINED}`);
console.log(`월차 넣을 것 ${todo.length}일: ${todo.join(', ')}`);
if (!apply) { console.log('(보기만 — 적용하려면 --apply)'); process.exit(0); }

if (p!.joined_on !== JOINED) {
  const { error } = await db.from('profiles').update({ joined_on: JOINED }).eq('id', p!.id);
  if (error) throw error;
}
if (open?.[0] && open[0].starts_on !== JOINED) {
  await db.from('staff_employment_periods').update({ active: false, updated_by: sys!.id }).eq('id', open[0].id);
  const { error } = await db.from('staff_employment_periods').insert({ employee_id: p!.id, starts_on: JOINED, created_by: sys!.id });
  if (error) throw error;
}
const me = { id: sys!.id } as never;
for (const [i, m] of todo.entries()) {
  const k = months.indexOf(m) + 1;
  const note = `입사일 2026-01-05 정정 — 입사 1년 차 월차 ${k}번째 (2026-11-03 의뢰인, 시프티에서 생기지 않았던 몫)`;
  let r = await addManualLot({ employeeId: p!.id, kind: 'migrated', minutes: 480, usableFrom: m, usableTo: USABLE_TO, note, me, basis: { rule: 'manual', month: k } });
  // 마감한 달(9월)에는 지급을 넣을 수 없다 — 그 몫은 마감 뒤 첫날(10-01)부터 쓸 수 있게 넣는다
  if (r.result === 'locked') r = await addManualLot({ employeeId: p!.id, kind: 'migrated', minutes: 480, usableFrom: '2026-10-01', usableTo: USABLE_TO, note: `${note} — ${m.slice(5, 7)}월은 마감돼 10-01부터`, me, basis: { rule: 'manual', month: k } });
  console.log(m, r.result, i + 1);
}
console.log('적용함');
