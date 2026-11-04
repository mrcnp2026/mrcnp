// 무일정 근무 템플릿 만들고 강혜주 옮기기 (2026-11-04 의뢰인: 「강혜주는 청소하시는 분, 무일정 근무자」). 마이그레이션 0091 뒤에.
//   npx tsx --conditions=react-server scripts/ops-free-1104.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// 템플릿 시각(08:00~17:00)은 칸을 채우는 값일 뿐 — 유형이 free면 계획을 만들지 않는다(src/lib/shifts.ts planDay)
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
console.log(prod ? '운영 DB' : '개발 DB', apply ? '— 적용' : '— 보기만');
const NAME = '무일정 근무';
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
const by = sys!.id as string;
const { data: tpls } = await db.from('shift_templates').select('id, name, kind');
const { data: who } = await db.from('profiles').select('id, name, shift_template_id').eq('name', '강혜주').eq('active', true).maybeSingle();
let t = tpls?.find((x) => x.name === NAME) ?? null;
console.log(t ? `  있음: ${NAME} (${t.kind})` : `  만듦: ${NAME} — 유형 무일정`);
console.log(who ? `  강혜주: ${tpls?.find((x) => x.id === who.shift_template_id)?.name ?? '(없음)'} → ${NAME}` : '  강혜주 없음');
if (!apply) { console.log('(보기만 — 적용하려면 --apply)'); process.exit(0); }
if (!t) {
  const r = await db.from('shift_templates').insert({ name: NAME, start_time: '08:00', end_time: '17:00', kind: 'free', color: 'pink', memo: '정해진 시간 없이 찍은 시간만 센다 — 지각 · 조퇴 · 미출근 없음 (2026-11-04 의뢰인: 청소)', created_by: by, updated_by: by }).select('id, name, kind').single();
  if (r.error) throw new Error(r.error.message);
  t = r.data;
}
if (who) { const r = await db.from('profiles').update({ shift_template_id: t!.id, updated_by: by }).eq('id', who.id); if (r.error) throw new Error(r.error.message); }
console.log('적용 완료');
