// 사내게시판(옛 업무 메시지함, PRD v1.3 37.4, L19) — 관리자가 직원에게 보내는 통지와 프로그램 알림. 서버 전용.
// ★ 2026-10-16 의뢰인(알림-8): 관리자만 게시한다. 직원 문의 · 회신(답글)은 없앴다 — 예전에 달린 회신은 읽기만 된다.
// ★ 볼 수 있는 사람: 받는 사람 본인, 보낸 사람, 관리자. 그 밖의 사람에게는 「없는 메시지」다.
// ★ 메시지는 고칠 수 없다(0038). 잘못 보냈으면 바로잡는 통지를 새로 보낸다. 받는 사람은 보낼 때 고정된다.
// ★ 외부 메신저 · 문자 · 메일로 보내지 않는다. 앱 안에서만 보인다.
// ★ 읽었다는 표시는 「열어 봤다」는 뜻일 뿐이다 — 동의나 법적 통지 완료를 뜻하지 않는다.
import 'server-only';
import { cleanRichHtml, safeRichHtml } from '@/lib/rich-text';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { expandGroups } from '@/lib/manager-rules';
import { createAdminClient } from '@/lib/supabase/admin';

const db = () => createAdminClient();
type Row = Record<string, unknown>;
const boom = (where: string, e: { code?: string } | null): never => {
  throw new Error(`${where}: ${e?.code ?? 'unknown'}`);
};
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max + 1) : '');

/** 검사 전용 계정(e2e-)인가 — 검사 계정이 보낸 것은 검사 계정끼리만 오가고, 실제 직원 · 관리자에게는 가지도 보이지도 않는다 */
export const isTestNo = (no: string | null | undefined): boolean => !!no?.startsWith('e2e-');

export type Audience = { all: true } | { groupIds: string[] } | { employeeIds: string[] };
export type Related = { type?: string; id?: string; href?: string };

/** 대상 → 받는 사람(켜져 있는 직원, 검사 전용 계정 제외, 보낸 사람 제외). 부서를 고르면 그 밑의 팀도 포함 */
async function resolveAudience(a: Audience, senderId: string | null, test: boolean): Promise<string[]> {
  const c = db();
  const [{ data: people }, { data: groups }] = await Promise.all([c.from('profiles').select('id, employee_no, group_id, active'), c.from('org_groups').select('id, parent_id')]);
  let list = (people ?? []).filter((p) => p.active && isTestNo(p.employee_no as string | null) === test);
  if ('groupIds' in a) {
    const g = expandGroups((groups ?? []).map((x) => ({ id: x.id as string, parentId: x.parent_id as string | null })), a.groupIds);
    list = list.filter((p) => p.group_id && g.has(p.group_id as string));
  } else if ('employeeIds' in a) {
    const ids = new Set(a.employeeIds);
    list = list.filter((p) => ids.has(p.id as string));
  }
  return list.map((p) => p.id as string).filter((id) => id !== senderId);
}

async function insertMessage(row: Row, recipients: string[]): Promise<string> {
  const c = db();
  const { data, error } = await c.from('work_messages').insert(row).select('id').single();
  if (error?.code === '42703' || error?.code === 'PGRST204') throw new ApiError(503, 'db_update_required');
  if (error || !data) boom('work_messages.insert', error);
  const r = await c.from('work_message_recipients').insert(recipients.map((id) => ({ message_id: data!.id, employee_id: id })));
  if (r.error) boom('work_message_recipients.insert', r.error);
  return data!.id as string;
}

/** 서식 있는 본문(bodyHtml, 2026-10-16)이 오면 걸러 쓰고 글자 본문은 거기서 뽑는다. 없으면 예전처럼 글자만 */
function richOrText(body: unknown, bodyHtml: unknown): { body: string; body_html: string | null } {
  if (typeof bodyHtml === 'string') {
    const r = cleanRichHtml(bodyHtml);
    if (r.empty || r.text.length > 4000) throw new ApiError(400, 'message_invalid');
    return { body: r.text || ' ', body_html: r.html };
  }
  const text = clean(body, 4000);
  if (text.length < 1 || text.length > 4000) throw new ApiError(400, 'message_invalid');
  return { body: text, body_html: null };
}

/** 관리자가 보내는 통지. 받는 사람이 한 명도 없으면 보내지 않는다 */
export async function sendNotice(args: { me: Me; title: unknown; body: unknown; bodyHtml?: unknown; needsReply: boolean; audience: Audience; related?: Related }): Promise<{ id: string; recipients: number }> {
  const title = clean(args.title, 120);
  const { body, body_html } = richOrText(args.body, args.bodyHtml);
  if (title.length < 1 || title.length > 120 || body.length < 1 || body.length > 4000) throw new ApiError(400, 'message_invalid');
  const test = isTestNo(args.me.employeeNo);
  const to = await resolveAudience(args.audience, args.me.id, test);
  if (to.length === 0) throw new ApiError(409, 'message_no_recipients');
  const id = await insertMessage({ kind: 'notice', needs_reply: args.needsReply, title, body, ...(body_html ? { body_html } : {}), related: args.related ?? {}, audience: args.audience, sender_id: args.me.id, is_test: test }, to);
  return { id, recipients: to.length };
}

