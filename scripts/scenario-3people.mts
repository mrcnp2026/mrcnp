// 모의 운영 검사 (2026-10-14 의뢰인 요청) — 세 사람으로 처음부터 급여대장 마무리까지 한 번에 돌린다.
//   월급제 1명(10일 근무 + 연차 1일) · 시급제 1명(7일 근무 + 오전 반차 · 오후 4시간 반차 · 연차 1일(8시간)) · 일용직 1명(5일)
//   npx tsx scripts/scenario-3people.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
// 단계마다 「넣은 값 → 프로그램 결과 → 손으로 계산한 기대값」을 맞춰 보고, 알림 숫자(종 · 요청 배지)가 바로 바뀌는지 본다.
// ★ 실제 회사 자료를 건드리지 않게 먼 앞날의 빈 달(2090년대)에서 한다. 그래서 아래 세 가지는 화면 대신 DB에 직접 넣는다(보고서에 적는다):
//   · 출퇴근 버튼: 지금 시각만 찍히는 버튼이라, 같은 DB 함수(record_punch)에 그날 시각을 넘겨 넣는다
//   · 연장 확인 대상: 지난 날에 프로그램이 자동으로 만드는 줄 — 앞날이라 자동으로 안 생겨서 같은 값으로 넣는다
//   · 하루 확정 · 월 마감: 「지난 날 · 끝난 달」만 되는 기능이라 같은 표에 넣는다(마감 화면이 막는 것이 없다는 것은 화면으로 본다)
//   휴가 신청 · 승인 · 연장 승인 · 이상자 통보 · 공지 · 계약 · 대장 만들기 · 계산 · 검토 · 확정 · 공개 · 명세서 · 일용직은 실제 화면 · API로 한다.
// 검사용 세액표 값은 실제 세액표가 아니다(검사용). 끝나면 넣은 설정은 거두고 계정은 끈다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createPassword, unlockConsole } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const who = async (no: string) => (await db.from('profiles').select('id, name').eq('employee_no', no).single()).data!;
const [ADM, A, B] = await Promise.all([who('e2e-audit'), who('e2e-audit2'), who('e2e-audit3')]);
const STARTED = new Date().toISOString();
const TAG = randomBytes(3).toString('hex');
let fails = 0;
const log: string[] = [];
const check = (ok: boolean, what: string, extra = '') => {
  const line = `${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`;
  console.log(line);
  log.push(line);
  if (!ok) fails++;
};
const step = (s: string) => {
  console.log(`\n── ${s} ──`);
  log.push(`\n## ${s}`);
};

