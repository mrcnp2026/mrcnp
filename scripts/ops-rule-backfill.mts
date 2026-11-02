// 근무 규칙 바로잡기 (급여-62, 2026-11-02 의뢰인) — 저녁 휴게 17:00–17:30 · 15분 끊기를 2026-10-01부터 적용한 판으로 둔다.
//   npx tsx scripts/ops-rule-backfill.mts            개발 DB, 바꿀 내용만 보여 준다
//   npx tsx scripts/ops-rule-backfill.mts --apply    개발 DB에 적용
//   npx tsx scripts/ops-rule-backfill.mts --prod --apply   운영 DB (의뢰인 승인 뒤에만)
// 화면(설정)은 지난 날짜로 규칙을 넣지 못하게 막는다(② 4-1 소급 금지). 이번 것은 입력이 늦었던 회사 규칙을 바로잡는 일이라 의뢰인 결정으로 스크립트로 한다.
// 규칙 행은 고칠 수 없으므로(work_rules_guard): 지금 규칙을 그대로 복사한 새 행을 FROM에 넣고, FROM 뒤 · 지금 규칙 앞의 중간 판(휴게 · 끊기가 빠진 것)은 숨긴다(active=false).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'node:path';

const FROM = '2026-10-01';
const prod = process.argv.includes('--prod');
const apply = process.argv.includes('--apply');
const root = path.join(import.meta.dirname, '..');
const live = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
const dev = config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {};
const url = prod ? live.NEXT_PUBLIC_SUPABASE_URL : dev.DEV_SUPABASE_URL;
const key = prod ? live.SUPABASE_SERVICE_ROLE_KEY : dev.DEV_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('DB 주소 · 열쇠가 비어 있습니다');
if (!prod && url === live.NEXT_PUBLIC_SUPABASE_URL) throw new Error('개발 주소가 운영 주소와 같아서 멈춥니다');
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: rules, error } = await db.from('work_rules').select('*').eq('active', true).order('effective_from');
if (error) throw error;
const latest = rules!.at(-1)!;
const same = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  ['start_time', 'end_time', 'late_grace_min', 'break_start', 'break_end', 'round_step_min', 'weekly_rest_day'].every((k) => a[k] === b[k]) &&
  JSON.stringify(a.extra_breaks) === JSON.stringify(b.extra_breaks) && JSON.stringify(a.workdays) === JSON.stringify(b.workdays);
const hide = rules!.filter((r) => r.effective_from > FROM && r.effective_from < latest.effective_from && !same(r, latest));
const atFrom = rules!.find((r) => r.effective_from === FROM);

console.log(`${prod ? '운영' : '개발'} DB · 기준 규칙 ${latest.effective_from} (${latest.start_time}–${latest.end_time}, 휴게 ${latest.break_start}–${latest.break_end} + ${JSON.stringify(latest.extra_breaks)}, 끊기 ${latest.round_step_min}분)`);
console.log(atFrom ? `${FROM}에 이미 규칙이 있음: ${same(atFrom, latest) ? '같은 내용 — 넣지 않음' : '내용이 다름 — 멈춥니다'}` : `${FROM}부터 같은 규칙을 새로 넣음`);
console.log(`숨길 중간 판: ${hide.map((r) => r.effective_from).join(', ') || '없음'}`);
if (atFrom && !same(atFrom, latest)) process.exit(1);
if (!apply) { console.log('(보기만 — 적용하려면 --apply)'); process.exit(0); }

if (!atFrom) {
  const { error: e } = await db.from('work_rules').insert({
    name: `rule ${FROM} (급여-62 바로잡기 2026-11-02)`, start_time: latest.start_time, end_time: latest.end_time, late_grace_min: latest.late_grace_min,
    break_start: latest.break_start, break_end: latest.break_end, extra_breaks: latest.extra_breaks, round_step_min: latest.round_step_min,
    workdays: latest.workdays, weekly_rest_day: latest.weekly_rest_day, effective_from: FROM, active: true,
  });
  if (e) throw e;
}
for (const r of hide) {
  const { error: e } = await db.from('work_rules').update({ active: false }).eq('id', r.id);
  if (e) throw e;
}
console.log('적용함');
