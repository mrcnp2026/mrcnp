// 사회보험 — 취득/상실 확인, 고지 보험료 넣기 · 대장 반영 (PRD v1.3 18.4 W06). 급여 담당 관리자만. 연습/운영은 서버가 정한다.
import { api, ApiError, readJson } from '@/lib/api';
import { OFFICE } from '@/config/office';
import { requirePayroll } from '@/lib/payroll/data';
import { addEnrollments, allocateNotice, INSURERS, saveManualNotice, setEnrollment, unallocateNotice, withdrawNoticeFile, type Insurer, type ManualRow } from '@/lib/payroll/insurance-data';

export const maxDuration = 60;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isInsurer = (v: unknown): v is Insurer => INSURERS.includes(v as Insurer);
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');
const won = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isInteger(n) && Math.abs(n) <= 1e11 ? n : null;
};

export const POST = api('admin.payroll.insurance', async (req, ctx) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  const practice = OFFICE.practiceMode && b.live !== true;
  const requestId = ctx.requestId;
  if (b.action === 'enroll.add') {
    const insurers = Array.isArray(b.insurers) ? [...new Set(b.insurers.filter(isInsurer))] : [];
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || insurers.length === 0 || (b.event !== 'ACQUIRE' && b.event !== 'LOSE') || !isDate(b.qualifyOn)) throw new ApiError(400, 'invalid_input');
    return addEnrollments({ employeeId: b.employeeId, insurers, event: b.event, qualifyOn: b.qualifyOn, me, requestId });
  }
  if (b.action === 'enroll.set' || b.action === 'enroll.disable') {
    if (typeof b.id !== 'string' || !UUID.test(b.id) || !Number.isInteger(b.expectedVersion)) throw new ApiError(400, 'invalid_input');
    if (b.action === 'enroll.disable') await setEnrollment({ id: b.id, expectedVersion: b.expectedVersion as number, disable: true, me, requestId });
    else {
      if (b.state !== 'UNREPORTED' && b.state !== 'CHECKING' && b.state !== 'CONFIRMED') throw new ApiError(400, 'invalid_input');
      const evidence = clean(b.evidence, 300);
      if (/\d{6}\s*-\s*\d{7}/.test(evidence)) throw new ApiError(400, 'insurance_no_rrn'); // 근거 칸에 주민번호를 적지 않는다
      await setEnrollment({ id: b.id, expectedVersion: b.expectedVersion as number, state: b.state, confirmedOn: isDate(b.confirmedOn) ? b.confirmedOn : null, evidence: evidence || null, me, requestId });
    }
    return { ok: true };
  }
  if (b.action === 'notice.save') {
    if (!isInsurer(b.insurer) || typeof b.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month) || !Array.isArray(b.rows)) throw new ApiError(400, 'invalid_input');
    const rows: ManualRow[] = [];
    for (const r of b.rows as Record<string, unknown>[]) {
      const employee = won(r?.employee), employer = r?.employer === '' || r?.employer === null || r?.employer === undefined ? null : won(r.employer);
      if (typeof r?.employeeId !== 'string' || !UUID.test(r.employeeId) || employee === null || (r?.employer !== '' && r?.employer !== null && r?.employer !== undefined && employer === null)) throw new ApiError(400, 'insurance_rows');
      rows.push({ employeeId: r.employeeId, employee, employer, note: clean(r.note, 150) || null });
    }
    return saveManualNotice({ insurer: b.insurer, month: b.month, rows, practice, me, requestId });
  }
  if (b.action === 'notice.allocate') {
    if (typeof b.noticeId !== 'string' || !UUID.test(b.noticeId) || typeof b.runId !== 'string' || !UUID.test(b.runId)) throw new ApiError(400, 'invalid_input');
    return allocateNotice({ noticeId: b.noticeId, runId: b.runId, practice, me, requestId });
  }
  if (b.action === 'notice.unallocate') {
    if (typeof b.allocationId !== 'string' || !UUID.test(b.allocationId)) throw new ApiError(400, 'invalid_input');
    await unallocateNotice({ allocationId: b.allocationId, me, requestId });
    return { ok: true };
  }
  if (b.action === 'notice.withdraw') {
    const reason = clean(b.reason, 300);
    if (typeof b.id !== 'string' || !UUID.test(b.id) || reason.length < 2) throw new ApiError(400, 'insurance_reason');
    await withdrawNoticeFile({ id: b.id, reason, me, requestId });
    return { ok: true };
  }
  throw new ApiError(400, 'invalid_input');
});
