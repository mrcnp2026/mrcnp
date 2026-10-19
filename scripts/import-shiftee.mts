// 시프티 실제 자료 옮기기 — 1단계: 기본 정보 (2026-10-16 의뢰인: `레퍼런스/참고` 폴더의 실제 자료를 반영).
//   부서 5 · 출퇴근 장소 6(+부서별 장소) · 직무 · 휴가 종류 18 · 직원 24명(사번 = 입사 순서 M001…) · 개인 정보 · 비고(옮긴 정보) · 권한
//   시험 자료 정리: 테스트 직원 2명 퇴사 처리, 시험 부서 · 장소 · 예전 휴가 종류 숨기기.
// 결정(2026-10-16 의뢰인): 사번 = 입사 순서 번호 · admin은 운영 전환 때까지 유지(최고관리자 3명 + admin) · 시험 자료 정리.
//
//   npx tsx scripts/import-shiftee.mts            ← 계획만 보여 준다 (아무것도 바꾸지 않음)
//   npx tsx scripts/import-shiftee.mts --apply    ← 실제로 넣는다 (이미 있는 것은 건너뛴다 — 다시 돌려도 된다)
//
// 직원 · 개인 정보 · 비고 · 지점관리자 · 부서는 실제 사이트의 관리자 API로 넣는다(검사 · 변경 기록이 화면에서 한 것과 같다).
// 숫자 잠금이 걸린 설정(장소 · 직무 · 휴가 종류)과 최고관리자 지정은 DB에 직접 넣고 변경 기록을 남긴다.
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { request } from 'playwright-core';

const APPLY = process.argv.includes('--apply');
const BASE = 'https://mrcnp-saas.vercel.app';
const DIR = '../../레퍼런스/참고/';
const ADMIN_ID = '635e204b-e5a5-4fee-bacc-95d4d2f4357e';
const LEE_ID = 'c79e3906-bd9d-46fa-bc1f-78444f8638d4';
const TEST_IDS = ['28336c0b-a30a-4325-a92a-7b20bf8705c0', '77552766-b8ad-45c9-9227-a90c7b2d4a0c'];
const TODAY = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ── 엑셀 읽기 ────────────────────────────────────────────
const cell = (c: ExcelJS.CellValue): string | number | null => {
  if (c === null || c === undefined) return null;
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  if (typeof c === 'object' && 'text' in c) return String((c as { text: string }).text);
  if (typeof c === 'object' && 'result' in c) return (c as { result: string | number }).result ?? null;
  if (typeof c === 'string') return c.trim() || null;
  return c as number;
};
async function sheet(file: string): Promise<Record<string, string | number | null>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DIR + file);
  const ws = wb.worksheets[0];
  const head = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((h) => String(cell(h) ?? ''));
  const out: Record<string, string | number | null>[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = (ws.getRow(i).values as ExcelJS.CellValue[]).slice(1);
    if (!r.length || r.every((x) => x === null || x === undefined)) continue;
    out.push(Object.fromEntries(head.map((h, j) => [h, cell(r[j])])));
  }
  return out;
}
const S = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const JUNK = /^(없음\.?|-|\d{1,2}|1|22|x|X|\.+)$/;
const junk = (v: unknown) => !S(v) || JUNK.test(S(v));