/** 프로그램이 만드는 알림 — 같은 열쇠로는 한 번만 들어간다(다시 시도해도 중복되지 않는다). 이미 있으면 그 메시지 번호를 돌려준다 */
export async function sendSystem(args: { dedupeKey: string; title: string; body: string; needsReply?: boolean; employeeIds: string[]; related?: Related; senderId?: string | null; isTest?: boolean }): Promise<string | null> {
  if (args.employeeIds.length === 0) return null;
  const c = db();
  const { data, error } = await c.from('work_messages').insert({ kind: 'system', needs_reply: args.needsReply ?? false, title: args.title.slice(0, 120), body: args.body.slice(0, 4000), related: args.related ?? {}, audience: { employeeIds: args.employeeIds }, sender_id: args.senderId ?? null, dedupe_key: args.dedupeKey, is_test: args.isTest ?? false }).select('id').single();
  if (error?.code === '23505') return ((await c.from('work_messages').select('id').eq('dedupe_key', args.dedupeKey).maybeSingle()).data?.id as string | undefined) ?? null;
  if (error || !data) boom('sendSystem', error);
  const r = await c.from('work_message_recipients').insert(args.employeeIds.map((id) => ({ message_id: data!.id, employee_id: id })));
  if (r.error) boom('sendSystem.recipients', r.error);
  return data!.id as string;
}

export type MessageLine = { id: string; kind: 'notice' | 'inquiry' | 'system'; needsReply: boolean; title: string; senderId: string | null; createdAt: string; readAt: string | null; mine: boolean; replies: number; recipients: number; read: number; lastReplyAt: string | null };

async function decorate(rows: Row[], meId: string): Promise<MessageLine[]> {
  if (rows.length === 0) return [];
  const c = db();
  const ids = rows.map((m) => m.id as string);
  const [{ data: rec }, { data: rep }] = await Promise.all([
    c.from('work_message_recipients').select('message_id, employee_id, read_at').in('message_id', ids),
    c.from('work_message_replies').select('message_id, created_at').in('message_id', ids).order('created_at'),
  ]);
  return rows.map((m) => {
    const rs = (rec ?? []).filter((r) => r.message_id === m.id);
    const ps = (rep ?? []).filter((r) => r.message_id === m.id);
    return {
      id: m.id as string, kind: m.kind as MessageLine['kind'], needsReply: m.needs_reply as boolean, title: m.title as string, senderId: m.sender_id as string | null, createdAt: m.created_at as string,
      readAt: (rs.find((r) => r.employee_id === meId)?.read_at as string | null | undefined) ?? null, mine: m.sender_id === meId, replies: ps.length, recipients: rs.length, read: rs.filter((r) => r.read_at).length, lastReplyAt: (ps.at(-1)?.created_at as string | undefined) ?? null,
    };
  });
}

/** 내가 받은 메시지 (새 것부터) */
export async function loadInbox(me: Me, limit = 100): Promise<MessageLine[]> {
  const c = db();
  // 숨긴 글(0085, 2026-11-03)은 빼고 센다 — 받은 쪽에서 걸러야 숨긴 글이 개수를 차지하지 않는다
  const { data: mine, error } = await c.from('work_message_recipients').select('message_id, work_messages!inner(hidden_at)').eq('employee_id', me.id).is('work_messages.hidden_at', null).order('created_at', { ascending: false }).limit(limit);
  if (error) boom('loadInbox', error);
  const ids = (mine ?? []).map((r) => r.message_id as string);
  if (ids.length === 0) return [];
  const { data } = await c.from('work_messages').select('*').in('id', ids).order('created_at', { ascending: false });
  return decorate((data ?? []) as Row[], me.id);
}
/** 내가 보낸 메시지. 관리자는 관리자들이 보낸 통지 전부를 본다(누가 보냈든 같이 관리한다) */
export async function loadSent(me: Me, limit = 100): Promise<MessageLine[]> {
  let q = db().from('work_messages').select('*').eq('is_test', isTestNo(me.employeeNo)).is('hidden_at', null).order('created_at', { ascending: false }).limit(limit);
  q = me.role === 'admin' ? q.or(`sender_id.eq.${me.id},kind.eq.notice`) : q.eq('sender_id', me.id);
  const { data, error } = await q;
  if (error) boom('loadSent', error);
  return decorate((data ?? []) as Row[], me.id);
}
/** 읽지 않은 받은 메시지 수 */
export async function unreadCount(employeeId: string): Promise<number> {
  const { count } = await db().from('work_message_recipients').select('id, work_messages!inner(hidden_at)', { count: 'exact', head: true }).eq('employee_id', employeeId).is('read_at', null).is('work_messages.hidden_at', null);
  return count ?? 0;
}

