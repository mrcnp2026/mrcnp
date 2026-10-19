// 연차 사용 촉진 (PRD v1.3 37.3, L17). 서버 전용.
// 흐름: 촉진 만들기(대상 후보 = 기준일에 잔여가 남은 직원) → 뺄 사람 빼기 → 안내 보내기(업무 메시지) → 직원이 사용 계획 제출 → 관리자가 확인/예외 처리 → 닫기.
// ★ 프로그램은 「법적 촉진을 마쳤다」거나 「미사용 연차 수당을 주지 않아도 된다」고 정하지 않는다.
//   메시지를 보냈다 · 읽었다 · 계획을 냈다는 사실과 시각만 남긴다. 통지 방식 · 기간이 요건에 맞는지는 회사가 노무 확인을 받아 판단한다.
// ★ 통지 시기 · 기한을 프로그램이 계산해 주지 않는다. 관리자가 촉진마다 직접 정한다.
// ★ 대상은 휴가 원장을 시작한 직원뿐이다(승인된 지급 건이 있어야 잔여를 안다).
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { entriesFor, ledgerBalance } from '@/lib/leave-ledger';
import { loadEntries, loadLots } from '@/lib/leave-ledger-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSystem, isTestNo } from '@/lib/work-messages';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin'; // 시스템관리자는 목록에 보이지 않는다 (2026-10-18)

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const boom = (where: string, e: { code?: string } | null): never => {
  if (e?.code === '42501') throw new ApiError(409, 'promotion_locked');
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};

export type Campaign = { id: string; title: string; basisOn: string; planDueOn: string; noticeBody: string; state: 'DRAFT' | 'SENT' | 'CLOSED'; policyNote: string | null; createdBy: string; createdAt: string; sentAt: string | null; closedAt: string | null };
const toCampaign = (r: Row): Campaign => ({ id: r.id as string, title: r.title as string, basisOn: r.basis_on as string, planDueOn: r.plan_due_on as string, noticeBody: r.notice_body as string, state: r.state as Campaign['state'], policyNote: r.policy_note as string | null, createdBy: r.created_by as string, createdAt: r.created_at as string, sentAt: r.sent_at as string | null, closedAt: r.closed_at as string | null });
export type TargetState = 'CANDIDATE' | 'EXCLUDED' | 'NOTIFIED' | 'PLAN_SUBMITTED' | 'CONFIRMED' | 'EXCEPTION';
export type Plan = { dates: string[]; note: string | null };
export type Target = { id: string; campaignId: string; employeeId: string; remainingMinutes: number; state: TargetState; excludeReason: string | null; messageId: string | null; notifiedAt: string | null; plan: Plan | null; planVersion: number; planSubmittedAt: string | null; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null };
const toTarget = (r: Row): Target => ({ id: r.id as string, campaignId: r.campaign_id as string, employeeId: r.employee_id as string, remainingMinutes: r.remaining_minutes as number, state: r.state as TargetState, excludeReason: r.exclude_reason as string | null, messageId: r.message_id as string | null, notifiedAt: r.notified_at as string | null, plan: (r.plan as Plan | null) ?? null, planVersion: r.plan_version as number, planSubmittedAt: r.plan_submitted_at as string | null, decidedBy: r.decided_by as string | null, decidedAt: r.decided_at as string | null, decisionNote: r.decision_note as string | null });

export async function loadCampaigns(me: Me): Promise<Campaign[]> {
  const { data, error } = await db().from('leave_promotion_campaigns').select('*').eq('is_test', isTestNo(me.employeeNo)).order('created_at', { ascending: false }).limit(50);
  if (error) boom('loadCampaigns', error);
  return (data ?? []).map(toCampaign);
}
export async function loadCampaign(id: string): Promise<{ campaign: Campaign; targets: Target[] } | null> {
  const c = db();
  const { data } = await c.from('leave_promotion_campaigns').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  const { data: ts, error } = await c.from('leave_promotion_targets').select('*').eq('campaign_id', id);
  if (error) boom('loadCampaign', error);
  return { campaign: toCampaign(data), targets: (ts ?? []).map(toTarget) };
}

