// 「다시 볼 것」 정리 (2026-11-03 의뢰인: 요청 363 — 대부분 10월 규칙 반영(15분 · 저녁 휴게)으로 다시 계산한 값이 바뀐 승인 건).
//   npx tsx --conditions=react-server scripts/ops-overtime-review-clear.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// 급여는 이미 min(승인한 값, 지금 계산)으로 낸다. 그래서 같은 값으로 다시 승인하면 급여는 그대로이고 표시만 내려간다:
//   인정분 = min(지금 승인한 값, 다시 계산한 값) — 칸마다(연장 · 야간 · 휴일). 같은 DB 함수 decide_overtime, 직원 폰 알림 없음
// 10월 이후 근무인데 연장이 늘어난 건은 건드리지 않는다 — 늘어난 몫을 주려면 사실 칸을 바꿔야 해서 따로 정한다
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
const { data: people } = await db.from('profiles').select('id, name');
const nm = (id: string) => people?.find((p) => p.id === id)?.name ?? '?';
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
const { data: rows } = await db.from('overtime_requests').select('*').eq('is_test', false).eq('needs_review', true).eq('status', 'approved').order('work_date').limit(5000);
const keep: typeof rows = [];
const todo: { r: NonNullable<typeof rows>[number]; o: number; n: number; h: number }[] = [];
for (const r of rows ?? []) {
  const pick = (k: 'overtime' | 'night' | 'holiday') => Math.min(r[`approved_${k}_minutes`] ?? r[`${k}_minutes`], r[`recomputed_${k}_minutes`] ?? r[`${k}_minutes`]);
  const grew = (r.recomputed_overtime_minutes ?? r.overtime_minutes) > r.overtime_minutes || (r.recomputed_holiday_minutes ?? r.holiday_minutes) > r.holiday_minutes;
  if (grew && r.work_date >= '2026-10-01') { keep!.push(r); continue; }
  todo.push({ r, o: pick('overtime'), n: pick('night'), h: pick('holiday') });
}
console.log(`다시 볼 것 ${rows?.length ?? 0}건 → 정리 ${todo.length}건 · 남김(10월 이후 늘어난 것) ${keep!.length}건`);
for (const r of keep!) console.log(`  남김 ${r.work_date} ${nm(r.employee_id)}: 연장 ${r.overtime_minutes}→${r.recomputed_overtime_minutes ?? r.overtime_minutes}분 · 휴일 ${r.holiday_minutes}→${r.recomputed_holiday_minutes ?? r.holiday_minutes}분`);
if (!apply) { console.log('(보기만 — 적용하려면 --apply)'); process.exit(0); }
let ok = 0;
for (const { r, o, n, h } of todo) {
  const { data, error } = await db.rpc('decide_overtime', { p_id: r.id, p_decision: 'approved', p_approved_minutes: o, p_approved_night: n, p_approved_holiday: h, p_decided_by: sys!.id, p_reason: '다시 계산한 값 반영(급여와 같은 값) — 2026-11-03 의뢰인 정리', p_request_id: null });
  if (error || data !== 'ok') console.log(`  ${r.work_date} ${nm(r.employee_id)}: ${error ? `실패 ${error.code} ${error.message}` : data}`);
  else ok++;
}
console.log(`적용함 ${ok}/${todo.length}`);
