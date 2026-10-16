// 시프티 실제 자료 옮기기 — 2단계: 26년 출퇴근 기록 · 휴가 기록 (2026-10-16 의뢰인: 실제 기록으로).
//   출퇴근: 한 줄 = 출근 1 + 퇴근 1 (source 'import', is_test false, 장소 이름 → 출퇴근 장소, 근무노트 → 메모)
//   휴가: 승인된 휴가로 넣는다(source 'import'). 연차를 쓰는 종류는 승인되는 순간 원장에서 연차가 빠진다 → 먼저 연차 발생이 들어가 있어야 한다.
//   같은 줄은 두 번 들어가지 않는다(import_key, 묶음 20). 다시 돌려도 이미 들어간 줄은 건너뛴다.
//
//   npx tsx scripts/import-shiftee-records.mts            ← 점검표만 (아무것도 바꾸지 않음)
//   npx tsx scripts/import-shiftee-records.mts --apply    ← 실제로 넣는다 (묶음 20 적용 뒤)
//
// 2026-10-17 의뢰인: 1월에 모든 직원이 앱을 쓰기 전까지는 시프티 엑셀을 받아 DB를 갱신한다 — 다음처럼 돌린다
//   npx tsx scripts/import-shiftee-records.mts --from=2026-10-17 --punch-file=<출퇴근 엑셀> --leave-file=<휴가 엑셀> --only=punch|leave
//   --from: 이 날짜부터의 줄만 넣는다(그 전 날짜는 이미 넣고 고친 기록 — 시프티에서 나중에 고친 시각이 다시 들어와 겹치지 않게)
//   연차 발생(--only=grant)은 처음 한 번만 — 갱신 때는 돌리지 않는다
//   넣은 뒤에는 scripts/import-followup.mts (연장 승인 · 확정 · 빠진 퇴근 목록)
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7); // punch | leave
const DIR = '../../레퍼런스/참고/';
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const FROM = arg('from') ?? '0000-01-01';
const PUNCH_FILE = arg('punch-file');
const LEAVE_FILE = arg('leave-file');
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM)) throw new Error('--from=YYYY-MM-DD');
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
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const val = (c: ExcelJS.CellValue): string | number | null => {
  if (c === null || c === undefined) return null;
  if (c instanceof Date) return c.toISOString().slice(0, 19); // 엑셀 시각은 서울 시각 그대로 들어 있다(표시용 UTC로 읽힘)
  if (typeof c === 'object' && 'text' in c) return String((c as { text: string }).text);
  if (typeof c === 'object' && 'result' in c) return ((c as { result: string | number }).result as string | number) ?? null;
  if (typeof c === 'string') return c.trim() || null;
  return c as number;
};
async function sheet(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(/[\/]/.test(file) ? file : DIR + file); // 경로를 주면 그 파일, 이름만 주면 레퍼런스/참고 폴더
  const ws = wb.worksheets[0];
  const head = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((h) => String(val(h) ?? ''));
  const out: Record<string, string | number | null>[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = (ws.getRow(i).values as ExcelJS.CellValue[]).slice(1);
    const o = Object.fromEntries(head.map((h, j) => [h, val(r[j])]));
    if (o['직원']) out.push(o);
  }
  return out;
}
const S = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const kst = (local: string) => `${local}+09:00`;
const hoursOf = (v: unknown) => { const s = S(v); const m = s.match(/T(\d{2}):(\d{2})/); return m ? Number(m[1]) + Number(m[2]) / 60 : Number(v) || 0; };

const { data: people } = await db.from('profiles').select('id, name, joined_on').eq('active', true);
const idOf = new Map((people ?? []).map((p) => [p.name as string, p.id as string]));
const joinedOf = new Map((people ?? []).map((p) => [p.name as string, p.joined_on as string | null]));
const { data: locs } = await db.from('office_locations').select('id, label').eq('active', true);
const locOf = new Map((locs ?? []).map((l) => [l.label as string, l.id as string]));
const { data: types } = await db.from('leave_types').select('code, name, hours, day_unit, deducts_balance, group_name').eq('active', true);

const report: string[] = [];
const note = (s: string) => report.push(s);

