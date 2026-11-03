// 연장근로 요청 정리 (2026-11-03 의뢰인: 「1~4월은 일괄 반려하고 9~10월 3건 보여줘」, 폰에는 요청 363).
//   npx tsx --conditions=react-server scripts/ops-overtime-cleanup.mts [--prod] [--apply]   — 기본은 개발 DB, 보기만
// 보기: 대기 9~10월 건 내용 · 요청 숫자에 같이 세는 「다시 볼 것」(처리한 뒤 다시 계산해 값이 바뀐 것)과 출퇴근 정정 대기 수
// --apply: 2026-01~04 근무의 대기 연장 요청을 반려한다 (화면의 거부와 같은 DB 함수 decide_overtime · 직원 폰 알림은 보내지 않는다)
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
console.log(prod ? '운영 DB' : '개발 DB');
const { data: people } = await db.from('profiles').select('id, name, employee_no');
const nm = (id: string) => people?.find((p) => p.id === id)?.name ?? '?';
const hm = (m: number | null) => (m == null ? '-' : `${Math.floor(m / 60)}시간 ${m % 60}분`);
const count = (rows: Record<string, unknown>[], f: (r: Record<string, unknown>) => string) => Object.entries(rows.reduce<Record<string, number>>((a, r) => ((a[f(r)] = (a[f(r)] ?? 0) + 1), a), {})).sort().map(([k, v]) => `${k}:${v}`).join('  ');

const { data: pend } = await db.from('overtime_requests').select('*').eq('is_test', false).eq('status', 'pending').order('work_date');
console.log(`\n■ 대기 연장 요청 ${pend?.length ?? 0}건`);
for (const r of (pend ?? []).filter((x) => x.work_date >= '2026-09-01')) {
  const { data: pu } = await db.from('punch_events').select('kind, punched_at').eq('employee_id', r.employee_id).eq('work_date', r.work_date).order('punched_at');
  const t = (pu ?? []).map((x) => `${x.kind === 'in' ? '출근' : '퇴근'} ${new Date(x.punched_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })}`).join(' · ');
  console.log(` ${r.work_date} ${nm(r.employee_id)} | 연장 ${hm(r.overtime_minutes)} · 야간 ${hm(r.night_minutes)} · 휴일 ${hm(r.holiday_minutes)}${r.needs_review ? ` | 다시 계산: 연장 ${hm(r.recomputed_overtime_minutes)}` : ''} | ${t} | 사유 ${r.reason ?? '-'}`);
}

const { data: rev } = await db.from('overtime_requests').select('employee_id, work_date, status, overtime_minutes, recomputed_overtime_minutes, created_at').eq('is_test', false).eq('needs_review', true).neq('status', 'pending').limit(5000);
const revRows = (rev ?? []) as Record<string, unknown>[];
console.log(`\n■ 처리한 뒤 다시 볼 것(값이 바뀐 것) ${revRows.length}건 — 요청 숫자에 같이 센다`);
if (revRows.length) {
  console.log(' 상태:', count(revRows, (r) => String(r.status)));
  console.log(' 근무 월별:', count(revRows, (r) => String(r.work_date).slice(0, 7)));
  console.log(' 사람별:', count(revRows, (r) => nm(String(r.employee_id))));
  // 급여는 min(승인한 값, 지금 계산)으로 낸다 — 줄어든 건은 이미 새 값으로, 늘어난 건은 옛 값으로 나간다
  const way = (r: Record<string, unknown>) => { const a = Number(r.recomputed_overtime_minutes ?? r.overtime_minutes), b = Number(r.overtime_minutes); return a < b ? '줄어듦' : a > b ? '늘어남' : '연장 같음(야간 · 휴일만 바뀜)'; };
  console.log(' 연장 시간:', count(revRows, way));
  for (const r of revRows.filter((x) => way(x) === '늘어남').slice(0, 15)) console.log(`  늘어남 ${r.work_date} ${nm(String(r.employee_id))}: 승인 ${hm(Number(r.overtime_minutes))} → 지금 ${hm(Number(r.recomputed_overtime_minutes))}`);
}
const { count: corr } = await db.from('punch_corrections').select('id', { count: 'exact', head: true }).eq('is_test', false).eq('status', 'pending');
console.log(`\n■ 출퇴근 정정 대기 ${corr ?? 0}건`);

const old = (pend ?? []).filter((r) => r.work_date >= '2026-01-01' && r.work_date <= '2026-04-30');
console.log(`\n반려할 것 (2026-01~04 대기): ${old.length}건`);
if (!apply) { console.log('(보기만 — 반려하려면 --apply)'); process.exit(0); }
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', OFFICE.ownerEmployeeNo).single();
for (const r of old) {
  const { data, error } = await db.rpc('decide_overtime', { p_id: r.id, p_decision: 'rejected', p_approved_minutes: null, p_approved_night: null, p_approved_holiday: null, p_decided_by: sys!.id, p_reason: '시프티 시절(급여 지급 끝난 달) 기록 — 2026-11-03 의뢰인 일괄 반려', p_request_id: null });
  console.log(` ${r.work_date} ${nm(r.employee_id)}: ${error ? `실패 ${error.code} ${error.message}` : data}`);
}
console.log('적용함');
