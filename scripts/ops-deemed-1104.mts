// 최고관리자 간주근무 템플릿 나누기 (2026-11-04 의뢰인: 「이상준 · 차지영은 최고관리자 · 간주근무, 임원은 차재준 대표 1명」).
//   npx tsx --conditions=react-server scripts/ops-deemed-1104.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// ① 「간주 근무」 템플릿(08:00~17:00 · 간주 · 보라)이 없으면 만든다 — 임원 템플릿과 같은 시간이라 간주에서 옮기는 사람의 계산은 그대로다
// ② 이상준 · 차지영을 「간주 근무」로 옮긴다(지금 어디에 있든). 차재준은 「임원 (판정 제외)」 그대로
// ③ 쓰는 직원이 없어진 「1공장 기본」은 끈다(지우지 않는다)
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
const ok = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
const by = sys!.id as string;
const NAME = '간주 근무';
const { data: tpls } = await db.from('shift_templates').select('id, name, start_time, end_time, kind, active');
const { data: ppl } = await db.from('profiles').select('id, name, shift_template_id').eq('active', true);
const nameOf = (id: string | null) => tpls?.find((t) => t.id === id)?.name ?? '(없음)';
let target = tpls?.find((t) => t.name === NAME) ?? null;
if (target) console.log(`  있음: ${NAME} ${target.start_time.slice(0, 5)}~${target.end_time.slice(0, 5)} ${target.kind}`);
else console.log(`  만듦: ${NAME} 08:00~17:00 간주 · 보라`);
const movers = ['이상준', '차지영'].map((n) => ppl?.find((p) => p.name === n)).filter((p) => !!p);
for (const p of movers) console.log(`  ${p!.name}: ${nameOf(p!.shift_template_id)} → ${NAME}`);
const left = (id: string) => (ppl ?? []).filter((p) => p.shift_template_id === id && !movers.some((m) => m!.id === p.id));
const factory = tpls?.find((t) => t.name === '1공장 기본' && t.active);
const offFactory = factory && left(factory.id).length === 0;
if (offFactory) console.log('  끔: 1공장 기본');
if (!apply) { console.log('(보기만 — 적용하려면 --apply)'); process.exit(0); }

if (!target) target = ok(await db.from('shift_templates').insert({ name: NAME, start_time: '08:00', end_time: '17:00', kind: 'deemed', color: 'purple', memo: '최고관리자 간주근무 — 출퇴근 기록과 상관없이 이 시간으로 계산 (2026-11-04 의뢰인: 이상준 · 차지영, 임원은 차재준 대표만)', created_by: by, updated_by: by }).select('id, name, start_time, end_time, kind, active').single());
for (const p of movers) ok(await db.from('profiles').update({ shift_template_id: target!.id, updated_by: by }).eq('id', p!.id));
if (offFactory) ok(await db.from('shift_templates').update({ active: false, updated_by: by }).eq('id', factory!.id));
console.log('적용 완료');
