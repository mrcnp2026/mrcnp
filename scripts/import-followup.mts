// 시프티 엑셀로 기록을 넣은 뒤 마무리 (2026-10-17 의뢰인: 1월에 모든 직원이 앱을 쓰기 전까지는 엑셀로 DB를 갱신한다).
//   ① 그 기간의 연장 요청을 만든다(/api/admin/overtime/sync — 2026-10-19부터 화면을 열어도 계산하지 않는다)
//   ② 옮겨 온 기록(source 'import')에서 생긴 대기 연장은 승인한다 — 결정 2026-10-16 「옮긴 연장은 승인된 것으로」
//   ③ 퇴근이 빠진 날을 보여 준다 — 채우는 방법은 결정에 따라(2026-10-17 50일은 「그날 일정 끝 시각」)
//   ④ 기록이 있는 날을 확정한다(퇴근이 빠진 날 · 대기 정정이 있는 날은 사이트가 건너뛰고 이유를 알려 준다)
// 모두 실제 사이트의 관리자 API로 한다 — 화면에서 누른 것과 같은 검사 · 변경 기록이 남는다.
//
//   npx tsx scripts/import-followup.mts --from=2026-10-17 --to=2026-11-15            ← 무엇을 할지만 보여 준다
//   npx tsx scripts/import-followup.mts --from=2026-10-17 --to=2026-11-15 --apply    ← 실제로 한다
//   로그인: 환경 변수 SITE_ID · SITE_PW (최고관리자 계정). 비밀번호는 파일에 적지 않는다.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { request } from 'playwright-core';

