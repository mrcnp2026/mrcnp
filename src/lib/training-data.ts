// 교육 · 안전교육 읽기 · 쓰기 (묶음 33, 2026-10-20 의뢰인 승인). 서버 전용 — 부르는 쪽이 관리자 · 본인인지 먼저 확인한다.
// ★ 교육을 만들면 대상 직원이 정해지고 폰 알림이 간다. 직원은 본인 로그인으로 확인 · 서명한다(서명 그림은 교육 종류에서 켰을 때만).
// ★ 서명한 줄은 고치지 못한다(DB 보호). 서명 전에만 대상에서 뺄 수 있다. 사진은 비공개 저장소(training-photos) — 서버가 내려 준다.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { cleanFileName, sniffEvidence } from '@/lib/leave-evidence';
import { groupScope } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { sendPush } from '@/lib/push';
import { createAdminClient } from '@/lib/supabase/admin';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin';
import { switchOn } from '@/lib/switches';
import { isTarget, type Attendee, type Course, type CourseInput, type Person, type Session, type SessionInput } from '@/lib/training-rules';

type Row = Record<string, unknown>;
const db = () => createAdminClient();
const BUCKET = 'training-photos';
export const MAX_PHOTOS = 5;
const isTest = () => OFFICE.practiceMode;

const toCourse = (r: Row): Course => ({ id: r.id as string, name: r.name as string, law: (r.law as string | null) ?? null, cycle: r.cycle as Course['cycle'], hours: r.hours === null ? null : Number(r.hours), targets: (r.targets ?? {}) as Course['targets'], signatureRequired: r.signature_required as boolean, needsCheck: r.needs_check as boolean, active: r.active as boolean, sort: r.sort as number });
const toSession = (r: Row): Session & { createdAt: string } => ({ id: r.id as string, courseId: r.course_id as string, heldOn: r.held_on as string, startTime: r.start_time ? String(r.start_time).slice(0, 5) : null, endTime: r.end_time ? String(r.end_time).slice(0, 5) : null, instructor: (r.instructor as string | null) ?? null, place: (r.place as string | null) ?? null, content: (r.content as string | null) ?? null, cancelled: !!r.cancelled_at, createdAt: r.created_at as string });
export type AttendeeRow = Attendee & { id: string; signMethod: 'APP' | 'ADMIN' | null; hasSignature: boolean; signedNote: string | null };
const toAttendee = (r: Row): AttendeeRow => ({ id: r.id as string, sessionId: r.session_id as string, employeeId: r.employee_id as string, signedAt: (r.signed_at as string | null) ?? null, removed: !!r.removed_at, signMethod: (r.sign_method as AttendeeRow['signMethod']) ?? null, hasSignature: !!r.signature_svg, signedNote: (r.signed_note as string | null) ?? null });

export async function loadCourses(): Promise<Course[]> {
  const { data, error } = await db().from('training_courses').select('*').order('sort').order('name');
  if (error) throw new Error(`loadCourses: ${error.code}`);
  return ((data ?? []) as Row[]).map(toCourse);
}
export async function saveCourse(args: { id: string | null; input: CourseInput; me: Me }): Promise<string> {
  const i = args.input;
  const row = { name: i.name, law: i.law, cycle: i.cycle, hours: i.hours, targets: i.targets, signature_required: i.signatureRequired, needs_check: i.needsCheck, active: i.active, updated_by: args.me.id, updated_at: new Date().toISOString() };
  if (args.id) {
    const { error } = await db().from('training_courses').update(row).eq('id', args.id);
    if (error) throw new Error(`saveCourse: ${error.code}`);
    return args.id;
  }
  const { data, error } = await db().from('training_courses').insert({ ...row, created_by: args.me.id, sort: 100 }).select('id').single();
  if (error || !data) throw new Error(`saveCourse.insert: ${error?.code}`);
  return data.id as string;
}

/** 직원 목록(교육 대상 판정용) — 시스템관리자 · 시험 계정 빼고 */
export async function trainingPeople(): Promise<(Person & { name: string; employeeNo: string | null })[]> {
  const { data } = await db().from('profiles').select('id, name, employee_no, job_id, group_id, joined_on, active').or(NOT_SYSTEM_ADMIN).order('name');
  return (data ?? []).filter((p) => !(p.employee_no as string | null)?.startsWith('e2e-')).map((p) => ({ id: p.id as string, name: p.name as string, employeeNo: (p.employee_no as string | null) ?? null, jobId: (p.job_id as string | null) ?? null, groupId: (p.group_id as string | null) ?? null, joinedOn: (p.joined_on as string | null) ?? null, active: p.active as boolean }));
}
/** 소속 판정 — 고른 부서면 그 아래 팀까지 */
export async function groupMatcher(): Promise<(pg: string | null, g: string) => boolean> {
  const groups = await loadOrgGroups();
  const cache = new Map<string, Set<string>>();
  return (pg, g) => {
    if (!pg) return false;
    if (!cache.has(g)) cache.set(g, groupScope(groups, g));
    return cache.get(g)!.has(pg);
  };
}