// ── 개인 정보 정리 ───────────────────────────────────────
function birth(v: unknown): string | null {
  const m = S(v).match(/^(\d{2}|\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!m) return null;
  const y = m[1].length === 2 ? (Number(m[1]) >= 30 ? 1900 : 2000) + Number(m[1]) : Number(m[1]);
  const d = `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return !Number.isNaN(Date.parse(d)) && d >= '1900-01-01' && d <= TODAY ? d : null;
}
const PHONE = /(01\d)[.\-\s]?(\d{3,4})[.\-\s]?(\d{4})/;
const RELATIONS = ['모친', '부친', '어머니', '아버지', '처', '남편', '아내', '배우자', '형', '누나', '언니', '오빠', '남동생', '여동생', '동생', '아들', '딸', '녀', '지인', '동거인'];
function contact(v: unknown): { name: string; relation: string; phone: string } | null {
  const s = S(v);
  const pm = s.match(PHONE);
  if (!pm) return null;
  const phone = `${pm[1]}-${pm[2]}-${pm[3]}`;
  const rest = s.replace(pm[0], '').trim();
  let m = rest.match(/^(.+?)\s*\((.+?)\)$/);
  if (m) return { name: m[1].trim(), relation: m[2].trim(), phone };
  m = rest.match(/^(\S+)\s+(\S+)$/);
  if (m && RELATIONS.includes(m[1])) return { name: m[2], relation: m[1], phone };
  if (m && RELATIONS.includes(m[2])) return { name: m[1], relation: m[2], phone };
  if (rest && !/\s/.test(rest)) return { name: rest, relation: '', phone };
  return null; // 이름 없이 번호만 — 비고로 옮긴다
}
function certs(v: unknown): string[] {
  if (junk(v)) return [];
  return S(v).split(/[,，]/).map((x) => x.trim()).filter((x) => x && !junk(x)).slice(0, 20);
}
function car(v: unknown): { model: string | null; number: string | null } {
  if (junk(v)) return { model: null, number: null };
  const s = S(v).replace(/\.{2,}$/, '');
  const parts = s.split(/\s*[\/,]\s*/).filter(Boolean);
  if (parts.length >= 2) return { model: parts[0].slice(0, 50), number: parts.slice(1).join(' ').replace(/\s+/g, '').slice(0, 20) };
  return /\d/.test(s) && /[가-힣]\d{4}$/.test(s) ? { model: null, number: s.replace(/\s+/g, '').slice(0, 20) } : { model: s.slice(0, 50), number: null };
}

// ── 휴가 종류 ────────────────────────────────────────────
type LeaveTypeRow = { name: string; group: string; hours: number; deducts: boolean };
function leaveTypes(rows: Record<string, string | number | null>[]): LeaveTypeRow[] {
  return rows.map((r) => ({
    name: S(r['휴가 유형']).slice(0, 40),
    group: S(r['휴가 그룹']).replace(/^\d+\.\s*/, ''),
    hours: Number(r['유급 시간']),
    deducts: Number(r['차감 일수']) > 0,
  }));
}

// ── 메인 ─────────────────────────────────────────────────
const [deptRows, placeRows, typeRows, workRows, staffRows] = await Promise.all([sheet('부서정보.xlsx'), sheet('출퇴근지점정보.xlsx'), sheet('휴가유형.xlsx'), sheet('직원전체근로정보.xlsx'), sheet('직원정보.xlsx')]);
const workOf = new Map(workRows.map((w) => [S(w['직원']), w]));

const places = placeRows.map((r) => {
  const m = S(r['좌표']).match(/\(([\d.]+),\s*([\d.]+)\)\s*\[(\d+)m|\(([\d.]+),\s*([\d.]+)\)\s*\[(제한없음)\]/);
  const unlimited = !!m?.[6];
  return { label: S(r['출퇴근 장소']).slice(0, 40), address: S(r['근무지 주소']).slice(0, 200), lat: Number(m?.[1] ?? m?.[4]), lng: Number(m?.[2] ?? m?.[5]), radiusM: unlimited ? 1000 : Math.min(1000, Math.max(30, Number(m?.[3]))), unlimited };
});
const depts = deptRows.map((r, i) => ({ name: S(r['지점명']), memo: S(r['메모']) || null, places: S(r['출퇴근 장소들']).split(',').map((x) => x.replace('[좌표]', '').trim()).filter(Boolean), sort: i + 1 }));
const types = leaveTypes(typeRows);

const staff = staffRows
  .map((r) => ({ r, w: workOf.get(S(r['직원'])), joined: S(r['입사일']).slice(0, 10) }))
  .sort((a, b) => (a.joined === b.joined ? S(a.r['직원']).localeCompare(S(b.r['직원']), 'ko') : a.joined < b.joined ? -1 : 1))
  .map(({ r, w, joined }, i) => {
    const name = S(r['직원']);
    const c = contact(r['응급상황 대비 비상 연락처 : 홍길동(남동생) 010.1111.1111']);
    const cr = car(r['차종 / 차량번호 :']);
    const access = S(r['액세스 권한']);
    const memo = S(r['메모']);
    const grade = name === '차재준' ? 'ceo' : access === '최고관리자' || access === '총괄관리자' ? 'super' : access === '지점관리자' ? 'manager' : 'employee';
    const noteLines = [
      '시프티에서 옮긴 정보 (2026-10-16)',
      !junk(r['부양가족 : 성명(관계) : 홍길동(부), ###(자녀)']) ? `부양가족: ${S(r['부양가족 : 성명(관계) : 홍길동(부), ###(자녀)'])}` : null,
      !junk(r['자녀별 출생연도 : 출산/보육수당 용도']) ? `자녀(출산·보육수당): ${S(r['자녀별 출생연도 : 출산/보육수당 용도'])}` : null,
      !c && !junk(r['응급상황 대비 비상 연락처 : 홍길동(남동생) 010.1111.1111']) ? `비상연락처(원문): ${S(r['응급상황 대비 비상 연락처 : 홍길동(남동생) 010.1111.1111'])}` : null,
      !birth(r['본인 생년월일']) && !junk(r['본인 생년월일']) ? `생년월일(원문): ${S(r['본인 생년월일'])}` : null,
      `근로정보: ${S(w?.['근로정보명'] ?? r['근로정보명'])} (적용 ${S(w?.['적용 시점'] ?? r['적용 시점']).slice(0, 10)})`,
      access === '총괄관리자' ? '시프티 권한: 총괄관리자 → 최고관리자로 옮김' : null,
      memo ? `메모: ${memo}` : null,
    ].filter(Boolean) as string[];
    return {
      no: `M${String(i + 1).padStart(3, '0')}`,
      name, joined,
      email: S(r['이메일 주소']).toLowerCase() || null,
      phone: S(r['전화번호']) || null,
      dept: S(r['본지점']),
      job: S(r['본직무']),
      grade,
      details: { birthDate: birth(r['본인 생년월일']), emergencyContacts: c ? [c] : [], certificates: certs(r['보유 자격증']).map((n) => ({ name: n.slice(0, 60), acquiredOn: null, number: null })), carModel: cr.model, carNumber: cr.number },
      note: noteLines.length > 1 ? noteLines.join('\n').slice(0, 500) : null,
    };
  });

// ── 계획 출력 ────────────────────────────────────────────
console.log(`\n[부서 ${depts.length}]`);
for (const d of depts) console.log(`  ${d.name} · 장소 ${d.places.length}곳${d.memo ? ` · 메모 ${d.memo.replace(/\n/g, ' ')}` : ''}`);
console.log(`\n[출퇴근 장소 ${places.length}]`);
for (const p of places) console.log(`  ${p.label} · (${p.lat}, ${p.lng}) · ${p.unlimited ? '제한없음 → 1000m' : `${p.radiusM}m`} · ${p.address}`);
console.log(`\n[휴가 종류 ${types.length}]`);
for (const t of types) console.log(`  [${t.group}] ${t.name} · ${t.hours}시간 · ${t.deducts ? `연차 ${t.hours / 8}일 차감` : '차감 없음'}`);
const jobs = [...new Set(staff.map((s) => s.job))];
console.log(`\n[직무 ${jobs.length}] ${jobs.join(' / ')}`);
console.log(`\n[직원 ${staff.length}]`);
for (const s of staff) {
  const d = s.details;
  console.log(`  ${s.no} ${s.name} · 입사 ${s.joined} · ${s.dept} · ${s.job} · ${s.grade} · ${s.phone ?? '휴대폰 없음'} · ${s.email ?? '-'}`);
  console.log(`       생년 ${d.birthDate ?? '-'} · 연락 ${d.emergencyContacts.map((c) => `${c.name}(${c.relation}) ${c.phone}`).join(', ') || '-'} · 자격 ${d.certificates.map((c) => c.name).join(', ') || '-'} · 차 ${[d.carModel, d.carNumber].filter(Boolean).join(' / ') || '-'}`);
  if (s.note) console.log(`       비고: ${s.note.split('\n').slice(1).join(' | ')}`);
}
const tops = staff.filter((s) => s.grade === 'super' || s.grade === 'ceo').map((s) => s.name);
console.log(`\n최고관리자: ${tops.join(', ')} (+ admin 운영 전환 때까지) · 지점관리자: ${staff.filter((s) => s.grade === 'manager').map((s) => s.name).join(', ')}`);
if (!APPLY) {
  console.log('\n계획만 보여 줬습니다. 실제로 넣으려면 --apply');
  process.exit(0);
}

// ── 실제로 넣기 ──────────────────────────────────────────
const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
if (!(await api.post('/api/auth/login', { data: { id: process.env.SITE_ID ?? '', password: process.env.SITE_PW ?? '' } })).ok()) throw new Error('관리자 로그인 실패 — 환경 변수 SITE_ID · SITE_PW에 최고관리자 계정을 넣어 주세요(비밀번호는 파일에 적지 않는다, 2026-10-19)');
async function call<T = Record<string, unknown>>(path: string, data: Record<string, unknown>): Promise<T> {
  const r = await api.post(path, { data });
  const j = await r.json().catch(() => ({}));
  if (!r.ok()) throw new Error(`${path} ${r.status()} ${JSON.stringify(j)}`);
  return j as T;
}
const audit = async (table: string, targetId: string, event: string, detail: Record<string, unknown>) => {
  const { error } = await db.from('audit_logs').insert({ actor_id: ADMIN_ID, action: 'update', target_table: table, target_id: targetId, after_data: { event, ...detail }, reason: '시프티 실제 자료 옮기기 (2026-10-16 의뢰인)' });
  if (error) throw new Error(`audit: ${error.message}`);
};
const step = (m: string) => console.log(`\n▶ ${m}`);

step('출퇴근 장소');
const { data: curPlaces } = await db.from('office_locations').select('id, label, active');
const placeId = new Map<string, string>();
for (const p of places) {
  const have = (curPlaces ?? []).find((x) => x.label === p.label && x.active);
  if (have) { placeId.set(p.label, have.id); continue; }
  const { data, error } = await db.from('office_locations').insert({ label: p.label, address: p.address, lat: p.lat, lng: p.lng, radius_m: p.radiusM, created_by: ADMIN_ID, updated_by: ADMIN_ID }).select('id').single();
  if (error) throw new Error(`place ${p.label}: ${error.message}`);
  placeId.set(p.label, data.id);
  console.log(`  + ${p.label}`);
}
for (const x of curPlaces ?? []) {
  if (x.active && !places.some((p) => p.label === x.label)) {
    await db.from('office_locations').update({ active: false, updated_by: ADMIN_ID }).eq('id', x.id);
    console.log(`  - 숨김 ${x.label}`);
  }
}

step('부서');
const { data: curGroups } = await db.from('org_groups').select('id, name, parent_id, active');
const groupId = new Map<string, string>();
for (const d of depts) {
  const have = (curGroups ?? []).find((g) => g.name === d.name && !g.parent_id);
  let id = have?.id as string | undefined;
  if (!id) {
    id = (await call<{ id: string }>('/api/admin/groups', { name: d.name })).id;
    console.log(`  + ${d.name}`);
  }
  groupId.set(d.name, id);
  await call(`/api/admin/groups/${id}`, { memo: d.memo ?? '', locationIds: d.places.map((l) => placeId.get(l)).filter(Boolean) });
}

step('직무');
const { data: curJobs } = await db.from('jobs').select('id, name');
const jobId = new Map<string, string>();
for (const [i, j] of jobs.entries()) {
  const have = (curJobs ?? []).find((x) => x.name === j);
  if (have) { jobId.set(j, have.id); continue; }
  const { data, error } = await db.from('jobs').insert({ name: j, sort: i + 1, created_by: ADMIN_ID, updated_by: ADMIN_ID }).select('id').single();
  if (error) throw new Error(`job ${j}: ${error.message}`);
  jobId.set(j, data.id);
  console.log(`  + ${j}`);
}

step('휴가 종류');
const { data: curTypes } = await db.from('leave_types').select('code, name, active, builtin');
for (const [i, t] of types.entries()) {
  if ((curTypes ?? []).some((x) => x.name === t.name && x.active && !x.builtin)) continue;
  const code = `c_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const { error } = await db.from('leave_types').insert({ code, name: t.name, is_paid: true, deducts_balance: t.deducts, day_unit: Math.min(1, t.hours / 8), hours: t.hours, group_name: t.group, sort: 100 + i, builtin: false, updated_by: ADMIN_ID });
  if (error) throw new Error(`type ${t.name}: ${error.message}`);
  console.log(`  + ${t.name}`);
}
for (const x of curTypes ?? []) {
  if (x.builtin && x.active) {
    await db.from('leave_types').update({ active: false, updated_by: ADMIN_ID }).eq('code', x.code);
    console.log(`  - 숨김 ${x.name}`);
  }
}

step('직원');
const { data: curPeople } = await db.from('profiles').select('id, name, employee_no, email');
const personId = new Map<string, string>();
for (const s of staff) {
  const have = s.name === '이상준' ? { id: LEE_ID } : (curPeople ?? []).find((p) => p.employee_no === s.no);
  const body = { name: s.name, employeeNo: s.no, locale: 'ko', phone: s.phone ?? '', jobTitle: '', groupId: groupId.get(s.dept) ?? null, joinedOn: s.joined, email: s.email ?? '' };
  if (have) {
    // 이상준 님: 이미 있는 계정 — 이메일은 의뢰인이 알려 준 회사 메일을 그대로 둔다
    const cur = (curPeople ?? []).find((p) => p.id === have.id);
    await call(`/api/admin/employees/${have.id}/profile`, { ...body, email: cur?.email ?? body.email, phone: s.phone ?? '' });
    personId.set(s.name, have.id);
    console.log(`  = ${s.no} ${s.name}`);
    continue;
  }
  const r = await call<{ employeeId: string }>('/api/admin/employees', { ...body, jobId: jobId.get(s.job) });
  personId.set(s.name, r.employeeId);
  console.log(`  + ${s.no} ${s.name}`);
}
// 이상준 님 직무도 맞춘다
await db.from('profiles').update({ job_id: jobId.get(staff.find((s) => s.name === '이상준')!.job), updated_by: ADMIN_ID }).eq('id', LEE_ID);

step('개인 정보 · 비고');
for (const s of staff) {
  const id = personId.get(s.name)!;
  const d = s.details;
  if (d.birthDate || d.emergencyContacts.length || d.certificates.length || d.carModel || d.carNumber) await call(`/api/admin/employees/${id}/details`, d);
  if (s.note) {
    const { count } = await db.from('staff_notes').select('id', { count: 'exact', head: true }).eq('employee_id', id).like('body', '시프티에서 옮긴 정보%').is('deleted_at', null);
    if (!count) await call(`/api/admin/employees/${id}/notes`, { body: s.note });
  }
}

step('지점관리자');
for (const s of staff.filter((x) => x.grade === 'manager')) {
  const id = personId.get(s.name)!;
  const { data: p } = await db.from('profiles').select('role').eq('id', id).single();
  if (p?.role !== 'manager') await call(`/api/admin/employees/${id}/grade`, { grade: 'manager', reason: '시프티 권한: 지점관리자' });
  await call(`/api/admin/employees/${id}/manager-scope`, { groupIds: [groupId.get(s.dept)] });
  console.log(`  ${s.name} → ${s.dept}`);
}

step('최고관리자 (admin은 운영 전환 때까지 넷째로 둔다 — DB 최고관리자 3명 세기에서 빼려고 구분만 general)');
await db.from('profiles').update({ admin_level: 'general', updated_by: ADMIN_ID }).eq('id', ADMIN_ID);
for (const s of staff.filter((x) => x.grade === 'super' || x.grade === 'ceo')) {
  const id = personId.get(s.name)!;
  const { data: p } = await db.from('profiles').select('role, admin_level').eq('id', id).single();
  if (p?.role === 'admin' && p.admin_level === s.grade) continue;
  const { error } = await db.from('profiles').update({ role: 'admin', admin_level: s.grade, can_view_payroll: true, updated_by: ADMIN_ID }).eq('id', id);
  if (error) throw new Error(`top ${s.name}: ${error.message}`);
  await audit('profiles', id, 'role_changed', { from: { role: p?.role, level: p?.admin_level }, to: { role: 'admin', level: s.grade } });
  console.log(`  ${s.name} → ${s.grade === 'ceo' ? '대표자' : '최고관리자'}`);
}

step('시험 자료 정리');
for (const id of TEST_IDS) {
  const { data: p } = await db.from('profiles').select('active, name').eq('id', id).single();
  if (p?.active) { await call(`/api/admin/employees/${id}/status`, { action: 'resign', reason: '시험용 계정 정리 (실제 자료로 바꿈)' }); console.log(`  퇴사 처리 ${p.name}`); }
}
await db.from('profiles').update({ group_id: groupId.get('0 경영지원실'), updated_by: ADMIN_ID }).eq('id', ADMIN_ID); // admin도 실제 부서로 — 시험 부서를 숨길 수 있게
const { data: oldGroups } = await db.from('org_groups').select('id, name, parent_id, active').eq('active', true);
const real = new Set(groupId.values());
for (const g of (oldGroups ?? []).filter((x) => !real.has(x.id)).sort((a, b) => (a.parent_id ? -1 : 1) - (b.parent_id ? -1 : 1))) {
  await call(`/api/admin/groups/${g.id}`, { active: false });
  console.log(`  숨김 ${g.name}`);
}
console.log('\n끝났습니다.');
await api.dispose();
