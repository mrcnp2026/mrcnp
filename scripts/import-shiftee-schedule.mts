// 시프티 실제 자료 옮기기 — 3단계: 근무 기준 (2026-10-16 의뢰인)
//   ① 회사 근무 규칙을 2026-01-01부터 (지금 규칙과 같은 값, 지각 10분까지는 지각으로 보지 않음) — 연간 리포트가 1월부터 나온다
//   ② 1공장 골판지사업부 기본 근무 07:30~17:00 (근무일정 틀로 1공장 직원에게)
//   ③ 출퇴근 파일의 날마다 근무일정(「08:00 - 17:00」 등)을 그날의 근무일정으로 — 지각 · 연장이 시프티와 같은 기준으로 계산된다
//      「무일정근무」 · 「간주 근무」는 일정을 만들지 않는다(틀 · 회사 규칙을 따른다). 입사일 전 날은 넣지 않는다.
//
//   npx tsx scripts/import-shiftee-schedule.mts            ← 계획만
//   npx tsx scripts/import-shiftee-schedule.mts --apply    ← 넣기 (이미 있는 것은 건너뜀)
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
// 갱신 (2026-10-17): --from=YYYY-MM-DD 이 날짜부터의 일정만 · --punch-file=<출퇴근 엑셀> (일정은 출퇴근 파일에 들어 있다)
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const FROM = arg('from') ?? '0000-01-01';
const PUNCH_FILE = arg('punch-file') ?? '../../레퍼런스/참고/26년직원별출퇴근기록.xlsx';
// 이미 들어간 표시를 전부 읽는다 — Supabase는 한 번에 1,000줄까지만 돌려준다(.limit(20000)이어도). 2026-10-17 고침
async function allOf<T>(page: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await page(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const ADMIN_ID = '635e204b-e5a5-4fee-bacc-95d4d2f4357e';
const MARK = '시프티 일정';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const audit = async (table: string, targetId: string, event: string, detail: Record<string, unknown>) => {
  await db.from('audit_logs').insert({ actor_id: ADMIN_ID, action: 'update', target_table: table, target_id: targetId, after_data: { event, ...detail }, reason: '시프티 실제 자료 옮기기 — 근무 기준 (2026-10-16 의뢰인)' });
};

// ① 근무 규칙
const { data: rules } = await db.from('work_rules').select('*').eq('active', true).order('effective_from');
const first = rules?.[0];
if (!first) throw new Error('근무 규칙이 없습니다');
console.log(`근무 규칙: 지금 첫 시작일 ${first.effective_from} · ${first.start_time}~${first.end_time} · 지각 유예 ${first.late_grace_min}분`);
if (first.effective_from > '2026-01-01') {
  console.log('  → 같은 값으로 2026-01-01부터 시작하는 규칙을 더한다 (지각 유예 10분)');
  if (APPLY) {
    const { id: _id, created_at: _c, effective_from: _e, name, ...rest } = first;
    const { data, error } = await db.from('work_rules').insert({ ...rest, name: `${name} — 2026-01-01부터 (시프티 기록에 맞춤)`, late_grace_min: 10, effective_from: '2026-01-01' }).select('id').single();
    if (error) throw new Error(`rule: ${error.message}`);
    await audit('work_rules', data.id, 'rule_added', { effectiveFrom: '2026-01-01' });
  }
}

// ② 1공장 기본 근무 틀
const { data: g1 } = await db.from('org_groups').select('id').eq('name', '1공장 골판지사업부').eq('active', true).single();
const { data: staff1 } = await db.from('profiles').select('id, name, shift_template_id').eq('group_id', g1!.id).eq('active', true);
console.log(`1공장 직원 ${staff1?.length}명 → 근무일정 틀 「1공장 기본」 07:30~17:00`);
if (APPLY) {
  let { data: tpl } = await db.from('shift_templates').select('id').eq('name', '1공장 기본').eq('active', true).maybeSingle();
  if (!tpl) {
    const r = await db.from('shift_templates').insert({ name: '1공장 기본', start_time: '07:30', end_time: '17:00', kind: 'normal', color: 'primary', memo: '1공장 골판지사업부 기본 근무 (2026-10-16 의뢰인)', created_by: ADMIN_ID, updated_by: ADMIN_ID }).select('id').single();
    if (r.error) throw new Error(`tpl: ${r.error.message}`);
    tpl = r.data;
  }
  const ids = (staff1 ?? []).filter((p) => p.shift_template_id !== tpl!.id).map((p) => p.id as string);
  if (ids.length) {
    const { error } = await db.from('profiles').update({ shift_template_id: tpl!.id, updated_by: ADMIN_ID }).in('id', ids);
    if (error) throw new Error(`assign: ${error.message}`);
  }
}

// ③ 날마다 근무일정
const val = (c: ExcelJS.CellValue) => (c instanceof Date ? c.toISOString().slice(0, 19) : c && typeof c === 'object' && 'result' in c ? (c as { result: unknown }).result : c);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(PUNCH_FILE);
const ws = wb.worksheets[0];
const head = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((h) => String(val(h) ?? ''));
const { data: people } = await db.from('profiles').select('id, name, joined_on').eq('active', true);
const pid = new Map((people ?? []).map((p) => [p.name as string, p]));
const want = new Map<string, { employee_id: string; work_date: string; start_time: string; end_time: string }>();
const skip = { none: 0, deemed: 0, beforeJoin: 0, odd: 0 };
for (let i = 2; i <= ws.rowCount; i++) {
  const r = Object.fromEntries(head.map((h, j) => [h, val((ws.getRow(i).values as ExcelJS.CellValue[])[j + 1])]));
  const p = pid.get(String(r['직원'] ?? ''));
  if (!p) continue;
  const date = String(r['출근시간'] ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  if ((p.joined_on ?? '0000') > date) { skip.beforeJoin++; continue; }
  const sch = String(r['근무일정'] ?? '').trim();
  if (sch === '무일정근무') { skip.none++; continue; }
  if (sch === '간주 근무') { skip.deemed++; continue; }
  const m = sch.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
  if (!m || m[2] <= m[1]) { skip.odd++; continue; }
  want.set(`${p.id}|${date}`, { employee_id: p.id as string, work_date: date, start_time: m[1], end_time: m[2] });
}
console.log(`날마다 근무일정 ${want.size}일 · 만들지 않음: 무일정근무 ${skip.none} · 간주 근무 ${skip.deemed} · 입사 전 ${skip.beforeJoin} · 알 수 없는 형식 ${skip.odd}`);
if (APPLY) {
  const have = await allOf<{ employee_id: string; work_date: string }>((a, b) => db.from('shifts').select('employee_id, work_date').eq('active', true).order('id').range(a, b));
  const exists = new Set(have.map((s) => `${s.employee_id}|${s.work_date}`));
  const todo = [...want.values()].filter((s) => s.work_date >= FROM && !exists.has(`${s.employee_id}|${s.work_date}`)).map((s) => ({ ...s, kind: 'normal', note: MARK, created_by: ADMIN_ID, updated_by: ADMIN_ID }));
  for (let i = 0; i < todo.length; i += 500) {
    const { error } = await db.from('shifts').insert(todo.slice(i, i + 500));
    if (error) throw new Error(`shifts ${i}: ${error.message}`);
    console.log(`  근무일정 ${Math.min(i + 500, todo.length)} / ${todo.length}`);
  }
}
console.log(APPLY ? '끝났습니다.' : '\n계획만 보여 줬습니다. 넣으려면 --apply');