export type Thread = { id: string; kind: MessageLine['kind']; needsReply: boolean; title: string; body: string; bodyHtml: string; related: Related; senderId: string | null; createdAt: string; iAmRecipient: boolean; recipients: { employeeId: string; readAt: string | null }[]; replies: { id: string; authorId: string; body: string; createdAt: string }[] };
/** 메시지 한 건과 회신. 볼 수 없는 사람에게는 null. 받는 사람이 열면 읽음으로 표시한다 */
export async function loadThread(id: string, me: Me): Promise<Thread | null> {
  const c = db();
  const { data: m } = await c.from('work_messages').select('*').eq('id', id).maybeSingle();
  if (!m || m.hidden_at) return null; // 숨긴 글은 열리지 않는다
  const { data: rec } = await c.from('work_message_recipients').select('id, employee_id, read_at').eq('message_id', id);
  const mine = (rec ?? []).find((r) => r.employee_id === me.id);
  if (!mine && m.sender_id !== me.id && (me.role !== 'admin' || (m.is_test as boolean) !== isTestNo(me.employeeNo))) return null;
  if (mine && !mine.read_at) {
    const now = new Date().toISOString();
    await c.from('work_message_recipients').update({ read_at: now }).eq('id', mine.id).is('read_at', null);
    mine.read_at = now;
  }
  const { data: rep } = await c.from('work_message_replies').select('id, author_id, body, created_at').eq('message_id', id).order('created_at');
  const canSeeAll = m.sender_id === me.id || me.role === 'admin'; // 누가 읽었는지는 보낸 사람과 관리자만 본다
  return {
    id: m.id as string, kind: m.kind as Thread['kind'], needsReply: m.needs_reply as boolean, title: m.title as string, body: m.body as string, bodyHtml: safeRichHtml(m.body_html as string | null), related: (m.related ?? {}) as Related, senderId: m.sender_id as string | null, createdAt: m.created_at as string, iAmRecipient: !!mine,
    recipients: canSeeAll ? (rec ?? []).map((r) => ({ employeeId: r.employee_id as string, readAt: r.read_at as string | null })) : [],
    // 여러 명에게 보낸 통지에서는 다른 직원의 회신이 서로 보이지 않는다: 받는 사람은 자기 회신만 본다. (관리자가 그 직원에게 답할 때는 그 사람에게만 가는 새 메시지를 보낸다 — answerTo)
    replies: (rep ?? []).filter((r) => canSeeAll || (rec ?? []).length <= 1 || r.author_id === me.id).map((r) => ({ id: r.id as string, authorId: r.author_id as string, body: r.body as string, createdAt: r.created_at as string })),
  };
}

/** 팝업으로 띄울 안 읽은 글 — 관리자가 보낸 전달과 연차 사용 촉진만 (2026-11-05 의뢰인: 공지처럼 폰에서 바로 보이게). 처리 결과 같은 다른 프로그램 알림은 띄우지 않는다 */
export async function pendingPopupMessages(employeeId: string, limit = 3): Promise<{ id: string; title: string; body: string; html: string; promotionHref: string | null }[]> {
  const { data, error } = await db().from('work_message_recipients').select('message_id, work_messages!inner(kind, title, body, body_html, related, hidden_at, created_at)').eq('employee_id', employeeId).is('read_at', null).is('work_messages.hidden_at', null).order('created_at', { ascending: false }).limit(20);
  if (error) boom('pendingPopupMessages', error);
  return (data ?? [])
    .map((r) => ({ id: r.message_id as string, m: r.work_messages as unknown as Row }))
    .filter(({ m }) => m.kind === 'notice' || (m.related as Related | null)?.type === 'promotion')
    .slice(0, limit)
    .map(({ id, m }) => {
      const related = (m.related ?? {}) as Related;
      return { id, title: m.title as string, body: m.body as string, html: safeRichHtml(m.body_html as string | null), promotionHref: related.type === 'promotion' && related.href ? related.href : null };
    });
}

/** 받는 사람이 팝업에서 「확인」 — 읽음으로 표시한다(열어 본 것과 같다. 동의 · 법적 통지 완료를 뜻하지 않는다) */
export async function markRead(messageId: string, employeeId: string): Promise<void> {
  const { error } = await db().from('work_message_recipients').update({ read_at: new Date().toISOString() }).eq('message_id', messageId).eq('employee_id', employeeId).is('read_at', null);
  if (error) boom('markRead', error);
}

/** 요청 처리 결과 글(「○○가 승인되었습니다」)은 이만큼 지나면 자동으로 숨긴다 (2026-11-03 의뢰인: 「계속 누적해서 볼 필요는 없다」) */
export const DECISION_MESSAGE_DAYS = 7;
/** 매일 아침 — 오래된 처리 결과 글을 숨긴다(지우지 않는다, 0085). 숨긴 수 */
export async function hideOldDecisionMessages(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - DECISION_MESSAGE_DAYS * 86_400_000).toISOString();
  const { data, error } = await db().from('work_messages').update({ hidden_at: now.toISOString() }).eq('related->>type', 'decision').is('hidden_at', null).lt('created_at', before).select('id');
  if (error) boom('hideOldDecisionMessages', error);
  return data?.length ?? 0;
}