// ── 출퇴근 ──────────────────────────────────────────────
const punchRows = ONLY === 'leave' || ONLY === 'grant' ? [] : await sheet(PUNCH_FILE ?? '26년직원별출퇴근기록.xlsx');
type Punch = { employee_id: string; kind: 'in' | 'out'; punched_at: string; work_date: string; source: 'import'; is_test: false; ip_verified: false; location_id: string | null; note: string; import_key: string };
const punches: Punch[] = [];
const pIssues = { noPerson: 0, noPlaceIn: 0, noPlaceOut: 0, beforeJoin: 0, badOrder: 0, overnight: 0 };
for (const r of punchRows) {
  const name = S(r['직원']);
  const id = idOf.get(name);
  if (!id) { pIssues.noPerson++; note(`출퇴근: 직원 없음 ${name}`); continue; }
  const inAt = S(r['출근시간']);
  let outAt = S(r['퇴근시간']);
  if (outAt && !/^\d{4}-\d{2}-\d{2}T/.test(outAt)) { note(`출퇴근: 퇴근 칸이 시각이 아님 — 출근만 넣음 ${name} ${inAt.slice(0, 10)} 「${outAt}」`); outAt = ''; }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(inAt)) { note(`출퇴근: 시각이 아닌 줄은 건너뜀 — ${name} ${S(r['날짜'])} 「${inAt}」(시프티 결근 표시)`); continue; }
  const workDate = inAt.slice(0, 10);
  if ((joinedOf.get(name) ?? '0000') > workDate) { pIssues.beforeJoin++; note(`출퇴근: 입사일(${joinedOf.get(name)}) 전 기록은 넣지 않음 ${name} ${workDate} (2026-10-16 의뢰인: 입사일 기준)`); continue; }
  if (outAt && outAt <= inAt) { pIssues.badOrder++; note(`출퇴근: 퇴근이 출근보다 빠름 ${name} ${inAt} ~ ${outAt}`); continue; }
  if (outAt && outAt.slice(0, 10) !== workDate) pIssues.overnight++;
  const inLoc = S(r['출근 장소']), outLoc = S(r['퇴근 장소']);
  if (!inLoc) pIssues.noPlaceIn++;
  if (!outLoc) pIssues.noPlaceOut++;
  const memo = ['시프티에서 옮김', S(r['근무일정']) ? `일정 ${S(r['근무일정'])}` : '', S(r['근무노트']) ? `노트: ${S(r['근무노트'])}` : ''].filter(Boolean).join(' · ').slice(0, 500);
  const base = { employee_id: id, work_date: workDate, source: 'import' as const, is_test: false as const, ip_verified: false as const, note: memo };
  punches.push({ ...base, kind: 'in', punched_at: kst(inAt), location_id: locOf.get(inLoc) ?? null, import_key: `sf:p:${id.slice(0, 8)}:${inAt}:in` });
  if (outAt) punches.push({ ...base, kind: 'out', punched_at: kst(outAt), location_id: locOf.get(outLoc) ?? null, import_key: `sf:p:${id.slice(0, 8)}:${inAt}:out` });
}

