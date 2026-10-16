// 직원 비고 (묶음 19, 2026-10-16 의뢰인) — 관리자만 쓰고 읽는 그 사람에 대한 메모. 서버 전용.
// 한 건 500자(4줄 정도)까지, 여러 건이 쌓인다. 지우면 숨기기만 한다(deleted_at) — 변경 기록에 남는다.
import 'server-only';
import { ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

export const NOTE_MAX = 500;
export type StaffNote = { id: string; body: string; createdAt: string; createdBy: string; author: string };

/** 표가 아직 없으면(묶음 19 적용 전) null — 화면은 「적용 뒤 쓸 수 있음」으로 보인다 */
export async function loadStaffNotes(employeeId: string): Promise<StaffNote[] | null> {
  const db = createAdminClient();
  const { data, error } = await db.from('staff_notes').select('id, body, created_at, created_by').eq('employee_id', employeeId).is('deleted_at', null).order('created_at', { ascending: false }).limit(500);
  if (error) return null;
  const ids = [...new Set((data ?? []).map((n) => n.created_by as string))];
  const { data: people } = ids.length ? await db.from('profiles').select('id, name').in('id', ids) : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  return (data ?? []).map((n) => ({ id: n.id as string, body: n.body as string, createdAt: n.created_at as string, createdBy: n.created_by as string, author: nameOf.get(n.created_by as string) ?? '' }));
}

export function cleanNote(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return s.length >= 1 && s.length <= NOTE_MAX ? s : null;
}

export async function addStaffNote(employeeId: string, body: string, actorId: string): Promise<void> {
  const { error } = await createAdminClient().from('staff_notes').insert({ employee_id: employeeId, body, created_by: actorId, updated_by: actorId });
  if (error) throw new Error(`addStaffNote: ${error.code}`);
}

export async function hideStaffNote(employeeId: string, noteId: string, actorId: string): Promise<void> {
  const { data, error } = await createAdminClient().from('staff_notes').update({ deleted_at: new Date().toISOString(), updated_by: actorId }).eq('id', noteId).eq('employee_id', employeeId).is('deleted_at', null).select('id');
  if (error) throw new Error(`hideStaffNote: ${error.code}`);
  if (!data?.length) throw new ApiError(404, 'not_found');
}