export async function loadSessions(args: { from: string; to: string }): Promise<(Session & { createdAt: string })[]> {
  const { data, error } = await db().from('training_sessions').select('*').eq('is_test', isTest()).gte('held_on', args.from).lte('held_on', args.to).order('held_on', { ascending: false });
  if (error) throw new Error(`loadSessions: ${error.code}`);
  return ((data ?? []) as Row[]).map(toSession);
}
export async function loadAttendees(sessionIds: string[]): Promise<AttendeeRow[]> {
  if (!sessionIds.length) return [];
  const out: AttendeeRow[] = [];
  for (let i = 0; i < sessionIds.length; i += 200) {
    const { data, error } = await db().from('training_attendees').select('id, session_id, employee_id, signed_at, sign_method, signature_svg, signed_note, removed_at').in('session_id', sessionIds.slice(i, i + 200));
    if (error) throw new Error(`loadAttendees: ${error.code}`);
    out.push(...((data ?? []) as Row[]).map(toAttendee));
  }
  return out;
}
export async function loadSession(id: string): Promise<(Session & { createdAt: string }) | null> {
  const { data } = await db().from('training_sessions').select('*').eq('id', id).eq('is_test', isTest()).maybeSingle();
  return data ? toSession(data as Row) : null;
}

const notify = async (ids: string[], course: string, sessionId: string, heldOn: string, again = false) => {
  if (!ids.length || !(await switchOn('notify.push'))) return 0;
  return sendPush(ids, { title: again ? `교육 서명이 아직입니다 — ${course}` : `교육 확인 · 서명 요청 — ${course}`, body: `${heldOn} 교육 내용을 확인하고 서명해 주세요`, url: `/punch/training/${sessionId}`, tag: `training-${sessionId}` }).catch(() => 0);
};

/** 교육 만들기 — 대상 직원(교육 종류의 대상 · 직접 고른 사람)을 넣고 폰으로 알린다 */
export async function createSession(args: { input: SessionInput; employeeIds: string[] | null; me: Me }): Promise<string> {
  const courses = await loadCourses();
  const course = courses.find((c) => c.id === args.input.courseId && c.active);
  if (!course) throw new ApiError(400, 'invalid_input');
  const [people, inGroup] = await Promise.all([trainingPeople(), groupMatcher()]);
  const targets = args.employeeIds ? people.filter((p) => p.active && args.employeeIds!.includes(p.id)) : people.filter((p) => p.active && isTarget(course.targets, p, inGroup));
  const c = db();
  const i = args.input;
  const { data, error } = await c.from('training_sessions').insert({ course_id: i.courseId, held_on: i.heldOn, start_time: i.startTime, end_time: i.endTime, instructor: i.instructor, place: i.place, content: i.content, is_test: isTest(), created_by: args.me.id }).select('id').single();
  if (error || !data) throw new Error(`createSession: ${error?.code}`);
  if (targets.length) {
    const { error: e2 } = await c.from('training_attendees').insert(targets.map((p) => ({ session_id: data.id, employee_id: p.id })));
    if (e2) throw new Error(`createSession.attendees: ${e2.code}`);
  }
  await notify(targets.map((p) => p.id), course.name, data.id as string, i.heldOn);
  return data.id as string;
}
export async function updateSession(args: { id: string; input: SessionInput; me: Me }): Promise<void> {
  const i = args.input;
  const { data, error } = await db().from('training_sessions').update({ held_on: i.heldOn, start_time: i.startTime, end_time: i.endTime, instructor: i.instructor, place: i.place, content: i.content, updated_by: args.me.id, updated_at: new Date().toISOString() }).eq('id', args.id).is('cancelled_at', null).select('id');
  if (error) throw new Error(`updateSession: ${error.code}`);
  if (!data?.length) throw new ApiError(404, 'not_found');
}
export async function cancelSession(args: { id: string; me: Me }): Promise<void> {
  const { data, error } = await db().from('training_sessions').update({ cancelled_at: new Date().toISOString(), cancelled_by: args.me.id, updated_by: args.me.id, updated_at: new Date().toISOString() }).eq('id', args.id).is('cancelled_at', null).select('id');
  if (error) throw new Error(`cancelSession: ${error.code}`);
  if (!data?.length) throw new ApiError(404, 'not_found');
}

/** 대상 넣기 · 빼기(서명 전만). 다시 넣으면 뺀 표시를 지운다 */
export async function setAttendee(args: { sessionId: string; employeeId: string; on: boolean; me: Me }): Promise<void> {
  const c = db();
  const { data: cur } = await c.from('training_attendees').select('id, signed_at, removed_at').eq('session_id', args.sessionId).eq('employee_id', args.employeeId).maybeSingle();
  if (args.on) {
    if (!cur) {
      const { error } = await c.from('training_attendees').insert({ session_id: args.sessionId, employee_id: args.employeeId });
      if (error) throw new Error(`setAttendee.add: ${error.code}`);
      const s = await loadSession(args.sessionId);
      const course = s ? (await loadCourses()).find((x) => x.id === s.courseId) : null;
      if (s && course) await notify([args.employeeId], course.name, s.id, s.heldOn);
    } else if (cur.removed_at) {
      const { error } = await c.from('training_attendees').update({ removed_at: null, removed_by: null }).eq('id', cur.id);
      if (error) throw new Error(`setAttendee.back: ${error.code}`);
    }
    return;
  }
  if (!cur || cur.removed_at) return;
  if (cur.signed_at) throw new ApiError(409, 'training_signed');
  const { error } = await c.from('training_attendees').update({ removed_at: new Date().toISOString(), removed_by: args.me.id }).eq('id', cur.id);
  if (error) throw new Error(`setAttendee.remove: ${error.code}`);
}

