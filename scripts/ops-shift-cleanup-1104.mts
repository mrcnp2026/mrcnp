// 근무일정 템플릿 정리 · 차지영 연차 제외 풀기 (2026-11-04 의뢰인: 「진행해」).
//   npx tsx --conditions=react-server scripts/ops-shift-cleanup-1104.mts [--prod] [--apply] [--keep-cha-shift]   — 기본은 개발 DB, 보기만
//   --keep-cha-shift: 차지영 템플릿은 그대로 둔다 — 임원 템플릿이 간주 근무라 옮기면 마감 전 10월 계산이 바뀐다(10월 마감 뒤 다시 돌린다)
// ① 템플릿 색: 정규 초록 · 조기 07:00 주황 · 07:30 파랑 · 07:40 하늘 · 임원 회색 (마이그레이션 0090 뒤에)
// ② 테스트 관리자: 「조기근무」 → 「조기 07:30+정규근무」(같은 07:30~17:00)
// ③ 차지영: 임원 아님(의뢰인) — 「임원 (판정 제외)」 → 「정규 근무」, 「임원 (연차 생성 제외)」 묶음은 오늘로 끝(지우지 않는다)
// ④ 쓰는 직원이 없는 템플릿은 끈다(지우지 않는다): 조기 0.5H + 정규 8H · 1공장 기본 · 테스트1 · 조기근무
// 이름으로 찾는다 — 없으면 그 줄은 건너뛰고 알린다.
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
const { toKstDate } = await import('../src/lib/time.ts');

const db = createAdminClient();
const today = toKstDate(new Date());
console.log(prod ? '운영 DB' : '개발 DB', apply ? '— 적용' : '— 보기만');
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
const by = sys!.id as string;
const { data: tpls } = await db.from('shift_templates').select('id, name, color, kind, active');
const { data: ppl } = await db.from('profiles').select('id, name, shift_template_id').eq('active', true);
const tpl = (name: string) => tpls?.find((t) => t.name === name) ?? null;
const users = (id: string) => (ppl ?? []).filter((p) => p.shift_template_id === id).map((p) => p.name as string);
const todo: { say: string; run: () => Promise<unknown> }[] = [];
const ok = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };

// ① 색
for (const [name, color] of [['정규 근무', 'primary'], ['조기 07:00+정규근무', 'orange'], ['조기 07:30+정규근무', 'blue'], ['조기 07:40+정규근무', 'sky'], ['임원 (판정 제외)', 'muted']] as const) {
  const t = tpl(name);
  if (!t) { console.log(`  없음: ${name}`); continue; }
  if (t.color !== color) todo.push({ say: `색 ${name}: ${t.color} → ${color}`, run: async () => ok(await db.from('shift_templates').update({ color, updated_by: by }).eq('id', t.id)) });
}
// ②③ 직원 옮기기
const move = (who: string, from: string, to: string) => {
  const p = ppl?.find((x) => x.name === who), a = tpl(from), b = tpl(to);
  if (!p || !a || !b) return console.log(`  건너뜀: ${who} (${from} → ${to}) — 직원이나 템플릿이 없음`);
  if (p.shift_template_id !== a.id) return console.log(`  건너뜀: ${who}는 「${from}」이 아님`);
  todo.push({ say: `${who}: ${from} → ${to}`, run: async () => ok(await db.from('profiles').update({ shift_template_id: b.id, updated_by: by }).eq('id', p.id)) });
  p.shift_template_id = b.id; // ④ 계산에 반영
};
move('테스트 관리자', '조기근무', '조기 07:30+정규근무');
if (!process.argv.includes('--keep-cha-shift')) move('차지영', '임원 (판정 제외)', '정규 근무');
const cha = ppl?.find((x) => x.name === '차지영');
const { data: ex } = await db.from('leave_policy_groups').select('id').eq('excluded', true).eq('active', true);
const { data: mem } = cha ? await db.from('leave_policy_members').select('id, valid_from').eq('employee_id', cha.id).eq('active', true).in('group_id', (ex ?? []).map((g) => g.id)).is('valid_to', null) : { data: [] };
for (const m of mem ?? []) todo.push({ say: `차지영: 연차 생성 제외 묶음 ${m.valid_from} ~ ${today}로 끝`, run: async () => ok(await db.from('leave_policy_members').update({ valid_to: today, updated_by: by }).eq('id', m.id)) });
// ④ 끄기
for (const name of ['조기 0.5H + 정규 8H', '1공장 기본', '테스트1', '조기근무']) {
  const t = tpl(name);
  if (!t || !t.active) continue;
  const left = users(t.id);
  if (left.length) { console.log(`  끄지 않음: ${name} — 쓰는 직원 ${left.join(' · ')}`); continue; }
  todo.push({ say: `끔: ${name}`, run: async () => ok(await db.from('shift_templates').update({ active: false, updated_by: by }).eq('id', t.id)) });
}

for (const x of todo) console.log(`  ${x.say}`);
if (!todo.length) console.log('  할 것 없음');
if (!apply) { console.log('(보기만 — 적용하려면 --apply)'); process.exit(0); }
for (const x of todo) await x.run(); // 옮기기가 끄기보다 먼저 (쓰는 직원이 있으면 끄지 못한다)
console.log('적용 완료');