const APPLY = process.argv.includes('--apply');
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const FROM = arg('from');
const TO = arg('to');
if (!FROM || !TO || !/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO) || FROM > TO) throw new Error('--from=YYYY-MM-DD --to=YYYY-MM-DD');
const BASE = 'https://mrcnp-saas.vercel.app';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function allOf<T>(page: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await page(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const { data: people } = await db.from('profiles').select('id, name');
const nameOf = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
const punches = await allOf<{ id: string; employee_id: string; work_date: string; kind: string; source: string }>((a, b) =>
  db.from('punch_events').select('id, employee_id, work_date, kind, source').eq('is_test', false).gte('work_date', FROM).lte('work_date', TO).order('id').range(a, b));
// 승인된 관리자 정정(빠진 퇴근 넣기 · 줄 무효 · 시각 고침)까지 더해서 센다
const fixes = await allOf<{ correction_type: string; target_id: string | null; employee_id: string; work_date: string; kind: string | null }>((a, b) =>
  db.from('punch_corrections').select('correction_type, target_id, employee_id, work_date, kind').eq('is_test', false).eq('status', 'approved').gte('work_date', FROM).lte('work_date', TO).order('id').range(a, b));
const voided = new Set(fixes.filter((f) => f.correction_type === 'void' && f.target_id).map((f) => f.target_id as string));
const days = new Map<string, { in: number; out: number; imported: boolean }>();
const add = (employeeId: string, date: string, kind: string | null, imported: boolean) => {
  const k = `${employeeId}|${date}`;
  const d = days.get(k) ?? { in: 0, out: 0, imported: false };
  if (kind === 'in') d.in++;
  else if (kind === 'out') d.out++;
  if (imported) d.imported = true;
  days.set(k, d);
};
for (const p of punches) add(p.employee_id, p.work_date, voided.has(p.id) ? null : p.kind, p.source === 'import');
for (const f of fixes) if (f.correction_type === 'add_missing') add(f.employee_id, f.work_date, f.kind, false);
console.log(`${FROM} ~ ${TO}: 출퇴근 ${punches.length}개 · ${days.size}일(사람 × 날)`);
const open = [...days].filter(([, d]) => d.in > d.out).map(([k]) => k.split('|'));
console.log(`③ 퇴근이 빠진 날 ${open.length}일${open.length ? ':\n   ' + open.map(([id, d]) => `${nameOf.get(id)} ${d}`).sort().join('\n   ') : ''}`);
if (!APPLY) {
  console.log('\n무엇을 할지만 보여 줬습니다. 하려면 --apply (SITE_ID · SITE_PW 필요)');
  process.exit(0);
}

const id = process.env.SITE_ID;
const pw = process.env.SITE_PW;
if (!id || !pw) throw new Error('SITE_ID · SITE_PW 환경 변수에 최고관리자 계정을 넣어 주세요');
const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
const login = await api.post('/api/auth/login', { data: { id, password: pw } });
if (!login.ok()) throw new Error(`로그인 실패 ${login.status()}`);

// ① 그 기간의 연장 요청을 만든다 — 2026-10-19부터 화면을 열어도 계산하지 않아서 맞추기 API를 부른다(한 번에 최대 60일씩)
for (let d = FROM; d <= TO; ) {
  const end = [new Date(Date.parse(d) + 59 * 86400000).toISOString().slice(0, 10), TO].sort()[0];
  const r = await api.post('/api/admin/overtime/sync', { data: { from: d, to: end }, timeout: 120000 });
  console.log(`① ${d} ~ ${end} 연장 맞추기`, r.status(), r.ok() ? (await r.json()).changed + '건' : await r.text());
  d = new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10);
}

// ② 옮겨 온 기록의 대기 연장 승인
const pending = await allOf<{ id: string; employee_id: string; work_date: string; overtime_minutes: number; night_minutes: number; holiday_minutes: number }>((a, b) =>
  db.from('overtime_requests').select('id, employee_id, work_date, overtime_minutes, night_minutes, holiday_minutes').eq('is_test', false).eq('status', 'pending').gte('work_date', FROM).lte('work_date', TO).order('id').range(a, b));
let approved = 0;
const notImported: string[] = [];
for (const o of pending) {
  if (!days.get(`${o.employee_id}|${o.work_date}`)?.imported) { notImported.push(`${nameOf.get(o.employee_id)} ${o.work_date}`); continue; }
  const r = await api.post(`/api/admin/overtime/${o.id}/decide`, { data: { decision: 'approved', approvedMinutes: o.overtime_minutes, approvedNightMinutes: o.night_minutes, approvedHolidayMinutes: o.holiday_minutes } });
  if (r.ok()) approved++;
  else console.log(`   연장 승인 실패 ${nameOf.get(o.employee_id)} ${o.work_date}: ${r.status()} ${await r.text()}`);
}
console.log(`② 대기 연장 ${pending.length}건 중 ${approved}건 승인${notImported.length ? ` · 앱에서 찍은 기록이라 그대로 둔 것 ${notImported.length}건: ${notImported.join(', ')}` : ''}`);

// ④ 확정 (한 번에 200건까지)
const items = [...days.keys()].map((k) => { const [employeeId, date] = k.split('|'); return { employeeId, date }; });
let done = 0;
const skipped: string[] = [];
for (let i = 0; i < items.length; i += 200) {
  const r = await api.post('/api/admin/records/confirm', { data: { confirm: true, items: items.slice(i, i + 200) }, timeout: 120000 });
  const j = (await r.json()) as { done?: number; skipped?: { employeeId: string; date: string; code: string }[] };
  if (!r.ok()) { console.log(`   확정 실패 ${r.status()} ${JSON.stringify(j)}`); continue; }
  done += j.done ?? 0;
  for (const s of j.skipped ?? []) if (s.code !== 'already_confirmed') skipped.push(`${nameOf.get(s.employeeId)} ${s.date} (${s.code})`);
}
console.log(`④ 확정 ${done}일${skipped.length ? ` · 건너뜀 ${skipped.length}일:\n   ${skipped.sort().join('\n   ')}` : ''}`);
await api.dispose();
console.log('끝났습니다.');
