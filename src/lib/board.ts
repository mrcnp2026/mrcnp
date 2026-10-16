// 사내 자유 게시판 (2026-10-16 의뢰인: 글 등록 · 사진 첨부 · 끌어다 놓기로 본문에 넣기 · 간단한 편집 · 페이지 넘김). 서버 전용.
// 누구나(로그인한 직원) 읽고 쓴다. 고치기는 쓴 사람만, 지우기는 쓴 사람 · 관리자. 지운 글은 deleted_at만 찍는다(되살릴 수 있게).
// 연습 모드의 글은 연습 글(is_test)로 따로 — 실제 운영으로 바꾸면 보이지 않는다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { cleanRichHtml } from '@/lib/rich-text';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';

export const BOARD_PAGE_SIZE = 15;
export type BoardItem = { id: string; title: string; authorId: string; authorName: string; createdAt: string; updatedAt: string; hasImage: boolean; excerpt: string };
export type BoardPost = BoardItem & { bodyHtml: string; body: string };

const missing = (code?: string) => code === '42P01' || code === 'PGRST205';
const db = () => createAdminClient();

async function names(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await db().from('profiles').select('id, name').in('id', [...new Set(ids)]);
  return new Map((data ?? []).map((p) => [p.id as string, p.name as string]));
}

/** 목록 한 페이지. q가 있으면 제목 · 본문 글자에서 찾는다. 표가 아직 없으면 ready=false */
export async function listBoard(page: number, q: string): Promise<{ ready: boolean; items: BoardItem[]; total: number; page: number; pages: number }> {
  const from = (Math.max(1, page) - 1) * BOARD_PAGE_SIZE;
  let query = db().from('board_posts').select('id, title, author_id, created_at, updated_at, body, body_html', { count: 'exact' }).eq('is_test', OFFICE.practiceMode).is('deleted_at', null);
  const word = q.trim().replace(/[%_,()]/g, ' ').slice(0, 50);
  if (word) query = query.or(`title.ilike.%${word}%,body.ilike.%${word}%`);
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, from + BOARD_PAGE_SIZE - 1);
  if (missing(error?.code)) return { ready: false, items: [], total: 0, page: 1, pages: 1 };
  if (error) throw new Error(`listBoard: ${error.code}`);
  const who = await names((data ?? []).map((r) => r.author_id as string));
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / BOARD_PAGE_SIZE));
  return {
    ready: true, total, pages, page: Math.min(Math.max(1, page), pages),
    items: (data ?? []).map((r) => ({ id: r.id as string, title: r.title as string, authorId: r.author_id as string, authorName: who.get(r.author_id as string) ?? '', createdAt: r.created_at as string, updatedAt: r.updated_at as string, hasImage: /<img /i.test((r.body_html as string) ?? ''), excerpt: String(r.body ?? '').replace(/\s+/g, ' ').slice(0, 120) })),
  };
}

export async function getBoardPost(id: string): Promise<BoardPost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from('board_posts').select('*').eq('id', id).eq('is_test', OFFICE.practiceMode).is('deleted_at', null).maybeSingle();
  if (missing(error?.code) || !data) return null;
  if (error) throw new Error(`getBoardPost: ${error.code}`);
  const who = await names([data.author_id as string]);
  return { id: data.id, title: data.title, authorId: data.author_id, authorName: who.get(data.author_id) ?? '', createdAt: data.created_at, updatedAt: data.updated_at, hasImage: /<img /i.test(data.body_html), excerpt: '', bodyHtml: data.body_html, body: data.body };
}

function parse(b: Record<string, unknown>): { title: string; body: string; bodyHtml: string } {
  const title = cleanText(b.title);
  if (title.length < 1 || title.length > 200) throw new ApiError(400, 'title_required');
  const rich = cleanRichHtml(b.bodyHtml);
  if (rich.empty) throw new ApiError(400, 'body_required');
  return { title, body: rich.text, bodyHtml: rich.html };
}

export async function createBoardPost(me: Me, b: Record<string, unknown>): Promise<string> {
  const v = parse(b);
  const { data, error } = await db().from('board_posts').insert({ author_id: me.id, title: v.title, body: v.body, body_html: v.bodyHtml, is_test: OFFICE.practiceMode }).select('id').single();
  if (missing(error?.code)) throw new ApiError(503, 'db_update_required');
  if (error) throw new Error(`createBoardPost: ${error.code}`);
  return data.id as string;
}

async function own(me: Me, id: string, forDelete: boolean): Promise<void> {
  const post = await getBoardPost(id);
  if (!post) throw new ApiError(404, 'not_found');
  const mine = post.authorId === me.id;
  if (!mine && !(forDelete && me.role === 'admin')) throw new ApiError(403, 'forbidden');
}

export async function updateBoardPost(me: Me, id: string, b: Record<string, unknown>): Promise<void> {
  await own(me, id, false);
  const v = parse(b);
  const { error } = await db().from('board_posts').update({ title: v.title, body: v.body, body_html: v.bodyHtml, updated_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
  if (error) throw new Error(`updateBoardPost: ${error.code}`);
}

export async function deleteBoardPost(me: Me, id: string): Promise<void> {
  await own(me, id, true);
  const { error } = await db().from('board_posts').update({ deleted_at: new Date().toISOString(), deleted_by: me.id }).eq('id', id).is('deleted_at', null);
  if (error) throw new Error(`deleteBoardPost: ${error.code}`);
}
