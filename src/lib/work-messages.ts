// 업무 메시지함 (PRD v1.3 37.4, L19) — 관리자와 직원이 근태 · 휴가에 관해 주고받는 통지 · 문의 · 회신. 서버 전용.
// ★ 볼 수 있는 사람: 받는 사람 본인, 보낸 사람, 관리자. 그 밖의 사람에게는 「없는 메시지」다.
// ★ 메시지와 회신은 고칠 수 없다(0038). 잘못 보냈으면 회신으로 바로잡는다. 받는 사람은 보낼 때 고정된다.
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

/** 직원이 관리자에게 보내는 문의 — 켜져 있는 관리자 전원이 받는다(누가 답해도 된다) */
export async function sendInquiry(args: { me: Me; title: unknown; body: unknown; bodyHtml?: unknown; related?: Related }): Promise<{ id: string }> {
  const title = clean(args.title, 120);
  const { body, body_html } = richOrText(args.body, args.bodyHtml);
  if (title.length < 1 || title.length > 120 || body.length < 1 || body.length > 4000) throw new ApiError(400, 'message_invalid');
  const { data: admins } = await db().from('profiles').select('id, employee_no').eq('role', 'admin').eq('active', true);
  const test = isTestNo(args.me.employeeNo);
  const to = (admins ?? []).filter((p) => p.id !== args.me.id && isTestNo(p.employee_no as string | null) === test).map((p) => p.id as string);
  if (to.length === 0) throw new ApiError(409, 'message_no_recipients');
  return { id: await insertMessage({ kind: 'inquiry', needs_reply: true, title, body, ...(body_html ? { body_html } : {}), related: args.related ?? {}, audience: { admins: true }, sender_id: args.me.id, is_test: test }, to) };
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
  const { data: mine, error } = await c.from('work_message_recipients').select('message_id').eq('employee_id', me.id).order('created_at', { ascending: false }).limit(limit);
  if (error) boom('loadInbox', error);
  const ids = (mine ?? []).map((r) => r.message_id as string);
  if (ids.length === 0) return [];
  const { data } = await c.from('work_messages').select('*').in('id', ids).order('created_at', { ascending: false });
  return decorate((data ?? []) as Row[], me.id);
}
/** 내가 보낸 메시지. 관리자는 관리자들이 보낸 통지 전부를 본다(누가 보냈든 같이 관리한다) */
export async function loadSent(me: Me, limit = 100): Promise<MessageLine[]> {
  let q = db().from('work_messages').select('*').eq('is_test', isTestNo(me.employeeNo)).order('created_at', { ascending: false }).limit(limit);
  q = me.role === 'admin' ? q.or(`sender_id.eq.${me.id},kind.eq.notice`) : q.eq('sender_id', me.id);
  const { data, error } = await q;
  if (error) boom('loadSent', error);
  return decorate((data ?? []) as Row[], me.id);
}
/** 읽지 않은 받은 메시지 수 */
export async function unreadCount(employeeId: string): Promise<number> {
  const { count } = await db().from('work_message_recipients').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).is('read_at', null);
  return count ?? 0;
}

export type Thread = { id: string; kind: MessageLine['kind']; needsReply: boolean; title: string; body: string; bodyHtml: string; related: Related; senderId: string | null; createdAt: string; iAmRecipient: boolean; recipients: { employeeId: string; readAt: string | null }[]; replies: { id: string; authorId: string; body: string; createdAt: string }[] };
/** 메시지 한 건과 회신. 볼 수 없는 사람에게는 null. 받는 사람이 열면 읽음으로 표시한다 */
export async function loadThread(id: string, me: Me): Promise<Thread | null> {
  const c = db();
  const { data: m } = await c.from('work_messages').select('*').eq('id', id).maybeSingle();
  if (!m) return null;
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

/** 회신 — 받는 사람, 보낸 사람, 관리자만 */
export async function replyTo(id: string, me: Me, body: unknown): Promise<void> {
  const text = clean(body, 4000);
  if (text.length < 1 || text.length > 4000) throw new ApiError(400, 'message_invalid');
  const t = await loadThread(id, me);
  if (!t) throw new ApiError(404, 'not_found');
  const { error } = await db().from('work_message_replies').insert({ message_id: id, author_id: me.id, body: text });
  if (error) boom('replyTo', error);
}

/** 여러 명에게 보낸 통지의 회신에 답하기 — 그 직원 한 명에게만 가는 새 메시지를 만든다(원래 메시지를 가리킨다). 관리자만 */
export async function answerTo(args: { id: string; employeeId: string; me: Me; body: unknown }): Promise<{ id: string }> {
  const text = clean(args.body, 4000);
  if (text.length < 1 || text.length > 4000) throw new ApiError(400, 'message_invalid');
  const t = await loadThread(args.id, args.me);
  if (!t || args.me.role !== 'admin') throw new ApiError(404, 'not_found');
  if (!t.recipients.some((r) => r.employeeId === args.employeeId) && t.senderId !== args.employeeId) throw new ApiError(400, 'message_invalid');
  return { id: await insertMessage({ kind: 'notice', needs_reply: false, title: `Re: ${t.title}`.slice(0, 120), body: text, related: { type: 'message', id: t.id, href: `/punch/messages/${t.id}` }, audience: { employeeIds: [args.employeeId] }, sender_id: args.me.id, is_test: isTestNo(args.me.employeeNo) }, [args.employeeId]) };
}