// ── 달 고르기: 2090~2098년의 4 · 7 · 11월(고정 공휴일이 없는 달) 중 대장 · 마감이 없는 달 ──
let Y = 0, M = 0;
let found = false;
for (let i = 0; i < 200; i++) {
  Y = 2030 + Math.floor(Math.random() * 70); // 지난 실행이 쌓여 2090년대는 다 찼다 — 넓게(화면이 받는 2100년까지)
  M = [4, 7, 11][Math.floor(Math.random() * 3)];
  const f = `${Y}-${String(M).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(Y, M, 0)).toISOString().slice(0, 10);
  const [{ count: runs }, { count: closes }, { count: rules }, { count: leaves }] = await Promise.all([
    db.from('payroll_runs').select('id', { count: 'exact', head: true }).eq('period_from', f),
    db.from('attendance_closes').select('id', { count: 'exact', head: true }).in('employee_id', [A.id, B.id]).eq('period_from', f),
    db.from('work_rules').select('id', { count: 'exact', head: true }).gte('effective_from', `${Y}-01-01`).lte('effective_from', `${Y}-12-31`),
    // 지난 실행의 휴가가 남은 달은 피한다 — 묶음 12부터 같은 날 겹치는 휴가는 DB가 막는다
    db.from('leave_requests').select('id', { count: 'exact', head: true }).in('employee_id', [A.id, B.id]).in('status', ['pending', 'approved']).gte('start_date', f).lte('start_date', last),
  ]);
  if (!runs && !closes && !rules && !leaves) { found = true; break; }
}
if (!found) throw new Error('비어 있는 검사용 달을 찾지 못했습니다');
const YM = `${Y}-${String(M).padStart(2, '0')}`;
const FROM = `${YM}-01`;
const TO = new Date(Date.UTC(Y, M, 1)).toISOString().slice(0, 10); // 다음 달 1일 (끝 미포함)
const LAST = new Date(Date.UTC(Y, M, 0)).toISOString().slice(0, 10);
const day = (n: number) => `${YM}-${String(n).padStart(2, '0')}`;
// 첫 월요일
let mon1 = 1;
while (new Date(Date.UTC(Y, M - 1, mon1)).getUTCDay() !== 1) mon1++;
const W = (week: number, dow: number) => day(mon1 + week * 7 + dow); // week 0..2, dow 0=월..4=금
console.log(`검사 달: ${YM} (첫 월요일 ${W(0, 0)})`);

// ── 넣을 근무 (사무실 시각) — 기대값은 아래 EXPECT에 손으로 계산해 둔다 ──
type Shift = { date: string; in: string; out: string; note: string };
const A_SHIFTS: Shift[] = [
  { date: W(0, 0), in: '09:00', out: '18:00', note: '정상 8시간' },
  { date: W(0, 1), in: '09:15', out: '18:00', note: '15분 지각 → 7시간 45분' },
  { date: W(0, 2), in: '08:55', out: '17:45', note: '15분 일찍 퇴근 → 7시간 50분' },
  { date: W(0, 3), in: '09:00', out: '20:00', note: '연장 2시간' },
  { date: W(0, 4), in: '09:00', out: '18:00', note: '정상' },
  { date: W(1, 0), in: '09:00', out: '23:00', note: '연장 5시간(그중 야간 1시간) — 연장은 4시간만 인정' },
  { date: W(1, 1), in: '09:00', out: '18:00', note: '정상' },
  { date: W(1, 2), in: '09:00', out: '18:00', note: '정상' },
  { date: W(1, 3), in: '09:00', out: '18:00', note: '정상' },
  { date: W(1, 4), in: '09:00', out: '18:00', note: '정상' },
];
const A_LEAVE = W(2, 0); // 연차 1일
const B_SHIFTS: Shift[] = [
  { date: W(0, 0), in: '09:07', out: '18:00', note: '7분 늦음(유예 10분 안) — 15분 단위로 09:15부터 → 7시간 45분' },
  { date: W(0, 1), in: '08:52', out: '17:38', note: '15분 단위: 09:00 ~ 17:30 → 7시간 30분' },
  { date: W(0, 2), in: '13:00', out: '18:00', note: '오전 반차(09:00~13:00) 뒤 근무 5시간' },
  { date: W(0, 3), in: '09:00', out: '14:00', note: '근무 4시간(점심 1시간 빼고) 뒤 오후 4시간 반차(14:00~18:00)' },
  { date: W(1, 0), in: '09:13', out: '18:00', note: '13분 지각 → 15분 단위 09:15부터 7시간 45분' },
  { date: W(1, 1), in: '09:00', out: '18:00', note: '정상 8시간' },
  { date: W(1, 2), in: '09:00', out: '18:10', note: '10분 더 일함(연장 확인 기준 30분 미만) → 15분 단위 18:00까지 8시간' },
];
const B_MORNING_HALF = W(0, 2), B_AFTERNOON_HALF = W(0, 3), B_ANNUAL = W(0, 4);
const DAILY = [
  { date: W(0, 0), rate: 150000, items: [] as { kind: string; label: string; amount: number }[] },
  { date: W(0, 1), rate: 150000, items: [] },
  { date: W(0, 2), rate: 180000, items: [] },
  { date: W(0, 3), rate: 200000, items: [] },
  { date: W(0, 4), rate: 250000, items: [{ kind: 'NONTAX', label: '식대', amount: 10000 }] },
];
// 손으로 계산한 기대값 (원)
const hourlyA = 3000000 / 209; // 14,354.0669...
// 월급제: 중소기업 취업자 감면 90% → 세액표 90,000 × 10% = 9,000 · 지방 900
// 시급제: 국민연금 · 고용보험 가입 + 두루누리 80% → 832,000 × 4.5% = 37,440 × 20% = 7,488 → 10원 미만 버림 7,480 / 832,000 × 0.9% = 7,488 × 20% = 1,497.6 → 1,490 (요율은 검사용)
const EXPECT = {
  A: { BASE: 3000000, OVERTIME: Math.round(6 * hourlyA * 1.5), NIGHT: Math.round(1 * hourlyA * 0.5), INCOME_TAX: 9000, LOCAL_TAX: 900 },
  B: { BASE: 48 * 13000, PAID_LEAVE: 16 * 13000, PENSION: 7480, EMPLOYMENT: 1490, INCOME_TAX: 10000, LOCAL_TAX: 1000 },
};
const DEDUCT = new Set(['INCOME_TAX', 'LOCAL_TAX', 'PENSION', 'EMPLOYMENT']);
const sumPay = (e: Record<string, number>) => Object.entries(e).filter(([k]) => !DEDUCT.has(k)).reduce((a, [, v]) => a + v, 0);
const net = (e: Record<string, number>) => sumPay(e) - Object.entries(e).filter(([k]) => DEDUCT.has(k)).reduce((a, [, v]) => a + v, 0);
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

// 정리할 것
let ruleId: string | null = null;
let refId: string | null = null;
const tempRefs: string[] = [];
let settingId: string | null = null;
let noticeId: string | null = null;
const closeIds: string[] = [];
const payeeIds: string[] = [];
const policyBefore = new Map<string, boolean>();

const withdrawPay = async () => {
  for (const id of [A.id, B.id]) {
    await db.from('payroll_contract_versions').update({ status: 'withdrawn' }).eq('employee_id', id).eq('status', 'active');
    await db.from('payroll_employee_tax_versions').update({ status: 'withdrawn' }).eq('employee_id', id).eq('status', 'active');
    await db.from('payroll_employee_items').update({ active: false }).eq('employee_id', id).eq('active', true);
    const { data: evs } = await db.from('payroll_publication_events').select('statement_id, run_id, kind').eq('employee_id', id).order('id');
    const latest = new Map<string, { run_id: string; kind: string }>();
    for (const e of evs ?? []) latest.set(e.statement_id as string, { run_id: e.run_id as string, kind: e.kind as string });
    for (const [sid, e] of latest) if (e.kind === 'PUBLISHED') await db.from('payroll_publication_events').insert({ statement_id: sid, run_id: e.run_id, employee_id: id, kind: 'UNPUBLISHED', reason: '모의 운영 검사 정리', actor_id: ADM.id });
  }
};
await withdrawPay();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
try {
  for (const [p, role] of [[ADM, 'admin'], [A, 'employee'], [B, 'employee']] as const) {
    await db.auth.admin.updateUserById(p.id, { ban_duration: 'none' });
    await db.from('profiles').update({ active: true, role, locale: 'ko', joined_on: null, ...(role === 'admin' ? { can_view_payroll: true } : {}) }).eq('id', p.id);
  }
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  const login = async (id: string): Promise<Page> => {
    for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
    const token = randomBytes(32).toString('base64url');
    await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'emergency', expires_at: new Date(Date.now() + 3600e3).toISOString() });
    const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(`${BASE}/register?token=${token}`);
    await createPassword(pg);
    return pg;
  };
  const postOn = (pg: Page, url: string, body: unknown) => pg.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  const alerts = async (pg: Page) => (await pg.evaluate(async () => (await fetch('/api/me/alerts', { cache: 'no-store' })).json())) as { notices: number; messages: number; requests: number };
  const bell = async (pg: Page) => Number(((await pg.locator('[data-alert-bell]').first().getAttribute('aria-label')) ?? '').replace(/\D/g, '') || 0);
  const open = async (pg: Page, url: string) => {
    await pg.goto(`${BASE}${url}`);
    await pg.waitForLoadState('networkidle');
    return pg.locator('body').innerText();
  };
  const shot = async (pg: Page, name: string) => {
    if (!SHOTS) return;
    await pg.waitForLoadState('networkidle');
    await pg.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  const p = await login(ADM.id);
  const qa = await login(A.id);
  const qb = await login(B.id);
  const post = (url: string, body: unknown) => postOn(p, url, body);

  // ════ 1. 설정 (관리자 · 통합설정 잠금 숫자로 연다) ════
  step('1. 설정 — 근무 규칙 · 휴가 부여 · 계약 · 세무');
  await unlockConsole(p, db, ADM.id);
  let r = await post('/api/admin/settings', { action: 'rule.add', startTime: '09:00', endTime: '18:00', lateGraceMin: 10, breakStart: '12:00', breakEnd: '13:00', workdays: [1, 2, 3, 4, 5], weeklyRestDay: 7, roundStepMin: 15, effectiveFrom: FROM });
  ruleId = (r.json.id as string) ?? null;
  check(r.status === 200, `근무 규칙: 09:00~18:00 · 점심 12~13시 · 지각 유예 10분 · 급여용 시간 15분 단위 (${FROM}부터)`, JSON.stringify(r.json));
  for (const [x, n] of [[A, 5], [B, 5]] as const) {
    r = await post('/api/admin/leave/grants', { employeeId: x.id, periodLabel: `e2e-${YM}-${TAG}`, grantedDays: n, carriedDays: 0, basis: 'hire_date', effectiveFrom: `${Y}-01-01` });
    check(r.status === 200, `${x.name}: 연차 ${n}일 부여`, JSON.stringify(r.json));
  }
  const none = (why: string) => ({ state: 'NO', reportedWage: null, note: why });
  const taxBody = { action: 'tax', validFrom: FROM, reason: null, expectedVersion: 0, withholdingRatio: 100, familyCount: 1, childCount: 0, insurance: { pension: none('모의 검사'), health: none('모의 검사'), employment: none('모의 검사'), accident: none('모의 검사') }, studentLoan: { state: 'NO', monthlyAmount: null } };
  r = await post(`/api/admin/payroll/staff/${A.id}`, { action: 'contract', validFrom: FROM, reason: null, expectedVersion: 0, payType: 'MONTHLY', amount: 3000000, timeBasis: 'ACTUAL', monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null, note: null } });
  check(r.status === 200, `${A.name}: 월급제 계약 3,000,000원 · 월 209시간 · 실제 시간 기준`, JSON.stringify(r.json));
  r = await post(`/api/admin/payroll/staff/${A.id}`, { ...taxBody, reliefs: { sme: { state: 'YES', rate: 90, from: FROM, to: null, note: '모의 — 감면신청서 받음' }, durunuri: { state: 'NO', note: '모의 — 대상 아님' } } });
  check(r.status === 200, `${A.name}: 세무(본인 1명 · 100%) · 4대보험 가입 안 함 · 중소기업 취업 감면 90%`, JSON.stringify(r.json));
  r = await post(`/api/admin/payroll/staff/${B.id}`, { action: 'contract', validFrom: FROM, reason: null, expectedVersion: 0, payType: 'HOURLY', amount: 13000, timeBasis: 'ROUNDED', monthlyHours: null, annualDivisor: null, included: { overtimeHours: null, holidayHours: null, note: null } });
  check(r.status === 200, `${B.name}: 시급제 계약 13,000원 · 15분 단위로 끊은 시간 기준`, JSON.stringify(r.json));
  const yes = { state: 'YES', reportedWage: null, note: null };
  r = await post(`/api/admin/payroll/staff/${B.id}`, { ...taxBody, insurance: { pension: yes, health: none('모의 검사'), employment: yes, accident: none('모의 검사') }, reliefs: { sme: { state: 'NO', note: '모의 — 대상 아님' }, durunuri: { state: 'YES', pensionRate: 80, employmentRate: 80, from: FROM, to: null, note: '모의 — 공단 지원 결정' } } });
  check(r.status === 200, `${B.name}: 세무 · 국민연금 · 고용보험 가입 · 두루누리 80%`, JSON.stringify(r.json));
  // 검사용 세액표 (그 한 달에만, 실제 세액표 아님): 77만~200만 → 1만원, 200만~1000만 → 9만원 (본인 1명 기준, 가족이 많을수록 조금씩 적게)
  {
    const payload = { wageMin: 770000, wageMaxExclusive: 10000000, families: 11, bandCount: 2, e2e: `scenario-${YM}` };
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const ref = await db.from('payroll_reference_versions').insert({ reference_kind: 'income-tax.table', origin: 'manual', valid_from: FROM, valid_to: TO, normalized_payload: payload, source_unit: '원', payload_hash: hash, state: 'APPROVED', reviewed_payload_hash: hash, review_reason: 'e2e', approved_by: ADM.id, approved_at: new Date().toISOString(), created_by: ADM.id }).select('id').single();
    refId = (ref.data?.id as string) ?? null;
    const fam = (base: number) => Array.from({ length: 11 }, (_, i) => Math.max(0, base - i * 1000));
    await db.from('payroll_tax_rows').insert([...fam(10000).map((t, i) => ({ reference_version_id: refId, wage_from: 770000, wage_to: 2000000, family_count: i + 1, base_tax: t })), ...fam(90000).map((t, i) => ({ reference_version_id: refId, wage_from: 2000000, wage_to: 10000000, family_count: i + 1, base_tax: t }))]);
    check(!!refId, '검사용 세액표(그 달에만): 77만~200만원 → 소득세 10,000 / 200만~1,000만원 → 90,000 (본인 1명)');
    // 검사용 보험 요율(그 한 달에만): 국민연금 4.5% · 상하한 39만~617만 · 고용보험 0.9%
    for (const [kind, payload2, unit] of [['pension.rate', { employeeRate: '0.045', employerRate: '0.045', e2e: YM }, '%'], ['pension.limit', { lower: 390000, upper: 6170000, e2e: YM }, '원'], ['employment.rate', { employeeRate: '0.009', employerRate: '0.009', e2e: YM }, '%']] as const) {
      const h = createHash('sha256').update(JSON.stringify(payload2)).digest('hex');
      const x = await db.from('payroll_reference_versions').insert({ reference_kind: kind, origin: 'manual', valid_from: FROM, valid_to: TO, normalized_payload: payload2, source_unit: unit, payload_hash: h, state: 'APPROVED', reviewed_payload_hash: h, review_reason: 'e2e', approved_by: ADM.id, approved_at: new Date().toISOString(), created_by: ADM.id }).select('id').single();
      if (x.data) tempRefs.push(x.data.id as string);
    }
    check(tempRefs.length === 3, '검사용 보험 요율(그 달에만): 국민연금 4.5% · 고용보험 0.9%');
    // 회사 설정 「두루누리 · 중소기업 감면 사용」을 그 한 달에만 켠다(끝에 거둔다)
    const { data: vs } = await db.from('payroll_company_setting_versions').select('version').eq('section', 'employee-defaults').order('version', { ascending: false }).limit(1);
    const st = await db.from('payroll_company_setting_versions').insert({ section: 'employee-defaults', payload: { payType: null, durunuri: true, smeTaxCut: true }, valid_from: FROM, valid_to: TO, version: ((vs?.[0]?.version as number | undefined) ?? 0) + 1, reason: '모의 운영 검사 — 그 한 달만', created_by: ADM.id }).select('id').single();
    settingId = (st.data?.id as string) ?? null;
    check(!!settingId, `회사 설정: 두루누리 · 중소기업 감면 사용 (${YM} 한 달만)`, st.error?.message ?? '');
  }
  // 연장 · 야간 수당 정책: 회사 설정 그대로 둔다(지금 「쓰지 않음」이면 계산이 막혀야 한다)
  {
    const { data: pols } = await db.from('payroll_policy_versions').select('id, policy_kind, in_use').eq('status', 'active').is('valid_to', null).in('policy_kind', ['allowance.overtime', 'allowance.night']);
    for (const x of pols ?? []) policyBefore.set(x.id as string, x.in_use as boolean);
    log.push(`(회사 설정 상태: ${(pols ?? []).map((x) => `${x.policy_kind}=${x.in_use ? '사용' : '사용 안 함'}`).join(', ')})`);
  }

  // ════ 2. 출퇴근 ════
  step('2. 출퇴근 — 월급제 10일 · 시급제 7일');
  const punch = async (id: string, date: string, kind: 'in' | 'out', hm: string) => {
    const { error } = await db.rpc('record_punch', { p_employee_id: id, p_kind: kind, p_now: new Date(`${date}T${hm}:00+09:00`).toISOString(), p_timezone: 'Asia/Seoul', p_client_ip: null, p_ip_verified: true, p_source: 'web', p_is_test: true, p_passkey_id: null, p_dedupe_seconds: 60, p_open_shift_max_hours: 24, p_geo_lat: null, p_geo_lng: null, p_verified_by: 'ip', p_location_id: null });
    if (error) throw new Error(`punch ${date} ${kind}: ${error.message}`);
  };
  for (const [x, list] of [[A, A_SHIFTS], [B, B_SHIFTS]] as const) {
    for (const s of list) {
      await punch(x.id, s.date, 'in', s.in);
      await punch(x.id, s.date, 'out', s.out);
    }
    const { count } = await db.from('punch_events').select('id', { count: 'exact', head: true }).eq('employee_id', x.id).eq('is_test', true).gte('work_date', FROM).lt('work_date', TO);
    check(count === list.length * 2, `${x.name}: ${list.length}일 출근 · 퇴근 ${list.length * 2}건 저장`, `${count}건`);
  }

  // ════ 3. 요청 → 요청 숫자 ════
  step('3. 휴가 신청 · 연장 확인 대상 → 관리자 요청 숫자');
  // 요청 화면을 한 번 열어 둔다 — 열 때 지난 날의 연장 확인 대상을 자동으로 만든다(다른 검사가 남긴 기록이 여기서 생길 수 있다). 그 뒤의 숫자를 기준으로 삼는다
  await open(p, '/admin/inbox');
  const r0 = await alerts(p);
  const leaveIds: Record<string, string> = {};
  r = await postOn(qa, '/api/leave', { typeCode: 'annual', startDate: A_LEAVE, endDate: A_LEAVE, reason: '모의 — 연차 1일' });
  leaveIds.aAnnual = r.json.id;
  check(r.status === 200 && r.json.days === 1, `${A.name}: 연차 1일 신청 (${A_LEAVE}) = 1일`, JSON.stringify(r.json));
  r = await postOn(qb, '/api/leave', { typeCode: 'half', startDate: B_MORNING_HALF, startTime: '09:00', reason: '모의 — 오전 반차' });
  leaveIds.bMorning = r.json.id;
  check(r.status === 200 && r.json.days === 0.5, `${B.name}: 오전 반차 09:00~13:00 (${B_MORNING_HALF}) = 0.5일`, JSON.stringify(r.json));
  r = await postOn(qb, '/api/leave', { typeCode: 'half', startDate: B_AFTERNOON_HALF, startTime: '14:00', reason: '모의 — 오후 4시간 반차' });
  leaveIds.bAfternoon = r.json.id;
  check(r.status === 200 && r.json.days === 0.5, `${B.name}: 오후 4시간 반차 14:00~18:00 (${B_AFTERNOON_HALF}) = 0.5일`, JSON.stringify(r.json));
  r = await postOn(qb, '/api/leave', { typeCode: 'annual', startDate: B_ANNUAL, endDate: B_ANNUAL, reason: '모의 — 8시간(1일) 연차' });
  leaveIds.bAnnual = r.json.id;
  check(r.status === 200 && r.json.days === 1, `${B.name}: 연차 1일(8시간) 신청 (${B_ANNUAL}) = 1일`, JSON.stringify(r.json));
  r = await postOn(qb, '/api/leave', { typeCode: 'annual', startDate: W(2, 1), endDate: W(2, 4), reason: '잔여 넘게' });
  check(r.status === 409 && r.json.error === 'insufficient_balance', `${B.name}: 남은 연차(5 − 대기 2일 = 3일)보다 많은 4일은 거절`, JSON.stringify(r.json));
  // 연장 확인 대상 — 지난 날이면 프로그램이 자동으로 만드는 줄 (앞날이라 같은 값으로 넣는다)
  const ot = await db.from('overtime_requests').insert([
    { employee_id: A.id, work_date: A_SHIFTS[3].date, overtime_minutes: 120, night_minutes: 0, holiday_minutes: 0, is_test: true, calc_version: '2026.10-1' },
    { employee_id: A.id, work_date: A_SHIFTS[5].date, overtime_minutes: 300, night_minutes: 60, holiday_minutes: 0, is_test: true, calc_version: '2026.10-1' },
  ]).select('id, work_date');
  const otId = (d: string) => ot.data!.find((x) => x.work_date === d)!.id as string;
  const r1 = await alerts(p);
  check(r1.requests === r0.requests + 6, `관리자 「처리할 요청」 숫자: ${r0.requests} → ${r1.requests} (휴가 4건 + 연장 2건 = +6)`);
  await open(p, '/admin');
  const bellAdmin = await bell(p);
  check(bellAdmin === r1.notices + r1.messages + r1.requests, `관리자 화면 종 숫자 = 공지 ${r1.notices} + 메시지 ${r1.messages} + 요청 ${r1.requests}`, `종 ${bellAdmin}`);
  const inbox = await open(p, '/admin/inbox');
  check(inbox.includes(A.name) && inbox.includes(B.name), '요청 목록(대기중)에 두 사람의 요청이 보인다');
  await shot(p, 's3-admin-inbox');
  const myReq = await open(qb, '/punch/requests');
  check(myReq.includes('모의 — 오전 반차') && myReq.includes('모의 — 오후 4시간 반차'), `${B.name}: 내 요청(대기중)에 반차 2건이 보인다`);

  // ════ 4. 승인 → 숫자가 바로 줄어드는지 ════
  step('4. 관리자 승인 — 화면에서 누르면 종 숫자가 바로 줄어드는가');
  await open(p, `/admin/inbox?k=leave&id=${leaveIds.bMorning}`);
  const before = await bell(p);
  await p.locator('main').getByRole('button', { name: '승인', exact: true }).locator('visible=true').first().click();
  await p.locator('main').getByRole('button', { name: '확인', exact: true }).locator('visible=true').first().click();
  await p.getByText('처리했습니다.').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  const after = await bell(p);
  check(after === before - 1, `화면에서 「승인 → 확인」을 누르면 화면을 옮기지 않아도 종 숫자가 ${before} → ${after}`);
  for (const id of [leaveIds.aAnnual, leaveIds.bAfternoon, leaveIds.bAnnual]) {
    r = await post(`/api/admin/leave/${id}/decide`, { decision: 'approved' });
    check(r.json.result === 'ok', '휴가 승인', JSON.stringify(r.json));
  }
  r = await post(`/api/admin/overtime/${otId(A_SHIFTS[3].date)}/decide`, { decision: 'approved', approvedMinutes: 120, approvedNightMinutes: 0, approvedHolidayMinutes: 0 });
  check(r.json.result === 'ok', `${A.name}: ${A_SHIFTS[3].date} 연장 2시간 전부 인정`, JSON.stringify(r.json));
  r = await post(`/api/admin/overtime/${otId(A_SHIFTS[5].date)}/decide`, { decision: 'approved', approvedMinutes: 240, approvedNightMinutes: 60, approvedHolidayMinutes: 0 });
  check(r.json.result === 'ok', `${A.name}: ${A_SHIFTS[5].date} 연장 5시간 중 4시간만 인정 · 야간 1시간 인정 (부분 인정)`, JSON.stringify(r.json));
  r = await post(`/api/admin/overtime/${otId(A_SHIFTS[5].date)}/decide`, { decision: 'approved', approvedMinutes: 600, approvedNightMinutes: 0, approvedHolidayMinutes: 0 });
  check(r.json.result === 'already', '이미 처리한 연장을 또 처리할 수 없다', JSON.stringify(r.json));
  const r2 = await alerts(p);
  check(r2.requests === r0.requests, `전부 처리하면 요청 숫자가 처음(${r0.requests})으로 돌아온다`, String(r2.requests));
  // 휴가 현황
  const { data: lr } = await db.from('leave_requests').select('employee_id, days, status').in('id', Object.values(leaveIds));
  const used = (id: string) => (lr ?? []).filter((x) => x.employee_id === id && x.status === 'approved').reduce((a, x) => a + Number(x.days), 0);
  check(used(A.id) === 1 && used(B.id) === 2, `승인된 휴가: ${A.name} 1일 · ${B.name} 2일(반차 0.5 + 0.5 + 연차 1)`, `${used(A.id)} / ${used(B.id)}`);
  // 남은 연차 — 서버가 계산한 잔여로 확인한다 (2026-10-15: 예전 검사는 화면 글자에 「4일」이 있는지만 봐서 날짜 「14일」에 걸려 우연히 통과했다.
  //   화면의 「남은 연차」 카드는 오늘 기준이고, 이 검사의 연차는 ${Y}년부터 유효하다)
  const overA = await postOn(qa, '/api/leave', { typeCode: 'annual', startDate: W(1, 0), endDate: W(1, 4), reason: '잔여 확인' }); // 5일 > 남은 4일 (A의 연차 W(2,0)과 겹치지 않게)
  check(overA.status === 409 && overA.json.error === 'insufficient_balance', `${A.name}: 남은 연차 4일(5 − 사용 1) — 5일은 거절`, JSON.stringify(overA.json));
  const overB = await postOn(qb, '/api/leave', { typeCode: 'annual', startDate: W(2, 0), endDate: W(2, 3), reason: '잔여 확인' }); // 4일 > 남은 3일
  check(overB.status === 409 && overB.json.error === 'insufficient_balance', `${B.name}: 남은 연차 3일(5 − 사용 2) — 4일은 거절`, JSON.stringify(overB.json));
  for (const o of [overA, overB]) if (o.json.id) await db.from('leave_requests').update({ status: 'cancelled' }).eq('id', o.json.id);
  await shot(qb, 's4-B-leave');

  // ════ 5. 관리가 필요한 직원 · 통보 · 공지 → 직원 쪽 숫자 ════
  step('5. 근태 이상자 · 통보 메시지 · 공지 — 직원 종 숫자');
  // 이상자 · 리포트 · 마감 화면은 「지난 날」만 판정한다(앞날은 아직 모른다) → 이번 달의 지난 평일 하루에 관리자 대리 입력으로 지각 기록을 만든다
  const kstNow = new Date(Date.now() + 9 * 3600e3);
  const NOW_YM = kstNow.toISOString().slice(0, 7);
  // 입사 전 날짜는 이상 기록에서 빠진다(원래 규칙) — B는 입사일이 비어 계정을 만든 날(10-05)부터 센다. 이 단계 동안만 입사일을 이달 1일로
  await db.from('profiles').update({ joined_on: `${NOW_YM}-01` }).eq('id', B.id);
  let PAST = '';
  for (let n = 1; n <= 20 && !PAST; n++) {
    const d = new Date(kstNow.getTime() - n * 86400e3);
    const ds = d.toISOString().slice(0, 10);
    if (!ds.startsWith(NOW_YM) || d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const [{ count: ev }, { count: co }] = await Promise.all([
      db.from('punch_events').select('id', { count: 'exact', head: true }).eq('employee_id', B.id).eq('work_date', ds),
      db.from('punch_corrections').select('id', { count: 'exact', head: true }).eq('employee_id', B.id).eq('work_date', ds),
    ]);
    if (!ev && !co) PAST = ds;
  }
  if (!PAST) log.push('(이번 달에 비어 있는 지난 평일이 없어 이상자 · 통보 단계는 건너뜀 — 다음 달에 다시)');
  else {
    r = await post(`/api/admin/employees/${B.id}/punch`, { workDate: PAST, kind: 'in', time: '09:25', reason: '모의 운영 — 출근 버튼을 못 눌러 관리자가 넣음' });
    const r2 = await post(`/api/admin/employees/${B.id}/punch`, { workDate: PAST, kind: 'out', time: '18:00', reason: '모의 운영 — 퇴근' });
    check(r.status === 200 && r2.status === 200, `${B.name}: ${PAST} 관리자 대리 입력 09:25 출근(25분 지각) · 18:00 퇴근`, JSON.stringify([r.json, r2.json]));
    const anomalies = await open(p, `/admin/anomalies?m=${NOW_YM}`);
    check(anomalies.includes(B.name), `근태 이상자(${NOW_YM}) 목록에 ${B.name}의 지각이 나온다`);
    await shot(p, 's5-anomalies');
    const qb0 = await alerts(qb);
    r = await post('/api/admin/anomalies', { action: 'notify', month: NOW_YM, employeeIds: [B.id] });
    check(r.json.sent === 1, `이상자 통보: ${B.name}에게 업무 메시지`, JSON.stringify(r.json));
    const qb1m = await alerts(qb);
    check(qb1m.messages === qb0.messages + 1, `${B.name}: 안 읽은 메시지 ${qb0.messages} → ${qb1m.messages}`);
    await open(qb, '/punch/messages');
    check((await bell(qb)) === qb1m.notices + qb1m.messages, `${B.name}: 직원 화면 종 숫자에 반영`, String(await bell(qb)));
    const { data: msg } = await db.from('work_message_recipients').select('message_id').eq('employee_id', B.id).is('read_at', null).order('created_at', { ascending: false }).limit(1);
    const body = await open(qb, `/punch/messages/${msg?.[0]?.message_id}`);
    check(body.includes(PAST), `${B.name}: 통보 메시지에 지각한 날(${PAST})이 적혀 있다`);
    await db.from('profiles').update({ joined_on: null }).eq('id', B.id);
    const qb2m = await alerts(qb);
    check(qb2m.messages === qb0.messages, `${B.name}: 메시지를 열면 안 읽은 수가 다시 ${qb2m.messages}`);
    const rep = await open(p, `/admin/reports/attendance?m=${NOW_YM}`);
    check(rep.includes(B.name), `근태 리포트(${NOW_YM})에 ${B.name}`);
    await shot(p, 's5-report');
    const clo = await open(p, `/admin/closing?m=${NOW_YM}`);
    check(clo.includes(B.name), `근태 마감 화면(${NOW_YM})에 ${B.name}과 이상 기록`);
  }
  r = await post('/api/admin/notices', { title: `[점검] 모의 운영 공지 ${TAG}`, body: '모의 운영 검사용 공지입니다. 검사 계정 두 명에게만 보입니다.', audience: 'selected', targets: [A.id, B.id] });
  noticeId = (r.json.id as string) ?? null;
  r = await post(`/api/admin/notices/${noticeId}/status`, { action: 'publish' });
  check(r.status === 200, '공지 게시(받는 사람: 검사 계정 두 명만)', JSON.stringify(r.json));
  const qb1 = await alerts(qb);
  check(qb1.notices >= 1, `${B.name}: 확인 안 한 공지 ${qb1.notices}건`);
  r = await postOn(qb, `/api/notices/${noticeId}/confirm`, {});
  await postOn(qa, `/api/notices/${noticeId}/confirm`, {}); // 월급제 직원도 확인 — 안 하면 홈 화면마다 공지 창이 떠서 다른 단추를 가린다
  const qb2 = await alerts(qb);
  check(qb2.notices === qb1.notices - 1, `${B.name}: 공지를 확인하면 ${qb1.notices} → ${qb2.notices}`, JSON.stringify(r.json));

  // ════ 6. 하루 확정 · 월 마감 ════
  step('6. 기록 확정 · 근태 마감');
  for (const [x, list] of [[A, A_SHIFTS], [B, B_SHIFTS]] as const) {
    const { error } = await db.from('day_confirms').insert(list.map((s) => ({ employee_id: x.id, work_date: s.date, is_test: true, confirmed_by: ADM.id })));
    check(!error, `${x.name}: 근무한 ${list.length}일 확정`, error?.message ?? '');
  }
  for (const x of [A, B]) {
    const c = await db.from('attendance_closes').insert({ employee_id: x.id, period_from: FROM, period_to: TO, is_test: true, input_hash: 'scenario', closed_by: ADM.id }).select('id').single();
    if (c.data) closeIds.push(c.data.id as string);
  }
  check(closeIds.length === 2, `${YM} 근태 마감(두 사람)`);

  // ════ 7. 급여대장 ════
  step('7. 급여대장 — 만들기 → 계산 → 검토 → 확정 → 공개');
  const made = await post('/api/admin/payroll/runs', { action: 'create', month: YM });
  const runId = made.json.id as string;
  check(made.status === 200 && !!runId, `대장 만들기 (${YM})`, JSON.stringify(made.json));
  await db.from('payroll_runs').update({ title: 'e2e-모의 운영', version: ((await db.from('payroll_runs').select('version').eq('id', runId).single()).data!.version as number) + 1 }).eq('id', runId);
  const again = await post('/api/admin/payroll/runs', { action: 'create', month: YM });
  check(again.json.id === runId && again.json.existed === true, '같은 달을 또 만들면 새로 만들지 않고 있던 대장을 연다', JSON.stringify(again.json));
  const api = `/api/admin/payroll/runs/${runId}`;
  const run = async () => (await db.from('payroll_runs').select('status, version, current_generation_id').eq('id', runId).single()).data!;
  const { data: mem } = await db.from('payroll_run_members').select('employee_id').eq('run_id', runId);
  check(!!mem?.some((m) => m.employee_id === A.id) && !!mem?.some((m) => m.employee_id === B.id), '두 사람이 대장 대상에 들어 있다', `대상 ${mem?.length}명`);
  for (const m of (mem ?? []).filter((x) => x.employee_id !== A.id && x.employee_id !== B.id)) await post(api, { action: 'exclude', employeeId: m.employee_id, reason: '모의 운영 — 검사 계정만 계산' });
  const stmt = async (id: string) => {
    const g = (await run()).current_generation_id;
    const { data: s } = await db.from('payroll_statements').select('id, state, blockers, pay_total, deduction_total, net_total, snapshot').eq('generation_id', g).eq('employee_id', id).single();
    const { data: lines } = s ? await db.from('payroll_statement_items').select('item_code, kind, amount, quantity').eq('statement_id', s.id) : { data: [] };
    const mine = (lines ?? []).filter((l) => l.kind !== 'EMPLOYER');
    const employer = (lines ?? []).filter((l) => l.kind === 'EMPLOYER').reduce((a, l) => a + Number(l.amount), 0);
    return { s, employer, lines: Object.fromEntries(mine.map((l) => [l.item_code, Number(l.amount)])) as Record<string, number>, qty: Object.fromEntries(mine.map((l) => [l.item_code, l.quantity])) };
  };
  // 1차: 회사 설정의 연장 · 야간 수당이 「사용 안 함」이면 월급제는 막혀야 한다
  let rr = await run();
  let calc = await post(api, { action: 'calculate', expectedVersion: rr.version });
  check(calc.status === 200, '1차 계산', JSON.stringify(calc.json));
  let sa = await stmt(A.id), sb = await stmt(B.id);
  const codes = (s: { blockers?: unknown } | null) => ((s?.blockers ?? []) as { code: string; detail?: string }[]).map((b) => `${b.code}${b.detail ? `:${b.detail}` : ''}`).join(', ');
  log.push(`1차 결과: ${A.name} ${sa.s?.state} [${codes(sa.s)}] / ${B.name} ${sb.s?.state} [${codes(sb.s)}]`);
  const policyOff = [...policyBefore.values()].some((v) => !v);
  if (policyOff) check(sa.s?.state === 'BLOCKED' && codes(sa.s).includes('policy_missing'), `${A.name}: 연장 · 야간 수당 정책이 「사용 안 함」이라 금액을 만들지 않고 막는다 (0원으로 채우지 않음)`, codes(sa.s));
  check(sb.s?.state === 'OK', `${B.name}: 1차 계산 OK (10분 더 일한 날이 있어도 막히지 않는다)`, `${sb.s?.state} ${codes(sb.s)}`);
  // 수당 정책을 켠다 (통합설정 → 급여 → 수당 정책에서 켜는 것과 같은 값) — 끝에 원래대로
  if (policyOff) await db.from('payroll_policy_versions').update({ in_use: true }).in('id', [...policyBefore.keys()]);
  rr = await run();
  calc = await post(api, { action: 'calculate', expectedVersion: rr.version });
  sa = await stmt(A.id);
  sb = await stmt(B.id);
  log.push(`2차 결과: ${A.name} ${sa.s?.state} [${codes(sa.s)}] ${JSON.stringify(sa.lines)} / ${B.name} ${sb.s?.state} [${codes(sb.s)}] ${JSON.stringify(sb.lines)}`);
  const cmp = (name: string, got: Record<string, number>, exp: Record<string, number>) => {
    for (const [k, v] of Object.entries(exp)) check(got[k] === v, `${name} ${k}: 프로그램 ${got[k] === undefined ? '없음' : won(got[k])} / 기대 ${won(v)}`);
    const extra = Object.keys(got).filter((k) => !(k in exp));
    check(extra.length === 0, `${name}: 기대하지 않은 항목이 없다`, extra.join(','));
  };
  check(sa.s?.state === 'OK', `${A.name}: 2차 계산 OK`, codes(sa.s));
  cmp(A.name, sa.lines, EXPECT.A);
  check(Number(sa.s?.net_total) === net(EXPECT.A), `${A.name} 실지급: 프로그램 ${won(Number(sa.s?.net_total))} / 기대 ${won(net(EXPECT.A))}`);
  const attA = (sa.s?.snapshot as { time?: Record<string, number> } | undefined)?.time;
  check(attA?.overtimeMinutes === 360 && attA?.nightMinutes === 60, `${A.name}: 급여에 들어간 연장 = 인정한 6시간(실제 7시간 중) · 야간 1시간`, JSON.stringify(attA));
  check(sb.s?.state === 'OK', `${B.name}: 2차 계산 OK`, codes(sb.s));
  cmp(B.name, sb.lines, EXPECT.B);
  check(Number(sb.s?.net_total) === net(EXPECT.B), `${B.name} 실지급: 프로그램 ${won(Number(sb.s?.net_total))} / 기대 ${won(net(EXPECT.B))}`);
  const attB = (sb.s?.snapshot as { time?: Record<string, number>; attendance?: Record<string, number> } | undefined);
  check(attB?.time?.workedMinutes === 2880 && attB?.attendance?.netMinutes === 2916 && attB?.time?.paidLeaveMinutes === 960, `${B.name}: 급여용 시간 48시간(15분 단위) · 실제 48시간 36분 · 유급휴가 16시간(2일)`, JSON.stringify({ worked: attB?.time?.workedMinutes, actual: attB?.attendance?.netMinutes, leave: attB?.time?.paidLeaveMinutes }));
  let page = await open(p, `/admin/payroll/runs/${runId}/${A.id}`);
  check(page.includes(won(net(EXPECT.A))) && page.includes('연장'), `관리자 명세 화면(${A.name})에 실지급 · 연장 항목`);
  await shot(p, 's7-A-statement');
  page = await open(p, `/admin/payroll/runs/${runId}/${B.id}`);
  check(page.includes(won(net(EXPECT.B))), `관리자 명세 화면(${B.name})에 실지급`);
  await shot(p, 's7-B-statement');
  page = await open(p, `/admin/payroll/runs/${runId}`);
  check((await p.locator('nav[aria-label="이 대장의 진행"] li').count()) === 5, '대장 화면에 진행 단계 5칸(만들기 → 계산 → 검토 → 확정 → 공개)');
  await p.getByRole('button', { name: '검토 완료' }).click();
  await p.getByText('검토됨', { exact: true }).first().waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: '확정', exact: true }).click();
  await p.getByRole('button', { name: '확정', exact: true }).last().click();
  await p.getByText('확정한 대장입니다.').waitFor({ timeout: 30000 });
  check((await run()).status === 'FINALIZED', '검토 → 확정');
  {
    const pdf = await p.evaluate(async (u) => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type') ?? '', head: String.fromCharCode(...b.slice(0, 5)), size: b.length }; }, `/api/admin/payroll/runs/${runId}/pdf-all`);
    check(pdf.status === 200 && pdf.type === 'application/pdf' && pdf.head === '%PDF-' && pdf.size > 5000, '대장 전체 명세서 PDF 한 파일 (계산된 2명)', JSON.stringify(pdf));
  }
  const slipBefore = await open(qa, '/punch/payslips');
  check(!slipBefore.includes(won(net(EXPECT.A))), `${A.name}: 공개 전에는 내 급여에 금액이 없다`);
  await open(p, `/admin/payroll/runs/${runId}`);
  await p.getByRole('button', { name: '공개하지 않은 2명에게 공개' }).click();
  await p.getByText('2명에게 공개했습니다.').waitFor({ timeout: 30000 });
  check(true, '두 사람에게 명세서 공개');
  check(sb.employer === 7480 + 1490, `${B.name}: 사업주 부담도 두루누리만큼 줄어든다 (국민연금 7,480 + 고용보험 1,490)`, String(sb.employer));
  const blk = (x: { blockers?: unknown } | null) => ((x?.blockers ?? []) as { code: string }[]).map((b) => b.code);
  check(blk(sa.s).includes('sme_applied') && blk(sb.s).includes('durunuri_pension') && blk(sb.s).includes('durunuri_employment'), '명세에 「감면 적용」 · 「두루누리 적용」 참고가 남는다');
  const slipA = await open(qa, '/punch/payslips');
  check(slipA.includes(`${YM}`) && slipA.includes(won(net(EXPECT.A)).replace('원', '')), `${A.name}: 내 급여 조회에 ${YM} 실지급 ${won(net(EXPECT.A))}`);
  await qa.locator('main summary', { hasText: '자세히 보기' }).click();
  const detailA = await qa.locator('main').innerText();
  check(detailA.includes('중소기업 취업 소득세 감면') && /\b90\s*%/.test(detailA) && detailA.includes('36,000,000'), `${A.name}: 내 급여 조회 — 연봉(월급 × 12) 36,000,000 · 중소기업 감면 90%가 보인다`); // 2026-10-15: 「적용 예정」 같은 설명 문장은 뺐다(의뢰인)
  await shot(qa, 's7-A-myslip');
  const slipB = await open(qb, '/punch/payslips');
  check(slipB.includes(won(net(EXPECT.B)).replace('원', '')), `${B.name}: 내 급여 조회에 실지급 ${won(net(EXPECT.B))}`);
  await qb.locator('main summary', { hasText: '자세히 보기' }).click();
  const detailB = await qb.locator('main').innerText();
  check(detailB.includes('두루누리 적용여부') && /\b80\s*%/.test(detailB) && detailB.includes('13,000'), `${B.name}: 내 급여 조회 — 시급 13,000 · 두루누리 80%`);
  await shot(qb, 's7-B-myslip');

  // ════ 8. 일용직 ════
  step('8. 일용직 — 등록 → 고용 기간 → 5일 근무 → 일용 대장');
  const D = '/api/admin/payroll/daily';
  r = await post(D, { action: 'payee.add', internalNo: `e2e-s-${TAG}`, name: `일용모의${TAG}` });
  const P = r.json.id as string;
  payeeIds.push(P);
  check(r.status === 200, '일용직 대상자 등록');
  r = await post(D, { action: 'engagement.add', payeeId: P, startsOn: FROM, endsOn: LAST, project: '현장모의', dayRate: 150000, taxState: 'DAILY', ei: 'NO', np: 'NO', hi: 'NO', basisNote: '모의 운영 — 근로계약서 확인' });
  check(r.status === 200, '고용 기간: 현장모의 · 일당 150,000 · 일용근로소득세 뗌 · 보험 안 함');
  for (const w of DAILY) {
    r = await post(D, { action: 'work.add', payeeId: P, workDate: w.date, project: '현장모의', quantity: 1, dayRate: w.rate, items: w.items });
    check(r.status === 200, `근무 ${w.date} 일당 ${won(w.rate)}${w.items.length ? ' + 식대 10,000(비과세)' : ''}`, JSON.stringify(r.json));
  }
  const { data: works } = await db.from('payroll_daily_work').select('id, version').eq('payee_id', P);
  for (const w of works ?? []) await post(D, { action: 'work.status', id: w.id, expectedVersion: w.version, status: 'CONFIRMED' });
  const dmade = await post(D, { action: 'run.create', month: YM, payDate: LAST });
  const DRUN = dmade.json.id as string;
  const drun = async () => (await db.from('payroll_runs').select('status, version, current_generation_id').eq('id', DRUN).single()).data!;
  let dr = await drun();
  r = await post(D, { action: 'run.calculate', id: DRUN, expectedVersion: dr.version });
  dr = await drun();
  const { data: ds } = await db.from('payroll_daily_statements').select('state, blockers, gross_total, net_total').eq('generation_id', dr.current_generation_id).eq('payee_id', P).maybeSingle();
  log.push(`일용 결과: ${JSON.stringify(ds)}`);
  // 기대: 150,000·150,000(세금 0) · 180,000(810원 → 1,000원 미만 안 뗌) · 200,000(1,350 · 지방 130) · 250,000(2,700 · 지방 270) + 식대 10,000
  check(ds?.state === 'OK' && Number(ds.gross_total) === 940000 && Number(ds.net_total) === 940000 - 4050 - 400, `일용 지급 940,000 − 소득세 4,050 − 지방소득세 400 = ${won(935550)}`, `프로그램: ${ds?.state} ${ds?.gross_total} → ${ds?.net_total}`);
  r = await post(D, { action: 'run.review', id: DRUN, expectedVersion: dr.version });
  dr = await drun();
  r = await post(D, { action: 'run.finalize', id: DRUN, expectedVersion: dr.version });
  check((await drun()).status === 'FINALIZED', '일용 대장 검토 → 확정', JSON.stringify(r.json));
  await open(p, `/admin/payroll/daily?v=runs&m=${YM}`);
  await shot(p, 's8-daily');

  // ════ 9. 인건비 현황 ════
  step('9. 인건비 현황');
  const labor = await open(p, `/admin/payroll/labor-cost?y=${Y}`);
  const total = sumPay(EXPECT.A) + sumPay(EXPECT.B);
  check(labor.includes((total + 940000).toLocaleString('ko-KR')) && labor.includes('일용직(소속 없음)'), `인건비 현황(${Y}년)에 ${YM} 지급 합계 = 정규 ${won(total)} + 일용직 ${won(940000)} = ${won(total + 940000)}, 일용직은 「일용직(소속 없음)」 묶음`);
  await shot(p, 's9-labor');
  check(errors.length === 0, '화면 오류 없음', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  // 정리: 넣은 설정은 거두고, 계정은 끈다 (지울 수 없는 기록 — 확정 대장 · 휴가 · 출퇴근 — 은 2090년대 검사 달에 남는다)
  if (ruleId) await db.from('work_rules').update({ active: false }).eq('id', ruleId);
  for (const [id, v] of policyBefore) await db.from('payroll_policy_versions').update({ in_use: v }).eq('id', id);
  if (refId) await db.from('payroll_reference_versions').update({ state: 'WITHDRAWN' }).eq('id', refId);
  if (tempRefs.length) await db.from('payroll_reference_versions').update({ state: 'WITHDRAWN' }).in('id', tempRefs);
  if (settingId) await db.from('payroll_company_setting_versions').update({ status: 'withdrawn' }).eq('id', settingId);
  for (const id of closeIds) await db.from('attendance_closes').update({ state: 'REOPENED', reopened_by: ADM.id, reopened_at: new Date().toISOString(), reopen_reason: '모의 운영 검사 끝' }).eq('id', id).eq('state', 'CLOSED');
  await withdrawPay();
  if (noticeId) await db.from('notices').update({ status: 'archived' }).eq('id', noticeId);
  if (payeeIds.length) {
    await db.from('payroll_payee_engagements').update({ active: false }).in('payee_id', payeeIds);
    await db.from('payroll_payees').update({ active: false }).in('id', payeeIds);
  }
  await db.from('console_pins').delete().eq('employee_id', ADM.id);
  for (const id of [A.id, B.id]) await db.from('profiles').update({ role: 'employee', active: false }).eq('id', id);
  await db.from('profiles').update({ active: false, can_view_payroll: false }).eq('id', ADM.id);
  for (const id of [ADM.id, A.id, B.id]) {
    await db.from('user_passkeys').update({ revoked_at: new Date().toISOString() }).eq('employee_id', id).is('revoked_at', null).gte('created_at', STARTED);
    await db.from('invites').update({ revoked_at: new Date().toISOString() }).eq('employee_id', id).is('used_at', null).is('revoked_at', null);
  }
}
console.log(`\n검사 달 ${YM} · ${fails === 0 ? '전부 통과' : `실패 ${fails}건`}`);
if (process.env.SCENARIO_LOG) (await import('node:fs')).writeFileSync(process.env.SCENARIO_LOG, `검사 달 ${YM}\n${log.join('\n')}\n`, 'utf8');
process.exit(fails === 0 ? 0 : 1);
