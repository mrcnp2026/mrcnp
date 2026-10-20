// 교육 월별 엑셀 — 감사 · 점검 대응 (묶음 33, 2026-10-20). ?m=YYYY-MM. 관리자만.
// 시트: 서명 일지(교육마다 대상 · 서명 시각 · 방법) · 교육 내용(날짜 · 시간 · 강사 · 장소 · 내용 · 사진 수) · 이수 현황(그 달 말 기준).
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { requireAdmin } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { groupMatcher, loadAttendees, loadCourses, loadPhotos, loadSessions, trainingPeople } from '@/lib/training-data';
import { progressOf, sessionHours } from '@/lib/training-rules';

const CYCLE: Record<string, string> = { HALF: '반기', YEAR: '1년', HIRE: '입사 시', ADHOC: '수시', DAILY: '매일' };

export async function GET(req: Request): Promise<Response> {
  if (!(await requireAdmin().catch(() => null))) return deny(403, 'forbidden');
  const m = new URL(req.url).searchParams.get('m');
  if (!m || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return deny(400, 'invalid_input');
  const from = `${m}-01`;
  const to = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [courses, sessions, people, inGroup] = await Promise.all([loadCourses(), loadSessions({ from, to }), trainingPeople(), groupMatcher()]);
  const live = sessions.filter((s) => !s.cancelled);
  const [att, photos] = await Promise.all([loadAttendees(live.map((s) => s.id)), loadPhotos(live.map((s) => s.id))]);
  const who = new Map(people.map((p) => [p.id, p]));
  const courseOf = new Map(courses.map((c) => [c.id, c]));
  const wb = new ExcelJS.Workbook();

  const log = wb.addWorksheet('서명 일지');
  log.addRow(['교육일', '교육 종류', '시간', '강사', '사번', '이름', '서명 시각', '방법', '서명 그림', '메모']);
  for (const s of [...live].sort((a, b) => a.heldOn.localeCompare(b.heldOn))) {
    for (const a of att.filter((x) => x.sessionId === s.id && !x.removed)) {
      const p = who.get(a.employeeId);
      log.addRow([s.heldOn, courseOf.get(s.courseId)?.name ?? '', sessionHours(s) ?? '', s.instructor ?? '', p?.employeeNo ?? '', p?.name ?? '', a.signedAt ? new Date(a.signedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미서명', a.signMethod === 'APP' ? '앱(본인 로그인)' : a.signMethod === 'ADMIN' ? '종이 서명 옮김' : '', a.hasSignature ? '있음' : '', a.signedNote ?? '']);
    }
  }
  const info = wb.addWorksheet('교육 내용');
  info.addRow(['교육일', '교육 종류', '근거', '시작', '끝', '시간', '강사', '장소', '대상', '서명', '사진', '내용']);
  for (const s of [...live].sort((a, b) => a.heldOn.localeCompare(b.heldOn))) {
    const mine = att.filter((x) => x.sessionId === s.id && !x.removed);
    const c = courseOf.get(s.courseId);
    info.addRow([s.heldOn, c?.name ?? '', c?.law ?? '', s.startTime ?? '', s.endTime ?? '', sessionHours(s) ?? '', s.instructor ?? '', s.place ?? '', mine.length, mine.filter((x) => x.signedAt).length, photos.filter((x) => x.sessionId === s.id).length, s.content ?? '']);
  }
  const prog = wb.addWorksheet('이수 현황');
  prog.addRow(['교육 종류', '주기', '필요 시간', '대상', '이수', '이수율', '안 들은 사람']);
  const all = await loadSessions({ from: `${Number(m.slice(0, 4)) - 1}-01-01`, to });
  const allAtt = await loadAttendees(all.map((s) => s.id));
  for (const c of courses.filter((x) => x.active)) {
    const p = progressOf({ course: c, date: to, people, sessions: all, attendees: allAtt, inGroup });
    if (!p) continue;
    const done = p.filter((x) => x.done).length;
    prog.addRow([c.name, CYCLE[c.cycle], c.hours ?? '', p.length, done, p.length ? `${Math.round((done / p.length) * 100)}%` : '', p.filter((x) => !x.done).map((x) => who.get(x.employeeId)?.name ?? '').join(', ')]);
  }
  for (const ws of [log, info, prog]) {
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => (c.width = 14));
  }
  info.getColumn(12).width = 60;
  prog.getColumn(7).width = 60;
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="training.xlsx"; filename*=UTF-8''${encodeURIComponent(`교육기록_${m}.xlsx`)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
