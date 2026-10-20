// 교육 · 안전교육 (묶음 33, 2026-10-20 의뢰인 승인). 순수 함수 — 대상 고르기 · 주기 기간 · 시간 · 이수 판정 · 입력 검사 · 서명 그림 검사.
// ★ 법 기준(시간 · 주기)은 박아 두지 않는다. 교육 종류(training_courses)에 회사가 넣은 값으로만 판정한다.
// 이수 = 그 기간에 본인이 서명한 교육들의 시간 합이 종류의 시간 이상(시간이 없는 종류는 한 번 서명하면 이수). 채용 시 교육은 입사일 이후 한 번.

export const CYCLES = ['HALF', 'YEAR', 'HIRE', 'ADHOC', 'DAILY'] as const;
export type Cycle = (typeof CYCLES)[number];
export type Targets = { jobIds?: string[]; groupIds?: string[]; employeeIds?: string[] };
export type Course = { id: string; name: string; law: string | null; cycle: Cycle; hours: number | null; targets: Targets; signatureRequired: boolean; needsCheck: boolean; active: boolean; sort: number };
export type Session = { id: string; courseId: string; heldOn: string; startTime: string | null; endTime: string | null; instructor: string | null; place: string | null; content: string | null; cancelled: boolean };
export type Attendee = { sessionId: string; employeeId: string; signedAt: string | null; removed: boolean };
export type Person = { id: string; jobId: string | null; groupId: string | null; joinedOn: string | null; active: boolean };

/** 대상인가 — 직무 · 소속 · 사람을 하나도 고르지 않았으면 전 직원. 소속은 그 아래 팀까지(inGroup) */
export function isTarget(t: Targets, p: Person, inGroup: (personGroup: string | null, group: string) => boolean): boolean {
  const jobs = t.jobIds ?? [], groups = t.groupIds ?? [], people = t.employeeIds ?? [];
  if (!jobs.length && !groups.length && !people.length) return true;
  return people.includes(p.id) || (!!p.jobId && jobs.includes(p.jobId)) || groups.some((g) => inGroup(p.groupId, g));
}

/** 그 날이 든 주기 기간 [시작, 끝] — 반기 1~6월 / 7~12월, 1년, 매일은 그 날. 입사 시 · 수시는 기간이 없다(null) */
export function periodOf(cycle: Cycle, date: string): { from: string; to: string } | null {
  const y = date.slice(0, 4), m = Number(date.slice(5, 7));
  if (cycle === 'HALF') return m <= 6 ? { from: `${y}-01-01`, to: `${y}-06-30` } : { from: `${y}-07-01`, to: `${y}-12-31` };
  if (cycle === 'YEAR') return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (cycle === 'DAILY') return { from: date, to: date };
  return null;
}

/** 교육 한 번의 시간(시) — 시각이 없으면 null */
export function sessionHours(s: Pick<Session, 'startTime' | 'endTime'>): number | null {
  if (!s.startTime || !s.endTime) return null;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const d = mins(s.endTime) - mins(s.startTime);
  return d > 0 ? Math.round((d / 60) * 100) / 100 : null;
}

export type Progress = { employeeId: string; hours: number; sessions: number; done: boolean };
/** 한 교육 종류의 이수 현황 — 대상 직원마다 (그 날 기준 기간) */
export function progressOf(args: { course: Course; date: string; people: readonly Person[]; sessions: readonly Session[]; attendees: readonly Attendee[]; inGroup: (pg: string | null, g: string) => boolean }): Progress[] | null {
  const { course } = args;
  if (course.cycle === 'ADHOC' || course.cycle === 'DAILY') return null; // 수시 · 매일은 이수율을 세지 않는다(기록만)
  const period = periodOf(course.cycle, args.date);
  const mine = args.sessions.filter((s) => s.courseId === course.id && !s.cancelled && (!period || (s.heldOn >= period.from && s.heldOn <= period.to)));
  return args.people
    .filter((p) => p.active && isTarget(course.targets, p, args.inGroup))
    .filter((p) => course.cycle !== 'HIRE' || !!p.joinedOn)
    .map((p) => {
      const signed = mine.filter((s) => (course.cycle !== 'HIRE' || s.heldOn >= p.joinedOn!) && args.attendees.some((a) => a.sessionId === s.id && a.employeeId === p.id && a.signedAt && !a.removed));
      const hours = Math.round(signed.reduce((a, s) => a + (sessionHours(s) ?? 0), 0) * 100) / 100;
      const done = course.hours ? hours >= course.hours : signed.length > 0;
      return { employeeId: p.id, hours, sessions: signed.length, done };
    });
}