/** 촉진 만들기(초안). 대상 후보 = 기준일에 쓸 수 있는 연차가 남은 직원(켜져 있는 직원, 검사 전용 계정 제외) */
export async function createCampaign(args: { title: string; basisOn: string; planDueOn: string; noticeBody: string; policyNote: string | null; me: Me }): Promise<{ id: string; candidates: number }> {
  const c = db();
  const [lots, entries, { data: staff }] = await Promise.all([loadLots({ states: ['APPROVED'] }), loadEntries(), c.from('profiles').select('id, employee_no, active').or(NOT_SYSTEM_ADMIN)]);
  const live = entriesFor(entries, false);
  const test = isTestNo(args.me.employeeNo); // 검사 계정이 만든 촉진은 검사 계정만 대상으로 삼고, 실제 목록에 보이지 않는다
  const rows: { employee_id: string; remaining_minutes: number }[] = [];
  for (const p of staff ?? []) {
    if (!p.active || isTestNo(p.employee_no as string | null) !== test) continue;
    const mine = lots.filter((l) => l.employeeId === p.id);
    if (mine.length === 0) continue;
    const b = ledgerBalance(mine, live.filter((e) => e.employeeId === p.id), args.basisOn);
    if (b.remaining > 0) rows.push({ employee_id: p.id as string, remaining_minutes: b.remaining });
  }
  const { data, error } = await c.from('leave_promotion_campaigns').insert({ title: args.title, basis_on: args.basisOn, plan_due_on: args.planDueOn, notice_body: args.noticeBody, policy_note: args.policyNote, created_by: args.me.id, is_test: test }).select('id').single();
  if (error || !data) boom('createCampaign', error);
  if (rows.length > 0) {
    const t = await c.from('leave_promotion_targets').insert(rows.map((r) => ({ ...r, campaign_id: data!.id })));
    if (t.error) boom('createCampaign.targets', t.error);
  }
  return { id: data!.id as string, candidates: rows.length };
}

const must = async (id: string): Promise<{ campaign: Campaign; targets: Target[] }> => {
  const x = await loadCampaign(id);
  if (!x) throw new ApiError(404, 'not_found');
  return x;
};

/** 보내기 전: 대상에서 빼기(사유 필수) · 다시 넣기 */
export async function setTargetIncluded(args: { campaignId: string; targetId: string; include: boolean; reason: string | null }): Promise<void> {
  const { campaign, targets } = await must(args.campaignId);
  if (campaign.state !== 'DRAFT') throw new ApiError(409, 'promotion_locked');
  const t = targets.find((x) => x.id === args.targetId);
  if (!t) throw new ApiError(404, 'not_found');
  const { error } = await db().from('leave_promotion_targets').update(args.include ? { state: 'CANDIDATE', exclude_reason: null } : { state: 'EXCLUDED', exclude_reason: args.reason }).eq('id', t.id);
  if (error) boom('setTargetIncluded', error);
}

/**
 * 안내 보내기 — 후보마다 업무 메시지(답변 필요)를 보내고 「통지함」으로 바꾼다. 보낸 뒤에는 안내문을 고칠 수 없다(DB가 막는다).
 * 같은 대상에게 두 번 가지 않는다(메시지 열쇠가 대상마다 하나). 중간에 실패해도 다시 누르면 남은 사람에게만 간다.
 */
export async function sendCampaign(args: { campaignId: string; me: Me; hrefOf: (targetId: string) => string }): Promise<{ sent: number }> {
  const c = db();
  const { campaign, targets } = await must(args.campaignId);
  if (campaign.state === 'CLOSED') throw new ApiError(409, 'promotion_locked');
  const todo = targets.filter((t) => t.state === 'CANDIDATE');
  if (campaign.state === 'DRAFT' && todo.length === 0) throw new ApiError(409, 'promotion_no_targets');
  const now = new Date().toISOString();
  if (campaign.state === 'DRAFT') {
    const { error } = await c.from('leave_promotion_campaigns').update({ state: 'SENT', sent_by: args.me.id, sent_at: now }).eq('id', campaign.id).eq('state', 'DRAFT');
    if (error) boom('sendCampaign.state', error);
  }
  let sent = 0;
  for (const t of todo) {
    const messageId = await sendSystem({ dedupeKey: `promotion:${t.id}`, title: campaign.title, body: campaign.noticeBody, needsReply: true, employeeIds: [t.employeeId], senderId: args.me.id, isTest: isTestNo(args.me.employeeNo), related: { type: 'promotion', id: t.id, href: args.hrefOf(t.id) } });
    const { error } = await c.from('leave_promotion_targets').update({ state: 'NOTIFIED', message_id: messageId, notified_at: now }).eq('id', t.id).eq('state', 'CANDIDATE');
    if (error) boom('sendCampaign.target', error);
    sent++;
  }
  return { sent };
}