// ── 휴가 ────────────────────────────────────────────────
const leaveRows = ONLY === 'punch' || ONLY === 'grant' ? [] : await sheet(LEAVE_FILE ?? '26년 직원별휴가기록.xlsx');
const byName = (n: string) => types?.find((t) => t.name === n);
function mapType(r: Record<string, unknown>) {
  const raw = S(r['휴가 유형']);
  const h = hoursOf(r['유급 시간']);
  const deduct = Number(r['차감 일수']) > 0;
  const exact = byName(raw) ?? byName(raw.replace(/\s+/g, ''));
  if (exact) return exact;
  if (/병가/.test(raw)) return byName(h >= 8 ? '병가 8H' : '병가 4H');
  if (/포상|하계/.test(raw)) { const m = Number(S(r['시작 시간']).slice(5, 7)); return byName(m >= 7 && m <= 8 ? '하계 8H' : '포상 8H'); }
  if (/장례|결혼|출산/.test(raw)) return types?.find((t) => raw.startsWith(t.name.slice(0, 5)));
  if (deduct || /연차|반차|외출|조퇴/.test(raw)) {
    const map: Record<string, string> = { '8': '연차8H', '4': '반차4H', '3': '외출/조퇴 3H', '2': '외출/조퇴 2H', '1': '외출/조퇴 1H', '0.5': '조퇴 0.5H', '5': '11시 조퇴', '6': '10시 조퇴', '7': '09시 조퇴' };
    return byName(map[String(h)] ?? '');
  }
  return undefined;
}
type Leave = { row: Record<string, unknown>; employee_id: string; type_code: string; work_dates: string[]; start_date: string; end_date: string; days: number; start_time: string | null; end_time: string | null; reason: string | null; created_at: string | null; decided_at: string | null; import_key: string; deductMin: number; sfDeduct: number; typeName: string };
const leaves: Leave[] = [];
const typeMap = new Map<string, number>();
for (const r of leaveRows) {
  const name = S(r['직원']);
  const id = idOf.get(name);
  if (!id) { note(`휴가: 직원 없음 ${name}`); continue; }
  const t = mapType(r);
  // 시프티 「병가 [유급]」의 차감은 연차가 아니라 병가 쪽이었다(10-11 휴가 보고서와 대조, 2026-10-16) — 그대로 병가로 넣는다
  if (!t && Number(r['차감 일수']) > 0 && /T\d{2}:\d{2}/.test(S(r['시작 시간']))) {
    // 맞는 종류가 없는 시간(예: 1.5시간) — 있는 시간 종류로 이어 붙여 나눈다(차감 합계는 같다)
    let left = hoursOf(r['유급 시간']);
    let from = hoursOf(r['시작 시간']);
    const parts: { t: NonNullable<typeof t>; from: number; to: number }[] = [];
    for (const [h, n] of [[3, '외출/조퇴 3H'], [2, '외출/조퇴 2H'], [1, '외출/조퇴 1H'], [0.5, '조퇴 0.5H']] as const) {
      while (left >= h - 1e-9) { const tt = byName(n); if (!tt) break; parts.push({ t: tt, from, to: from + h }); from += h; left -= h; }
    }
    if (left < 1e-9 && parts.length) {
      const hm = (x: number) => `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`;
      const date = S(r['시작 시간']).slice(0, 10);
      for (const pt of parts) {
        leaves.push({ row: r, employee_id: id, type_code: pt.t.code as string, work_dates: [date], start_date: date, end_date: date, days: Number(pt.t.day_unit), start_time: hm(pt.from), end_time: hm(pt.to), reason: `[${S(r['휴가 유형'])} ${hoursOf(r['유급 시간'])}시간을 나눠 넣음] ${S(r['사유'])}`.trim(), created_at: null, decided_at: null, import_key: `sf:l:${id.slice(0, 8)}:${date}T${hm(pt.from)}:${pt.t.code}`, deductMin: Math.round(Number(pt.t.day_unit) * 480), sfDeduct: Math.round(Number(pt.t.day_unit) * 480), typeName: pt.t.name as string });
      }
      note(`휴가: ${name} ${date} ${S(r['휴가 유형'])} ${hoursOf(r['유급 시간'])}시간 → ${parts.map((x) => `${x.t.name} ${hm(x.from)}-${hm(x.to)}`).join(' + ')} (차감 합계 같음)`);
      continue;
    }
  }
  if (!t) { note(`휴가: 종류를 못 정함 — 넣지 않음 ${name} ${S(r['휴가 유형'])} ${S(r['시작 시간'])} ~ ${S(r['종료 시간'])} · 유급 ${hoursOf(r['유급 시간'])}시간 · 차감 ${r['차감 일수']}일`); continue; }
  typeMap.set(`${S(r['휴가 유형'])} → ${t.name}`, (typeMap.get(`${S(r['휴가 유형'])} → ${t.name}`) ?? 0) + 1);
  const st = S(r['시작 시간']), en = S(r['종료 시간']);
  const date = st.slice(0, 10);
  const full = Number(t.hours) >= 8;
  const ts = (x: string) => (/^\d{2}:\d{2}/.test(x.slice(11)) ? x.slice(11, 16) : null);
  const at = (x: unknown) => { const m = S(x).match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/); return m ? kst(`${m[1]}-${m[2]}-${m[3]}T${m[4]}`) : null; };
  leaves.push({
    row: r, employee_id: id, type_code: t.code as string, work_dates: [date], start_date: date, end_date: date, days: Number(t.day_unit),
    start_time: full ? null : ts(st), end_time: full ? null : ts(en), reason: S(r['사유']) || null,
    created_at: at(r['생성일자']), decided_at: at(r['마지막 수정일자']) ?? at(r['생성일자']),
    import_key: `sf:l:${id.slice(0, 8)}:${st}:${t.code}`,
    deductMin: t.deducts_balance ? Math.round(Number(t.day_unit) * 480) : 0, sfDeduct: Math.round(Number(r['차감 일수'] ?? 0) * 480), typeName: t.name as string,
  });
}
// 같은 날 겹침(앱 규칙: 하루 합이 1일을 넘거나 시간이 겹치면 막힌다)
const dayUse = new Map<string, Leave[]>();
for (const l of leaves) { const k = `${l.employee_id}:${l.start_date}`; dayUse.set(k, [...(dayUse.get(k) ?? []), l]); }
let overlaps = 0;
for (const [, ls] of dayUse) {
  const sum = ls.reduce((a, l) => a + l.days, 0);
  const timeClash = ls.some((a, i) => ls.some((b, j) => j > i && a.start_time && b.start_time && a.start_time < b.end_time! && b.start_time < a.end_time!));
  if (sum > 1 || timeClash) { overlaps++; note(`휴가: 같은 날 겹침 ${S(ls[0].row['직원'])} ${ls[0].start_date} — ${ls.map((l) => `${l.typeName}${l.start_time ? ` ${l.start_time}-${l.end_time}` : ''}`).join(' + ')}`); }
}
const deductDiff = leaves.filter((l) => l.deductMin !== l.sfDeduct && !/병가/.test(S(l.row['휴가 유형'])));

