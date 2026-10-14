// 업무 메시지함 · 연차 사용 촉진 · 이상 근태 「확인함」 · 마감 다시 열기 확인 검사 (2026-10-14, DB 묶음 5)
//   npx tsx scripts/e2e-batch5.mts [사진 폴더]   (앱이 localhost:4123에 켜져 있어야 한다)
//   ADM = e2e-audit (관리자) · A = e2e-audit2 (직원) · B = e2e-audit3 (직원, 다시 열기 확인 때만 잠깐 관리자)
// ★ 검사 계정이 보낸 메시지 · 만든 촉진은 검사 계정끼리만 오간다(is_test). 실제 직원 · 관리자에게 가지 않는지도 여기서 본다.
// 메시지 · 촉진은 지울 수 없는 표라 검사 줄이 남는다(is_test라 실제 화면에는 보이지 않는다). 지급 건은 거두고, 마감은 다시 열고, 계정은 끈다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createPassword } from './lib/e2e-password.ts';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const BASE = process.env.BASE ?? 'http://localhost:4123';
const SHOTS = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const practice = process.env.OPERATION_MODE !== 'live';
const who = async (no: string) => (await db.from('profiles').select('id, name').eq('employee_no', no).single()).data!;
const [ADM, A, B] = await Promise.all([who('e2e-audit'), who('e2e-audit2'), who('e2e-audit3')]);
const { data: everyone } = await db.from('profiles').select('id, employee_no');
const testIds = new Set((everyone ?? []).filter((p) => (p.employee_no as string | null)?.startsWith('e2e-')).map((p) => p.id as string));
const TAG = randomBytes(3).toString('hex');
const MARK = `e2e-묶음5 ${TAG}`;
let fails = 0;
const check = (ok: boolean, what: string, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fails++;
};
const day = (n: number) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const recipientsOf = async (messageId: string) => ((await db.from('work_message_recipients').select('employee_id, read_at').eq('message_id', messageId)).data ?? []) as { employee_id: string; read_at: string | null }[];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
let closeId: string | null = null;
try {
  await db.from('profiles').update({ active: true, role: 'admin', locale: 'ko' }).eq('id', ADM.id);
  await db.from('profiles').update({ active: true, role: 'employee', locale: 'ko' }).in('id', [A.id, B.id]);
  const { data: live } = await db.from('notices').select('id, version').eq('status', 'published');
  const login = async (id: string): Promise<Page> => {
    for (const n of live ?? []) await db.from('notice_reads').upsert({ notice_id: n.id, employee_id: id, version: n.version, shown_locale: 'ko' }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
    const token = randomBytes(32).toString('base64url');
    await db.from('invites').insert({ employee_id: id, token_hash: createHash('sha256').update(token).digest('hex'), issued_via: 'admin', expires_at: new Date(Date.now() + 3600e3).toISOString() });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${BASE}/register?token=${token}`);
    await createPassword(p);
    return p;
  };
  const post = (p: Page, url: string, body: unknown) => p.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, [url, body] as const);
  const open = async (p: Page, url: string) => {
    await p.goto(`${BASE}${url}`);
    await p.waitForLoadState('networkidle');
    return p.locator('body').innerText();
  };
  const shot = async (p: Page, name: string) => {
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  };
  const pAdm = await login(ADM.id);
  const pA = await login(A.id);
  const pB = await login(B.id);

  // ══ 1. 업무 메시지함 ══
  const sent = await post(pAdm, '/api/messages', { action: 'send', to: 'people', employeeIds: [A.id, B.id], title: `${MARK} 통지`, body: '검사용 통지입니다.', needsReply: true });
  const msgId = sent.json.id as string;
  check(sent.status === 200 && sent.json.recipients === 2, '관리자가 두 명에게 통지를 보낸다', JSON.stringify(sent.json));
  const all = await post(pAdm, '/api/messages', { action: 'send', to: 'all', title: `${MARK} 전체`, body: '검사용 전체 통지', needsReply: false });
  const allTo = all.status === 200 ? await recipientsOf(all.json.id as string) : [];
  check(all.status === 200 && allTo.length > 0 && allTo.every((r) => testIds.has(r.employee_id)), '검사 계정의 「전 직원」 통지는 실제 직원에게 가지 않는다', `${allTo.length}명`);
  check((await post(pA, '/api/messages', { action: 'send', to: 'people', employeeIds: [B.id], title: 'x', body: 'x' })).status === 403, '직원은 통지를 보낼 수 없다');
  check((await post(pAdm, '/api/messages', { action: 'send', to: 'people', employeeIds: [A.id], title: '', body: 'x' })).status === 400, '제목이 비면 거부');
  const inboxA = await open(pA, '/punch/messages');
  check(inboxA.includes(`${MARK} 통지`) && inboxA.includes('안 읽음'), '직원 받은 메시지에 통지가 안 읽음으로 보인다');
  await shot(pA, 'b5-1-inbox');
  const threadA0 = await open(pA, `/punch/messages/${msgId}`);
  const r1 = await recipientsOf(msgId);
  check(threadA0.includes('검사용 통지입니다.') && !!r1.find((r) => r.employee_id === A.id)?.read_at && !r1.find((r) => r.employee_id === B.id)?.read_at, '열면 그 사람만 읽음으로 기록된다');
  check(!threadA0.includes(B.name), '직원에게는 다른 받는 사람이 보이지 않는다');
  await pA.locator('textarea').first().fill(`A의 회신 ${TAG}`);
  await pA.getByRole('button', { name: '회신 보내기' }).click();
  await pA.getByText(`A의 회신 ${TAG}`).first().waitFor({ timeout: 20000 });
  check(true, '직원이 화면에서 회신한다');
  check((await post(pB, '/api/messages', { action: 'reply', id: msgId, body: `B의 회신 ${TAG}` })).status === 200, '다른 받는 사람도 회신한다');
  const threadA = await open(pA, `/punch/messages/${msgId}`);
  check(threadA.includes(`A의 회신 ${TAG}`) && !threadA.includes(`B의 회신 ${TAG}`), '여러 명에게 간 통지에서 다른 직원의 회신은 보이지 않는다');
  const threadAdm = await open(pAdm, `/admin/messages/${msgId}`);
  check(threadAdm.includes(`A의 회신 ${TAG}`) && threadAdm.includes(`B의 회신 ${TAG}`) && threadAdm.includes('읽음 2명 / 전체 2명'), '관리자는 회신 전부와 읽음 현황을 본다');
  await shot(pAdm, 'b5-2-thread-admin');
  const ans = await post(pAdm, '/api/messages', { action: 'answer', id: msgId, employeeId: A.id, body: `A에게만 답 ${TAG}` });
  const ansTo = ans.status === 200 ? await recipientsOf(ans.json.id as string) : [];
  check(ans.status === 200 && ansTo.length === 1 && ansTo[0].employee_id === A.id, '관리자의 답은 그 직원 한 명에게만 간다');
  const peek = await open(pB, `/punch/messages/${ans.json.id}`);
  check(!peek.includes(`A에게만 답 ${TAG}`) && (await post(pB, '/api/messages', { action: 'reply', id: ans.json.id, body: 'x' })).status === 404, '다른 직원은 그 답을 열지도 회신하지도 못한다');
  const inq = await post(pA, '/api/messages', { action: 'inquiry', title: `${MARK} 문의`, body: `문의 내용 ${TAG}` });
  const inqTo = inq.status === 200 ? await recipientsOf(inq.json.id as string) : [];
  check(inq.status === 200 && inqTo.length > 0 && inqTo.every((r) => testIds.has(r.employee_id)) && inqTo.some((r) => r.employee_id === ADM.id), '검사 계정의 문의는 검사 관리자에게만 간다(실제 관리자에게 가지 않는다)', `${inqTo.length}명`);
  const admIn = await open(pAdm, '/admin/messages?box=in');
  check(admIn.includes(`${MARK} 문의`), '관리자 「받은 문의」에 보인다');
  check(!(await open(pB, `/punch/messages/${inq.json.id}`)).includes(`문의 내용 ${TAG}`), '다른 직원은 남의 문의를 열 수 없다');
  const admSent = await open(pAdm, '/admin/messages');
  check(admSent.includes(`${MARK} 통지`) && admSent.includes('읽음'), '관리자 「보낸 통지」에 읽음 수가 보인다');
  await shot(pAdm, 'b5-3-admin-sent');
  const { data: flag } = await db.from('work_messages').select('is_test').in('id', [msgId, all.json.id, ans.json.id, inq.json.id]);
  check((flag ?? []).length === 4 && (flag ?? []).every((m) => m.is_test === true), '검사 메시지는 전부 검사 표시로 저장된다');
  const { error: edit } = await db.from('work_messages').update({ body: '바꿈' }).eq('id', msgId);
  const { error: del } = await db.from('work_messages').delete().eq('id', msgId);
  check(!!edit && !!del, '보낸 메시지는 DB에서도 고치거나 지울 수 없다');

  // ══ 2. 연차 사용 촉진 ══
  const grant = await post(pAdm, '/api/admin/leave/ledger', { action: 'manual', employeeId: A.id, kind: 'manual', days: 2, usableFrom: day(0), usableTo: '', note: MARK });
  check(grant.status === 200, '검사 직원에게 연차 2일 직접 지급', JSON.stringify(grant.json));
  const made = await post(pAdm, '/api/admin/leave/promotion', { action: 'create', title: `${MARK} 촉진`, basisOn: day(0), planDueOn: day(14), noticeBody: `남은 연차 계획을 내 주세요 ${TAG}`, policyNote: '' });
  const campId = made.json.id as string;
  const targets = async () => ((await db.from('leave_promotion_targets').select('id, employee_id, state, remaining_minutes, plan, plan_version, plan_history, message_id').eq('campaign_id', campId)).data ?? []) as { id: string; employee_id: string; state: string; remaining_minutes: number; plan: { dates: string[] } | null; plan_version: number; plan_history: unknown[]; message_id: string | null }[];
  let ts = await targets();
  const tA = ts.find((x) => x.employee_id === A.id);
  const { data: camp0 } = await db.from('leave_promotion_campaigns').select('is_test, state').eq('id', campId).single();
  check(made.status === 200 && !!tA && tA.remaining_minutes >= 960 && ts.every((x) => testIds.has(x.employee_id)) && camp0?.is_test === true, '촉진을 만들면 연차가 남은 검사 직원만 대상이 된다(실제 직원 제외)', `${ts.length}명`);
  if (!tA || !ts.every((x) => testIds.has(x.employee_id))) throw new Error('대상이 검사 계정만이 아니다 — 안내를 보내지 않고 멈춘다');
  check((await post(pAdm, '/api/admin/leave/promotion', { action: 'exclude', campaignId: campId, targetId: tA.id, reason: '' })).status === 400, '사유 없이 대상에서 뺄 수 없다');
  for (const x of ts.filter((v) => v.id !== tA.id)) await post(pAdm, '/api/admin/leave/promotion', { action: 'exclude', campaignId: campId, targetId: x.id, reason: '검사에서 제외' });
  check((await post(pAdm, '/api/admin/leave/promotion', { action: 'exclude', campaignId: campId, targetId: tA.id, reason: '검사 제외' })).status === 200 && (await post(pAdm, '/api/admin/leave/promotion', { action: 'include', campaignId: campId, targetId: tA.id })).status === 200, '대상을 뺐다가 다시 넣는다');
  check((await post(pA, `/api/leave/promotion/${tA.id}`, { dates: [day(3)], note: '' })).status === 404 && (await targets()).find((x) => x.id === tA.id)?.plan == null, '안내를 보내기 전에는 계획을 낼 수 없다(없는 것으로 보인다)');
  const board = await open(pAdm, `/admin/leave/promotion/${campId}`);
  check(board.includes(`${MARK} 촉진`) && board.includes(A.name) && board.includes('안내 보내기 (1명)') && board.includes('법적 촉진 완료 여부는 프로그램이 판단하지 않습니다'), '촉진 화면에 대상 · 보내기 · 법적 안내가 보인다');
  await pAdm.getByRole('button', { name: '안내 보내기 (1명)' }).click();
  await pAdm.getByRole('button', { name: '보내기', exact: true }).click();
  await pAdm.getByText('1명에게 보냈습니다.').waitFor({ timeout: 30000 });
  ts = await targets();
  const sentA = ts.find((x) => x.id === tA.id)!;
  const promoTo = sentA.message_id ? await recipientsOf(sentA.message_id) : [];
  check(sentA.state === 'NOTIFIED' && promoTo.length === 1 && promoTo[0].employee_id === A.id && ts.filter((x) => x.state === 'NOTIFIED').length === 1, '안내는 대상 한 명에게만 업무 메시지로 간다');
  const again = await post(pAdm, '/api/admin/leave/promotion', { action: 'send', campaignId: campId });
  check(again.status === 200 && again.json.sent === 0, '다시 보내도 두 번 가지 않는다', JSON.stringify(again.json));
  const { error: lock } = await db.from('leave_promotion_campaigns').update({ notice_body: '바꿈' }).eq('id', campId);
  check(!!lock, '보낸 뒤에는 안내문을 DB에서도 바꿀 수 없다');
  const leaveA = await open(pA, '/punch/leave');
  check(leaveA.includes('연차 사용 계획을 내 주세요') && leaveA.includes(`${MARK} 촉진`), '직원 휴가 화면에 계획 제출 안내가 뜬다');
  const inboxPromo = await open(pA, '/punch/messages');
  check(inboxPromo.includes(`${MARK} 촉진`), '직원 받은 메시지에도 안내가 있다');
  const planPage = await open(pA, `/punch/leave/promotion/${tA.id}`);
  check(planPage.includes(`남은 연차 계획을 내 주세요 ${TAG}`) && planPage.includes('계획 제출 전'), '직원이 안내와 계획 화면을 연다');
  await pA.locator('input[type="date"]').first().fill(day(5));
  await pA.getByRole('button', { name: '계획 제출', exact: true }).click();
  await pA.getByText('제출했습니다.').waitFor({ timeout: 20000 });
  await shot(pA, 'b5-4-plan');
  ts = await targets();
  check(ts.find((x) => x.id === tA.id)?.state === 'PLAN_SUBMITTED' && ts.find((x) => x.id === tA.id)?.plan?.dates[0] === day(5), '화면에서 계획을 내면 저장된다');
  const { count: leaves } = await db.from('leave_requests').select('id', { count: 'exact', head: true }).eq('employee_id', A.id).eq('start_date', day(5)).in('status', ['pending', 'approved']);
  check((leaves ?? 0) === 0, '계획을 내도 휴가가 신청되지는 않는다');
  check((await post(pA, `/api/leave/promotion/${tA.id}`, { dates: [day(-3)], note: '' })).status === 400, '기준일보다 앞선 날짜는 거부');
  check((await post(pB, `/api/leave/promotion/${tA.id}`, { dates: [day(6)], note: '' })).status >= 400 && !(await open(pB, `/punch/leave/promotion/${tA.id}`)).includes(`남은 연차 계획을 내 주세요 ${TAG}`), '다른 직원은 남의 계획을 내지도 열지도 못한다');
  check((await post(pA, `/api/leave/promotion/${tA.id}`, { dates: [day(6), day(7)], note: '고침' })).status === 200, '계획을 고쳐 낸다');
  ts = await targets();
  const t2 = ts.find((x) => x.id === tA.id)!;
  check(t2.plan_version === 2 && t2.plan?.dates.length === 2 && Array.isArray(t2.plan_history) && t2.plan_history.length === 1, '고치기 전 계획이 이력에 남는다', `v${t2.plan_version}`);
  const board2 = await open(pAdm, `/admin/leave/promotion/${campId}`);
  check(board2.includes(day(6)) && board2.includes('2번째 제출') && board2.includes('계획 제출'), '관리자 화면에 계획과 읽음이 보인다');
  await shot(pAdm, 'b5-5-promotion-board');
  check((await post(pAdm, '/api/admin/leave/promotion', { action: 'decide', campaignId: campId, targetId: tA.id, decision: 'EXCEPTION', note: '' })).status === 400, '따로 처리는 사유가 있어야 한다');
  check((await post(pAdm, '/api/admin/leave/promotion', { action: 'decide', campaignId: campId, targetId: tA.id, decision: 'CONFIRMED' })).status === 200 && (await targets()).find((x) => x.id === tA.id)?.state === 'CONFIRMED', '관리자가 확인으로 처리한다');
  check((await post(pA, `/api/leave/promotion/${tA.id}`, { dates: [day(8)], note: '' })).status === 409, '확인된 뒤에는 계획을 고칠 수 없다');
  check((await post(pAdm, '/api/admin/leave/promotion', { action: 'close', campaignId: campId })).status === 200 && (await post(pAdm, '/api/admin/leave/promotion', { action: 'decide', campaignId: campId, targetId: tA.id, decision: 'CONFIRMED' })).status === 409, '닫은 뒤에는 처리할 수 없다');
  const list = await open(pAdm, '/admin/leave/promotion');
  check(list.includes(`${MARK} 촉진`) && list.includes('닫힘'), '촉진 목록에 닫힘으로 보인다');
  check((await post(pA, '/api/admin/leave/promotion', { action: 'create', title: 'x', basisOn: day(0), planDueOn: day(1), noticeBody: 'x' })).status === 403, '직원은 촉진을 만들 수 없다');

  // ══ 3. 이상 근태 「확인함」 ══
  const D = `20${70 + Math.floor(Math.random() * 20)}-03-0${1 + Math.floor(Math.random() * 9)}`;
  const reviews = async () => ((await db.from('attendance_anomaly_reviews').select('active, is_test, reviewed_by').eq('employee_id', A.id).eq('work_date', D)).data ?? []);
  const rv = await post(pAdm, '/api/admin/anomalies', { action: 'review', employeeId: A.id, workDate: D, types: ['MISSING_IN'], note: MARK });
  const rows1 = await reviews();
  const on1 = rows1.filter((r) => r.active); // 같은 날짜로 돌린 지난 검사의 꺼진 줄이 남아 있을 수 있다
  check(rv.status === 200 && on1.length === 1 && on1[0].reviewed_by === ADM.id && on1[0].is_test === practice, '이상 근태를 「확인함」으로 표시한다', JSON.stringify(rv.json));
  const rv2 = await post(pAdm, '/api/admin/anomalies', { action: 'review', employeeId: A.id, workDate: D, types: [], note: null });
  check(rv2.status < 500 && (await reviews()).filter((r) => r.active).length === 1, '두 번 표시해도 한 줄만 켜져 있다', String(rv2.status));
  const un = await post(pAdm, '/api/admin/anomalies', { action: 'unreview', employeeId: A.id, workDate: D });
  check(un.status === 200 && (await reviews()).every((r) => !r.active), '표시를 거두면 꺼진다(줄은 남는다)');
  check((await post(pA, '/api/admin/anomalies', { action: 'review', employeeId: A.id, workDate: D })).status === 403, '직원은 표시할 수 없다');
  check((await open(pAdm, '/admin/anomalies')).includes('이상자 관리'), '이상자 관리 화면이 열린다');
  // 이상자 통보 · 근태 마감 공지 (2026-10-14) — 업무 메시지로 간다. 직원은 보낼 수 없다
  const ym = D.slice(0, 7);
  check((await post(pA, '/api/admin/anomalies', { action: 'notify', month: ym })).status === 403, '직원은 이상자 통보를 보낼 수 없다');
  const nt = await post(pAdm, '/api/admin/anomalies', { action: 'notify', month: ym, employeeIds: [A.id] });
  check(nt.status === 200 && typeof nt.json.sent === 'number', '관리자는 이상자 통보를 보낸다', JSON.stringify(nt.json));
  const cm = '2001-01'; // 마감 화면은 지난 달만 열린다 — 먼 옛날 달로 시험한다
  check((await post(pA, '/api/admin/closing', { action: 'notice', month: cm, due: `${cm}-28` })).status === 403, '직원은 마감 공지를 보낼 수 없다');
  const cn = await post(pAdm, '/api/admin/closing', { action: 'notice', month: cm, due: `${cm}-28` });
  const { data: cnMsg } = await db.from('work_messages').select('id, is_test, related, title').eq('related->>type', 'closing').eq('related->>id', cm).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: cnTo } = cnMsg ? await db.from('work_message_recipients').select('employee_id').eq('message_id', cnMsg.id) : { data: [] };
  check(cn.status === 200 && cnMsg?.is_test === true && (cnTo ?? []).every((r) => testIds.has(r.employee_id as string)) && (cnTo ?? []).some((r) => r.employee_id === A.id), '마감 공지 → 업무 메시지(검사 계정끼리만), 직원이 받는다', JSON.stringify(cn.json));
  check((await open(pAdm, `/admin/closing?m=${cm}`)).includes('공지함'), '마감 화면에 「공지함 날짜 · 몇 명」이 보인다');

  // ══ 4. 마감 다시 열기 — 두 번째 관리자 확인 ══
  await db.from('profiles').update({ role: 'admin' }).eq('id', B.id); // 다른 관리자가 있는 상태
  // 먼 옛날의 무작위 달 — 마감 기록은 지울 수 없어서 예전 검사가 쓴 달과 겹치면 다른 달로 다시 고른다
  let y = 0, m = '', next = '';
  const tryClose = () => {
    y = 1900 + Math.floor(Math.random() * 95);
    m = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    next = m === '12' ? `${y + 1}-01-01` : `${y}-${String(Number(m) + 1).padStart(2, '0')}-01`;
    return db.from('attendance_closes').insert({ employee_id: A.id, period_from: `${y}-${m}-01`, period_to: next, is_test: practice, input_hash: 'e2e', closed_by: ADM.id }).select('id').single();
  };
  let cl = await tryClose();
  for (let i = 0; i < 20 && cl.error?.code === '23505'; i++) cl = await tryClose();
  if (cl.error) throw new Error(`마감 준비: ${cl.error.message}`);
  closeId = cl.data.id as string;
  const stateOf = async () => (await db.from('attendance_closes').select('state, reopened_by, reopen_reason').eq('id', closeId!).single()).data!;
  const reqs = async () => ((await db.from('attendance_reopen_requests').select('id, status').eq('close_id', closeId!).order('created_at')).data ?? []) as { id: string; status: string }[];
  const ask = await post(pAdm, '/api/admin/closing', { action: 'reopen', id: closeId, reason: `${MARK} 첫 요청` });
  check(ask.status === 200 && ask.json.reopen === 'requested' && (await stateOf()).state === 'CLOSED', '다른 관리자가 있으면 다시 열기는 요청으로 남고, 아직 열리지 않는다', JSON.stringify(ask.json));
  check((await post(pAdm, '/api/admin/closing', { action: 'reopen', id: closeId, reason: `${MARK} 또` })).status === 409, '대기 중인 요청이 있으면 또 요청할 수 없다');
  let rq = (await reqs()).at(-1)!;
  const self = await post(pAdm, '/api/admin/closing', { action: 'reopenDecide', requestId: rq.id, decision: 'approved' });
  check(self.status === 403 && (await stateOf()).state === 'CLOSED', '요청한 본인은 확인할 수 없다', JSON.stringify(self.json));
  await pB.goto(`${BASE}/admin/messages`); // 역할이 바뀐 뒤 새로 읽는다
  check((await post(pB, '/api/admin/closing', { action: 'reopenDecide', requestId: rq.id, decision: 'cancelled' })).status === 403, '취소는 요청한 본인만');
  check((await post(pB, '/api/admin/closing', { action: 'reopenDecide', requestId: rq.id, decision: 'rejected' })).status === 200 && (await stateOf()).state === 'CLOSED', '다른 관리자가 거절하면 열리지 않는다');
  await post(pAdm, '/api/admin/closing', { action: 'reopen', id: closeId, reason: `${MARK} 둘째 요청` });
  rq = (await reqs()).at(-1)!;
  check((await post(pAdm, '/api/admin/closing', { action: 'reopenDecide', requestId: rq.id, decision: 'cancelled' })).status === 200 && (await stateOf()).state === 'CLOSED', '요청한 본인이 취소한다');
  await post(pAdm, '/api/admin/closing', { action: 'reopen', id: closeId, reason: `${MARK} 셋째 요청` });
  rq = (await reqs()).at(-1)!;
  const ok = await post(pB, '/api/admin/closing', { action: 'reopenDecide', requestId: rq.id, decision: 'approved' });
  const st = await stateOf();
  check(ok.status === 200 && st.state === 'REOPENED' && st.reopened_by === B.id && st.reopen_reason === `${MARK} 셋째 요청`, '다른 관리자가 확인하면 요청의 사유로 열린다', JSON.stringify(ok.json));
  check((await post(pB, '/api/admin/closing', { action: 'reopenDecide', requestId: rq.id, decision: 'approved' })).status === 409, '처리한 요청은 다시 처리할 수 없다');
  check((await reqs()).map((r) => r.status).join(',') === 'rejected,cancelled,approved', '요청 세 건의 결과가 기록으로 남는다', (await reqs()).map((r) => r.status).join(','));
  check((await open(pAdm, '/admin/closing')).includes('마감'), '마감 화면이 열린다');
  check(errors.length === 0, '화면 오류 없음', errors.join(' | '));
} finally {
  await browser.close();
  if (closeId) await db.from('attendance_closes').update({ state: 'REOPENED', reopened_by: ADM.id, reopened_at: new Date().toISOString(), reopen_reason: 'e2e 검사 끝' }).eq('id', closeId).eq('state', 'CLOSED');
  const { data: left } = await db.from('leave_grant_lots').select('id, employee_id, quantity_minutes, granted_on').eq('note', MARK).eq('state', 'APPROVED');
  for (const l of left ?? []) {
    await db.from('leave_ledger').insert({ employee_id: l.employee_id, type_code: 'annual', lot_id: l.id, event: 'adjust', minutes: -l.quantity_minutes, effective_on: l.granted_on, dedupe_key: `withdraw:${l.id}`, reason: 'withdrawn' });
    await db.from('leave_grant_lots').update({ state: 'WITHDRAWN' }).eq('id', l.id);
  }
  await db.from('profiles').update({ role: 'employee', active: false }).in('id', [A.id, B.id]);
}
console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
