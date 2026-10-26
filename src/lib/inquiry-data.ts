// 문의하기 — 저장 · 목록 · 답변 (DB 묶음 37, 2026-10-26). 서버 전용.
// 보낸 사람이 직원이면 관리자들(ADMIN)에게, 관리자면 시스템관리자(SYSTEM)에게 간다. 시스템관리자는 둘 다 본다.
// 답한 뒤에는 고치지 못한다(DB도 막는다). 지우지 않는다.
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { canAnswer, OPEN_LIMIT, routeFor, type InquiryInput, type InquirySpace, type ToRole } from '@/lib/inquiry';
import { isSystemAdminNo } from '@/lib/system-admin';
import { createAdminClient } from '@/lib/supabase/admin';

const db = () => createAdminClient();
type Row = Record<string, unknown>;

export type Inquiry = {
  id: string; employeeId: string; name: string; toRole: ToRole; space: InquirySpace; topic: string | null; title: string; body: string;
  state: 'OPEN' | 'ANSWERED'; answer: string | null; answeredByName: string | null; answeredAt: string | null; askerSeenAt: string | null; createdAt: string;
};

export const isSystem = (me: Pick<Me, 'employeeNo'>): boolean => isSystemAdminNo(me.employeeNo);
const who = (me: Me) => ({ id: me.id, role: me.role, isSystem: isSystem(me) });

async function names(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const { data } = await db().from('profiles').select('id, name').in('id', uniq);
  return new Map((data ?? []).map((p) => [p.id as string, p.name as string]));
}

async function toInquiries(rows: Row[]): Promise<Inquiry[]> {
  const n = await names(rows.flatMap((r) => [r.employee_id as string, r.answered_by as string]));
  return rows.map((r) => ({
    id: r.id as string, employeeId: r.employee_id as string, name: n.get(r.employee_id as string) ?? '', toRole: r.to_role as ToRole, space: r.space as InquirySpace,
    topic: (r.topic as string | null) ?? null, title: r.title as string, body: r.body as string, state: r.state as Inquiry['state'], answer: (r.answer as string | null) ?? null,
    answeredByName: r.answered_by ? (n.get(r.answered_by as string) ?? '') : null, answeredAt: (r.answered_at as string | null) ?? null, askerSeenAt: (r.asker_seen_at as string | null) ?? null, createdAt: r.created_at as string,
  }));
}

/** 보낸다. 같은 사람이 답을 못 받은 문의를 OPEN_LIMIT개 넘게 쌓지는 못한다 */
export async function createInquiry(args: { me: Me; input: InquiryInput; practice: boolean }): Promise<{ id: string; toRole: ToRole }> {
  const { count } = await db().from('inquiries').select('id', { count: 'exact', head: true }).eq('employee_id', args.me.id).eq('state', 'OPEN').eq('is_test', args.practice);
  if ((count ?? 0) >= OPEN_LIMIT) throw new ApiError(429, 'too_many_open');
  const toRole = routeFor(args.me.role);
  const { data, error } = await db().from('inquiries').insert({ employee_id: args.me.id, to_role: toRole, space: args.input.space, topic: args.input.topic, title: args.input.title, body: args.input.body, is_test: args.practice }).select('id').single();
  if (error || !data) throw new Error(`inquiry.insert: ${error?.code ?? 'unknown'}`);
  return { id: data.id as string, toRole };
}

/** 내가 보낸 문의 (새것부터) */
export async function loadMine(employeeId: string, practice: boolean): Promise<Inquiry[]> {
  const { data, error } = await db().from('inquiries').select('*').eq('employee_id', employeeId).eq('is_test', practice).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(`inquiry.mine: ${error.code}`);
  return toInquiries((data ?? []) as Row[]);
}

/** 받은 문의 — 시스템관리자는 전부, 최고관리자는 직원이 보낸 것만. 다른 사람은 없다 */
export async function loadReceived(me: Me, practice: boolean): Promise<Inquiry[]> {
  const sys = isSystem(me);
  if (!sys && me.role !== 'admin') return [];
  let q = db().from('inquiries').select('*').eq('is_test', practice).neq('employee_id', me.id).order('created_at', { ascending: false }).limit(300);
  if (!sys) q = q.eq('to_role', 'ADMIN');
  const { data, error } = await q;
  if (error) throw new Error(`inquiry.received: ${error.code}`);
  return toInquiries((data ?? []) as Row[]);
}

/** 답한다. 이미 답했거나 답할 수 없는 사람이면 막는다. 보낸 사람의 id를 돌려준다(푸시용) */
export async function answerInquiry(args: { id: string; answer: string; me: Me }): Promise<{ employeeId: string }> {
  const { data: row } = await db().from('inquiries').select('id, employee_id, to_role, state').eq('id', args.id).maybeSingle();
  if (!row) throw new ApiError(404, 'not_found');
  if (!canAnswer(who(args.me), { toRole: row.to_role as ToRole, employeeId: row.employee_id as string })) throw new ApiError(403, 'forbidden');
  if (row.state !== 'OPEN') throw new ApiError(409, 'already_answered');
  const { data, error } = await db().from('inquiries').update({ state: 'ANSWERED', answer: args.answer, answered_by: args.me.id, answered_at: new Date().toISOString() }).eq('id', args.id).eq('state', 'OPEN').select('id');
  if (error) throw new Error(`inquiry.answer: ${error.code}`);
  if (!data?.length) throw new ApiError(409, 'already_answered'); // 방금 다른 관리자가 답함
  return { employeeId: row.employee_id as string };
}

/** 내 문의의 답을 열어 봤다고 남긴다 — 아이콘 숫자가 줄어든다 */
export async function markSeen(employeeId: string, practice: boolean): Promise<number> {
  const { data, error } = await db().from('inquiries').update({ asker_seen_at: new Date().toISOString() }).eq('employee_id', employeeId).eq('is_test', practice).eq('state', 'ANSWERED').is('asker_seen_at', null).select('id');
  if (error) throw new Error(`inquiry.seen: ${error.code}`);
  return data?.length ?? 0;
}

/** 위 띠 아이콘의 숫자 = 내가 아직 안 본 답 + (답할 수 있는 사람이면) 답 안 한 받은 문의 */
export async function inquiryBadge(me: Me, practice: boolean): Promise<{ unseenAnswers: number; waiting: number }> {
  const [{ count: unseen }, waiting] = await Promise.all([
    db().from('inquiries').select('id', { count: 'exact', head: true }).eq('employee_id', me.id).eq('is_test', practice).eq('state', 'ANSWERED').is('asker_seen_at', null),
    (async () => {
      const sys = isSystem(me);
      if (!sys && me.role !== 'admin') return 0;
      let q = db().from('inquiries').select('id', { count: 'exact', head: true }).eq('is_test', practice).eq('state', 'OPEN').neq('employee_id', me.id);
      if (!sys) q = q.eq('to_role', 'ADMIN');
      return (await q).count ?? 0;
    })(),
  ]);
  return { unseenAnswers: unseen ?? 0, waiting };
}

/** 화면에서 답 칸을 보일지 — 서버(answerInquiry)도 같은 규칙으로 다시 막는다 */
export const canAnswerFor = (me: Me, q: Pick<Inquiry, 'toRole' | 'employeeId'>): boolean => canAnswer(who(me), q);