// ── 점검표 ──────────────────────────────────────────────
const lines = [
  `# 시프티 기록 옮기기 점검표 (${new Date().toISOString().slice(0, 16)})`,
  '',
  `## 출퇴근 ${punchRows.length}줄 → 기록 ${punches.length}개 (출근 ${punches.filter((p) => p.kind === 'in').length} · 퇴근 ${punches.filter((p) => p.kind === 'out').length})`,
  `- 직원을 못 찾음 ${pIssues.noPerson} · 퇴근이 출근보다 빠름 ${pIssues.badOrder} · 자정 넘긴 근무 ${pIssues.overnight}(출근한 날로 묶음)`,
  `- 장소 없음: 출근 ${pIssues.noPlaceIn} · 퇴근 ${pIssues.noPlaceOut} (시프티에도 비어 있음 — 장소 없이 넣는다)`,
  `- 입사일보다 앞선 기록 ${pIssues.beforeJoin}`,
  '',
  `## 휴가 ${leaveRows.length}줄 → ${leaves.length}건`,
  ...[...typeMap].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k} : ${n}건`),
  `- 같은 날 겹침 ${overlaps}건`,
  `- 연차 차감이 시프티와 다른 건 ${deductDiff.length}건${deductDiff.length ? ':' : ''}`,
  ...deductDiff.slice(0, 40).map((l) => `  - ${S(l.row['직원'])} ${l.start_date} ${S(l.row['휴가 유형'])} → ${l.typeName}: 시프티 ${l.sfDeduct / 480}일 / 앱 ${l.deductMin / 480}일`),
  '',
  '## 확인할 것',
  ...report.map((x) => `- ${x}`),
];
writeFileSync(process.env.TEMP + '/shiftee-check.md', lines.join('\n'), 'utf8');
console.log(lines.slice(0, 60).join('\n'));
if (!APPLY) { console.log('\n점검표만 만들었습니다. 넣으려면 --apply'); process.exit(0); }

// ── 2026 연차 발생 (시프티 발생 내역 그대로, 2026-10-16 의뢰인) ──
const accrualRows = ONLY === 'grant' || (!ONLY && APPLY) ? await (async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('../../레퍼런스/SHIFTEE-LEAVE-ACCRUALS-20260101-20261231.xlsx');
  const ws = wb.worksheets[0];
  const head = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((h) => String(val(h) ?? ''));
  const out: Record<string, string | number | null>[] = [];
  for (let i = 2; i <= ws.rowCount; i++) { const r = (ws.getRow(i).values as ExcelJS.CellValue[]).slice(1); const o = Object.fromEntries(head.map((h, j) => [h, val(r[j])])); if (o['이름']) out.push(o); }
  return out;
})() : [];
if (accrualRows.length) {
  console.log(`