/** 서명 — 본인(APP) 또는 관리자가 종이 서명을 옮겨 적음(ADMIN, 메모 필수) */
export async function sign(args: { sessionId: string; employeeId: string; method: 'APP' | 'ADMIN'; signature: string | null; note: string | null }): Promise<void> {
  const s = await loadSession(args.sessionId);
  if (!s || s.cancelled) throw new ApiError(404, 'not_found');
  const course = (await loadCourses()).find((x) => x.id === s.courseId);
  if (args.method === 'APP' && course?.signatureRequired && !args.signature) throw new ApiError(400, 'training_signature_required');
  const { data, error } = await db().from('training_attendees').update({ signed_at: new Date().toISOString(), sign_method: args.method, signature_svg: args.signature, signed_note: args.note }).eq('session_id', args.sessionId).eq('employee_id', args.employeeId).is('signed_at', null).is('removed_at', null).select('id');
  if (error) throw new Error(`sign: ${error.code}`);
  if (!data?.length) throw new ApiError(409, 'training_not_target');
}
export async function loadSignature(sessionId: string, employeeId: string): Promise<string | null> {
  const { data } = await db().from('training_attendees').select('signature_svg').eq('session_id', sessionId).eq('employee_id', employeeId).maybeSingle();
  return (data?.signature_svg as string | null) ?? null;
}

/** 아직 서명하지 않은 사람에게 다시 알림 */
export async function remind(sessionId: string): Promise<number> {
  const s = await loadSession(sessionId);
  if (!s || s.cancelled) throw new ApiError(404, 'not_found');
  const course = (await loadCourses()).find((x) => x.id === s.courseId);
  const att = (await loadAttendees([sessionId])).filter((a) => !a.signedAt && !a.removed);
  return notify(att.map((a) => a.employeeId), course?.name ?? '', s.id, s.heldOn, true);
}

// ── 현장 사진 ──
export type Photo = { id: string; sessionId: string; fileName: string; size: number; mime: string; at: string };
export async function loadPhotos(sessionIds: string[]): Promise<Photo[]> {
  if (!sessionIds.length) return [];
  const { data } = await db().from('training_photos').select('id, session_id, file_name, size_bytes, mime, created_at').in('session_id', sessionIds).is('removed_at', null).order('created_at');
  return (data ?? []).map((r) => ({ id: r.id as string, sessionId: r.session_id as string, fileName: r.file_name as string, size: r.size_bytes as number, mime: r.mime as string, at: r.created_at as string }));
}
export async function addPhoto(args: { sessionId: string; file: File; me: Me }): Promise<string> {
  if (args.file.size === 0 || args.file.size > 10 * 1024 * 1024) throw new ApiError(400, 'evidence_too_big');
  const now = await loadPhotos([args.sessionId]);
  if (now.length >= MAX_PHOTOS) throw new ApiError(409, 'training_photo_limit');
  const buf = new Uint8Array(await args.file.arrayBuffer());
  const mime = sniffEvidence(buf);
  if (!mime || mime === 'application/pdf') throw new ApiError(400, 'training_photo_type');
  const path = `${args.sessionId}/${randomUUID()}`;
  const up = await db().storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
  if (up.error) throw new Error(`addPhoto.upload: ${up.error.message}`);
  const { data, error } = await db().from('training_photos').insert({ session_id: args.sessionId, storage_path: path, file_name: cleanFileName(args.file.name), size_bytes: args.file.size, mime, uploaded_by: args.me.id }).select('id').single();
  if (error || !data) {
    await db().storage.from(BUCKET).remove([path]);
    throw new Error(`addPhoto.row: ${error?.code}`);
  }
  return data.id as string;
}
export async function removePhoto(args: { id: string; me: Me }): Promise<void> {
  const { error } = await db().from('training_photos').update({ removed_at: new Date().toISOString(), removed_by: args.me.id }).eq('id', args.id).is('removed_at', null);
  if (error) throw new Error(`removePhoto: ${error.code}`);
}
export async function photoFile(id: string): Promise<{ body: Blob; mime: string; name: string } | null> {
  const { data } = await db().from('training_photos').select('storage_path, mime, file_name').eq('id', id).is('removed_at', null).maybeSingle();
  if (!data) return null;
  const f = await db().storage.from(BUCKET).download(data.storage_path as string);
  if (f.error || !f.data) return null;
  return { body: f.data, mime: data.mime as string, name: data.file_name as string };
}
