// 교육 관리 (묶음 33, 2026-10-20) — 교육 종류 저장, 교육 만들기 · 고치기 · 취소, 대상 넣기 · 빼기, 종이 서명 옮겨 적기, 다시 알림, 사진 떼기. 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { cancelSession, createSession, remind, removePhoto, saveCourse, setAttendee, sign, updateSession } from '@/lib/training-data';
import { cleanCourse, cleanSession } from '@/lib/training-rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

export const POST = api('admin.training', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (b.action === 'course.save') {
    const input = cleanCourse(b);
    if ('error' in input) throw new ApiError(400, input.error);
    return { id: await saveCourse({ id: b.id === undefined || b.id === null ? null : id(b.id) ?? (() => { throw new ApiError(400, 'invalid_input'); })(), input, me }) };
  }
  if (b.action === 'session.create' || b.action === 'session.update') {
    const input = cleanSession(b);
    if ('error' in input) throw new ApiError(400, input.error);
    if (b.action === 'session.update') {
      const sid = id(b.id);
      if (!sid) throw new ApiError(400, 'invalid_input');
      await updateSession({ id: sid, input, me });
      return { id: sid };
    }
    const picked = Array.isArray(b.employeeIds) ? (b.employeeIds as unknown[]).map(id).filter((x): x is string => !!x) : null;
    return { id: await createSession({ input, employeeIds: picked && picked.length ? picked : null, me }) };
  }
  if (b.action === 'session.cancel') {
    const sid = id(b.id);
    if (!sid) throw new ApiError(400, 'invalid_input');
    await cancelSession({ id: sid, me });
    return { ok: true };
  }
  if (b.action === 'attendee.set') {
    const sid = id(b.sessionId), eid = id(b.employeeId);
    if (!sid || !eid || typeof b.on !== 'boolean') throw new ApiError(400, 'invalid_input');
    await setAttendee({ sessionId: sid, employeeId: eid, on: b.on, me });
    return { ok: true };
  }
  if (b.action === 'attendee.paper') {
    // 종이에 받은 서명을 옮겨 적는다 — 누가 · 왜를 메모로 남긴다
    const sid = id(b.sessionId), eid = id(b.employeeId);
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 200) : '';
    if (!sid || !eid) throw new ApiError(400, 'invalid_input');
    if (note.length < 2) throw new ApiError(400, 'reason_required');
    await sign({ sessionId: sid, employeeId: eid, method: 'ADMIN', signature: null, note: `${me.name} · ${note}`.slice(0, 200) });
    return { ok: true };
  }
  if (b.action === 'remind') {
    const sid = id(b.sessionId);
    if (!sid) throw new ApiError(400, 'invalid_input');
    return { sent: await remind(sid) };
  }
  if (b.action === 'photo.remove') {
    const pid = id(b.id);
    if (!pid) throw new ApiError(400, 'invalid_input');
    await removePhoto({ id: pid, me });
    return { ok: true };
  }
  throw new ApiError(400, 'invalid_input');
});