const plain = (v: unknown, max: number): string | null | undefined => (v === undefined || v === null || v === '' ? null : typeof v === 'string' && v.trim().length <= max ? v.trim() : undefined);
const ids = (v: unknown): string[] | null => (v === undefined || v === null ? [] : Array.isArray(v) && v.length <= 500 && v.every((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) ? [...new Set(v as string[])] : null);

export type CourseInput = Omit<Course, 'id' | 'active' | 'sort'> & { active: boolean };
export function cleanCourse(b: Record<string, unknown>): CourseInput | { error: string } {
  const name = plain(b.name, 60), law = plain(b.law, 100);
  if (!name) return { error: 'training_name' };
  if (law === undefined) return { error: 'invalid_input' };
  if (!(CYCLES as readonly string[]).includes(b.cycle as string)) return { error: 'training_cycle' };
  const hours = b.hours === null || b.hours === undefined || b.hours === '' ? null : Number(b.hours);
  if (hours !== null && (!Number.isFinite(hours) || hours <= 0 || hours > 100)) return { error: 'training_hours' };
  const t = (b.targets && typeof b.targets === 'object' ? b.targets : {}) as Record<string, unknown>;
  const jobIds = ids(t.jobIds), groupIds = ids(t.groupIds), employeeIds = ids(t.employeeIds);
  if (!jobIds || !groupIds || !employeeIds) return { error: 'invalid_input' };
  return { name, law, cycle: b.cycle as Cycle, hours: hours === null ? null : Math.round(hours * 100) / 100, targets: { jobIds, groupIds, employeeIds }, signatureRequired: b.signatureRequired === true, needsCheck: b.needsCheck !== false, active: b.active !== false };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export type SessionInput = { courseId: string; heldOn: string; startTime: string | null; endTime: string | null; instructor: string | null; place: string | null; content: string | null };
export function cleanSession(b: Record<string, unknown>): SessionInput | { error: string } {
  if (typeof b.courseId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.courseId)) return { error: 'invalid_input' };
  if (!DATE(b.heldOn)) return { error: 'training_date' };
  const st = b.startTime === '' || b.startTime == null ? null : TIME.test(String(b.startTime)) ? String(b.startTime) : undefined;
  const et = b.endTime === '' || b.endTime == null ? null : TIME.test(String(b.endTime)) ? String(b.endTime) : undefined;
  if (st === undefined || et === undefined || (st && et && et <= st) || (!!st !== !!et)) return { error: 'training_time' };
  const instructor = plain(b.instructor, 60), place = plain(b.place, 100), content = plain(b.content, 4000);
  if (instructor === undefined || place === undefined || content === undefined) return { error: 'invalid_input' };
  return { courseId: b.courseId, heldOn: b.heldOn, startTime: st, endTime: et, instructor, place, content };
}

/** 손가락 서명 그림 — 화면이 만든 SVG 경로(M x y L x y …)만 받는다. 획이 너무 적으면 서명이 아니다 */
export function cleanSignature(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || v.length > 30000 || !/^[ML0-9 .]+$/.test(v)) return undefined;
  const points = (v.match(/[ML]/g) ?? []).length;
  return points >= 5 ? v : undefined;
}