/** 관리자 처리 — 「확인」(계획대로 진행) 또는 「예외」(따로 처리해야 함). 사유를 남길 수 있다. 법적 판단을 대신하지 않는다 */
export async function decideTarget(args: { campaignId: string; targetId: string; decision: 'CONFIRMED' | 'EXCEPTION'; note: string | null; me: Me }): Promise<void> {
  const { campaign, targets } = await must(args.campaignId);
  if (campaign.state !== 'SENT') throw new ApiError(409, 'promotion_locked');
  const t = targets.find((x) => x.id === args.targetId);
  if (!t) throw new ApiError(404, 'not_found');
  if (t.state !== 'NOTIFIED' && t.state !== 'PLAN_SUBMITTED' && t.state !== 'CONFIRMED' && t.state !== 'EXCEPTION') throw new ApiError(409, 'promotion_wrong_state');
  if (args.decision === 'EXCEPTION' && !args.note) throw new ApiError(400, 'promotion_note_required');
  const { error } = await db().from('leave_promotion_targets').update({ state: args.decision, decided_by: args.me.id, decided_at: new Date().toISOString(), decision_note: args.note }).eq('id', t.id);
  if (error) boom('decideTarget', error);
}

export async function closeCampaign(args: { campaignId: string; me: Me }): Promise<void> {
  const { campaign } = await must(args.campaignId);
  if (campaign.state !== 'SENT') throw new ApiError(409, 'promotion_locked');
  const { error } = await db().from('leave_promotion_campaigns').update({ state: 'CLOSED', closed_by: args.me.id, closed_at: new Date().toISOString() }).eq('id', campaign.id);
  if (error) boom('closeCampaign', error);
}

// ── 직원 ──
/** 내 촉진 대상 한 건 (본인 것만). 보낸 촉진만 보인다 */
export async function loadMyTarget(targetId: string, employeeId: string): Promise<{ campaign: Campaign; target: Target } | null> {
  const { data } = await db().from('leave_promotion_targets').select('*').eq('id', targetId).eq('employee_id', employeeId).maybeSingle();
  if (!data) return null;
  const x = await loadCampaign(data.campaign_id as string);
  if (!x || x.campaign.state === 'DRAFT') return null;
  return { campaign: x.campaign, target: toTarget(data) };
}
/** 내가 계획을 내야 하는(통지받고 아직 처리되지 않은) 촉진 */
export async function loadMyOpenTargets(employeeId: string): Promise<{ id: string; title: string; planDueOn: string; state: TargetState }[]> {
  const c = db();
  const { data } = await c.from('leave_promotion_targets').select('id, campaign_id, state').eq('employee_id', employeeId).in('state', ['NOTIFIED', 'PLAN_SUBMITTED']);
  if (!data?.length) return [];
  const { data: cs } = await c.from('leave_promotion_campaigns').select('id, title, plan_due_on, state').in('id', data.map((t) => t.campaign_id as string)).eq('state', 'SENT');
  return data.flatMap((t) => {
    const k = (cs ?? []).find((x) => x.id === t.campaign_id);
    return k ? [{ id: t.id as string, title: k.title as string, planDueOn: k.plan_due_on as string, state: t.state as TargetState }] : [];
  });
}

/** 사용 계획 내기 · 고치기 — 통지받은 본인만, 촉진이 닫히기 전에. 고치면 앞 계획은 이력에 남는다. 계획을 낸다고 휴가가 신청되지는 않는다(휴가는 따로 신청한다) */
export async function submitPlan(args: { targetId: string; me: Me; dates: string[]; note: string | null }): Promise<void> {
  const c = db();
  const x = await loadMyTarget(args.targetId, args.me.id);
  if (!x) throw new ApiError(404, 'not_found');
  if (x.campaign.state !== 'SENT' || (x.target.state !== 'NOTIFIED' && x.target.state !== 'PLAN_SUBMITTED')) throw new ApiError(409, 'promotion_locked');
  const dates = [...new Set(args.dates)].sort();
  if (dates.length === 0 || dates.length > 60 || dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || d < x.campaign.basisOn)) throw new ApiError(400, 'promotion_plan_invalid');
  const { data: row } = await c.from('leave_promotion_targets').select('plan, plan_version, plan_submitted_at, plan_history').eq('id', x.target.id).single();
  const history = [...((row?.plan_history as unknown[]) ?? []), ...(row?.plan ? [{ version: row.plan_version, plan: row.plan, submittedAt: row.plan_submitted_at }] : [])];
  const { error } = await c.from('leave_promotion_targets').update({ state: 'PLAN_SUBMITTED', plan: { dates, note: args.note }, plan_version: x.target.planVersion + 1, plan_submitted_at: new Date().toISOString(), plan_history: history }).eq('id', x.target.id);
  if (error) boom('submitPlan', error);
}