연차 발생 ${accrualRows.length}줄`);
  if (APPLY) {
    const { request } = await import('playwright-core');
    const BASE = 'https://mrcnp-saas.vercel.app';
    const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
    if (!(await api.post('/api/auth/login', { data: { id: 'admin', password: 'admin1234' } })).ok()) throw new Error('관리자 로그인 실패');
    const { data: lots } = await db.from('leave_grant_lots').select('note').like('note', '시프티 2026 발생%');
    const have = new Set((lots ?? []).map((l) => l.note as string));
    let added = 0;
    for (const r of accrualRows) {
      const name = S(r['이름']);
      const id = idOf.get(name);
      if (!id) { console.log(`  직원 없음 ${name}`); continue; }
      const from = S(r['발생 시점']).slice(0, 10), until = S(r['만료 시점']).slice(0, 10);
      const days = Number(r['발생 일수']);
      const memo = `시프티 2026 발생 ${name} ${from} ${days}일 (${S(r['상태'])})`;
      if (have.has(memo) || !(days > 0)) continue;
      const to = new Date(Date.parse(`${until}T00:00:00Z`) + 86400000).toISOString().slice(0, 10); // 시프티 만료일까지 쓴다 → 다음 날부터 못 쓴다
      const res = await api.post('/api/admin/leave/ledger', { data: { action: 'manual', kind: 'migrated', employeeId: id, days, usableFrom: from, usableTo: to, note: memo } });
      if (!res.ok()) console.log(`  못 넣음 ${memo}: ${res.status()} ${await res.text()}`);
      else added++;
    }
    console.log(`  연차 발생 ${added}건 넣음`);
    await api.dispose();
  }
}

// ── 넣기 ────────────────────────────────────────────────
if (ONLY !== 'leave' && ONLY !== 'grant') {
  const done = await allOf<{ import_key: string }>((a, b) => db.from('punch_events').select('import_key').not('import_key', 'is', null).order('id').range(a, b));
  const have = new Set(done.map((x) => x.import_key));
  // 앱에서 직접 찍은 기록이 이미 있는 날(사람 × 날)은 엑셀 줄을 넣지 않는다 — 두 벌이 되지 않게. 목록으로 알려 준다 (2026-10-17)
  const appDays = new Set((await allOf<{ employee_id: string; work_date: string }>((a, b) => db.from('punch_events').select('employee_id, work_date').eq('is_test', false).neq('source', 'import').gte('work_date', FROM).order('id').range(a, b))).map((x) => `${x.employee_id}|${x.work_date}`));
  const clash = punches.filter((p) => p.work_date >= FROM && !have.has(p.import_key) && appDays.has(`${p.employee_id}|${p.work_date}`));
  if (clash.length) console.log(`앱에서 찍은 기록이 있어 넣지 않은 날: ${[...new Set(clash.map((p) => `${p.employee_id.slice(0, 8)} ${p.work_date}`))].join(', ')}`);
  const todo = punches.filter((p) => p.work_date >= FROM && !have.has(p.import_key) && !appDays.has(`${p.employee_id}|${p.work_date}`));
  console.log(`출퇴근: 파일 ${punches.length}개 중 ${FROM} 이후 · 아직 없는 것 ${todo.length}개`);
  for (let i = 0; i < todo.length; i += 500) {
    const { error } = await db.from('punch_events').insert(todo.slice(i, i + 500));
    if (error) throw new Error(`punch ${i}: ${error.message}`);
    console.log(`  출퇴근 ${Math.min(i + 500, todo.length)} / ${todo.length}`);
  }
}
if (ONLY !== 'punch' && ONLY !== 'grant') {
  const done = await allOf<{ import_key: string }>((a, b) => db.from('leave_requests').select('import_key').not('import_key', 'is', null).order('id').range(a, b));
  const have = new Set(done.map((x) => x.import_key));
  let ok = 0;
  const fail: string[] = [];
  for (const l of leaves.filter((x) => x.end_date >= FROM && !have.has(x.import_key))) {
    const { error } = await db.from('leave_requests').insert({
      employee_id: l.employee_id, type_code: l.type_code, work_dates: l.work_dates, start_date: l.start_date, end_date: l.end_date, days: l.days, start_time: l.start_time, end_time: l.end_time,
      reason: l.reason, status: 'approved', approved_by: ADMIN_ID, requested_by: l.employee_id, is_test: false, source: 'import', import_key: l.import_key,
      ...(l.created_at ? { created_at: l.created_at } : {}), decided_at: l.decided_at,
    });
    if (error) fail.push(`${S(l.row['직원'])} ${l.start_date} ${l.typeName}: ${error.message}`);
    else ok++;
  }
  console.log(`  휴가 ${ok}건 넣음${fail.length ? ` · 못 넣음 ${fail.length}건:\n   ${fail.join('\n   ')}` : ''}`);
}
console.log('끝났습니다.');
