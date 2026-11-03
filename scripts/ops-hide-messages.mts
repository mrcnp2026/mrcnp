// 전달 글 숨기기 (2026-11-03 의뢰인: 「전달에 이미 기록된 연장근로 · 회신 필요 · 안내 메시지는 지워버려」). 지우지 않고 숨긴다(0085).
//   npx tsx --conditions=react-server scripts/ops-hide-messages.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// 대상: 지금까지 쌓인 전달 글 전부 — 요청 처리 결과(decision, 11-01 이관 정리 때 300건 넘게 생김) · 연차 촉진 시험 통지(promotion) · 마감 안내(closing).
//   관리자가 손으로 보낸 전달(kind notice, related 없음)은 건드리지 않는다.
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

const TYPES = ['decision', 'promotion', 'closing'];
const db = createAdminClient();
console.log(prod ? '운영 DB' : '개발 DB');
const cutoff = new Date().toISOString(); // 이 시각 전에 생긴 것만
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
const { data } = await db.from('work_messages').select('id, kind, title, related, created_at').is('hidden_at', null).lt('created_at', cutoff).limit(5000);
const target = (data ?? []).filter((m) => TYPES.includes((m.related as { type?: string })?.type ?? ''));
const by = new Map<string, number>();
for (const m of target) { const k = `${(m.related as { type: string }).type} · 예: ${m.title}`.replace(/ · 예: .*/, ''); by.set(k, (by.get(k) ?? 0) + 1); }
console.log(`숨길 글 ${target.length}건 (남기는 글 ${(data?.length ?? 0) - target.length}건)`);
for (const [k, n] of by) console.log(`  ${k}: ${n}건`);
if (!apply) { console.log('(보기만 — 숨기려면 --apply)'); process.exit(0); }
let done = 0;
for (let i = 0; i < target.length; i += 200) {
  const ids = target.slice(i, i + 200).map((m) => m.id);
  const { error } = await db.from('work_messages').update({ hidden_at: new Date().toISOString(), hidden_by: sys!.id }).in('id', ids).is('hidden_at', null);
  if (error) throw new Error(error.message);
  done += ids.length;
}
console.log(`숨김 ${done}건`);
