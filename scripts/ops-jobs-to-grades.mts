// 「직무」 이름표를 「직급」으로 정리 (2026-11-03 의뢰인: 시프티에서 옮긴 값에 시급제 · 월급제 · 경영지원실 · 영업부 · 관리자 : 팀장이 섞여 있었다).
//   npx tsx --conditions=react-server scripts/ops-jobs-to-grades.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// ① 직급 목록을 만든다: 사원 · 주임 · 대리 · 과장 · 차장 · 부장 · 실장 · 대표 · 임원 (순서대로, 이미 있으면 그대로 쓰고 순서만 맞춘다)
// ② 직급이 아닌 값(급여 형태 · 부서 · 직책)을 고른 직원은 직급을 비운다 — 「관리자 · 팀장」이던 직원은 직책 칸이 비어 있으면 「팀장」을 넣는다
// ③ 직급이 아닌 이름표는 끈다(지우지 않는다). 급여 계산에는 쓰이지 않는 값이라 급여는 바뀌지 않는다.
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

const GRADES = ['사원', '주임', '대리', '과장', '차장', '부장', '실장', '대표', '임원'];
const clean = (s: string) => s.replace(/^\s*\d+\s*[.)]\s*/, '').trim(); // 「1. 」 같은 앞 번호
const isLeader = (s: string) => /팀장|관리자/.test(s);

const db = createAdminClient();
console.log(prod ? '운영 DB' : '개발 DB');
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
const { data: jobs } = await db.from('jobs').select('id, name, sort, active').eq('active', true);
const { data: people } = await db.from('profiles').select('id, name, job_id, job_title, active').not('job_id', 'is', null);
const keep = new Map<string, string>(); // 직급 이름 → id
const drop: { id: string; name: string }[] = [];
for (const j of jobs ?? []) {
  const n = clean(j.name as string);
  if (GRADES.includes(n) && !keep.has(n)) keep.set(n, j.id as string);
  else drop.push({ id: j.id as string, name: j.name as string });
}
const add = GRADES.filter((g) => !keep.has(g));
console.log(`그대로 쓰는 직급: ${[...keep.keys()].join(', ') || '없음'}`);
console.log(`새로 만들 직급: ${add.join(', ') || '없음'}`);
console.log(`끌 이름표: ${drop.map((d) => d.name).join(', ') || '없음'}`);
const moved = (people ?? []).filter((p) => drop.some((d) => d.id === p.job_id));
for (const p of moved) {
  const was = drop.find((d) => d.id === p.job_id)!.name;
  const lead = isLeader(was) && !String(p.job_title ?? '').trim();
  console.log(`  ${p.name}${p.active ? '' : '(퇴사)'}: 「${was}」 → 직급 비움${lead ? ' · 직책 「팀장」' : ''}`);
}
if (!apply) { console.log(`직원 ${moved.length}명 바뀜 (보기만 — 적용하려면 --apply)`); process.exit(0); }

for (const [i, g] of GRADES.entries()) {
  if (keep.has(g)) {
    const { error } = await db.from('jobs').update({ name: g, sort: i + 1, updated_by: sys!.id }).eq('id', keep.get(g)!);
    if (error) throw new Error(`${g}: ${error.message}`);
  }
}
for (const p of moved) {
  const was = drop.find((d) => d.id === p.job_id)!.name;
  const patch: Record<string, unknown> = { job_id: null, updated_by: sys!.id };
  if (isLeader(was) && !String(p.job_title ?? '').trim()) patch.job_title = '팀장';
  const { error } = await db.from('profiles').update(patch).eq('id', p.id);
  if (error) throw new Error(`${p.name}: ${error.message}`);
}
for (const d of drop) {
  const { error } = await db.from('jobs').update({ active: false, updated_by: sys!.id }).eq('id', d.id);
  if (error) throw new Error(`끄기 ${d.name}: ${error.message}`);
}
if (add.length) {
  const { error } = await db.from('jobs').insert(add.map((g) => ({ name: g, sort: GRADES.indexOf(g) + 1, created_by: sys!.id, updated_by: sys!.id })));
  if (error) throw new Error(`만들기: ${error.message}`);
}
console.log(`적용함 — 직급 ${GRADES.length}개 · 직원 ${moved.length}명 · 끈 이름표 ${drop.length}개`);
