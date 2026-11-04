// 근태 점검 — 담당자 판단 남기기 · 거두기 (결정 급여-69 · 급여-71). 대표자는 열람만(근태 점검 문서 「근태 담당」).
// 판단할 때 보였던 항목 요약(fingerprint)은 화면이 보낸 값을 믿지 않고 서버가 지금 자료로 다시 계산해 남긴다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { collectChecks, loadBreakEarlyLeaveMin, loadEarlyIgnoreAt, loadLateIgnoreAt, loadPatternMinEarly } from '@/lib/attendance-check-data';
import { CHECK_DECISIONS, dayFingerprint, loadCheckReviews, monthFingerprint, releaseCheckReview, reviewState, saveCheckReview, type CheckDecision } from '@/lib/attendance-check-reviews';
import { monthRange } from '@/lib/month-data';
import { loadPeriod } from '@/lib/period-data';
import { requireApprover, requireStaffViewer } from '@/lib/scope';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.attendanceCheck', async (req) => {
  const viewer = await requireStaffViewer();
  if (!viewer || viewer.me.adminLevel === 'ceo') throw new ApiError(403, 'forbidden'); // 대표자는 보기만
  const practice = OFFICE.practiceMode;
  const b = await readJson(req);

  if (b.action === 'release') {
    if (typeof b.id !== 'string' || !UUID.test(b.id) || typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
    await requireApprover(b.employeeId);
    const who = await releaseCheckReview(b.id, practice, viewer.me);
    if (!who || who !== b.employeeId) throw new ApiError(404, 'not_found');
    return { ok: true };
  }

  // 「확인만」(승인이 전부 덮은 날)을 그 직원 그 달 한꺼번에 확인 — 마감 때 목록을 보고 체크하는 것 (급여-69 ④)
  if (b.action === 'confirmAll') {
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || typeof b.month !== 'string' || !/^\d{4}-\d{2}$/.test(b.month)) throw new ApiError(400, 'invalid_input');
    await requireApprover(b.employeeId);
    const { from, to } = monthRange(b.month);
    const data = await loadPeriod(from, to, practice);
    const person = data.people.find((p) => p.id === b.employeeId);
    if (!person) throw new ApiError(404, 'not_found');
    const [c] = collectChecks({ ...data, people: [person] }, from, to, new Date(), await loadEarlyIgnoreAt(), await loadPatternMinEarly(to), await loadBreakEarlyLeaveMin(to), await loadLateIgnoreAt());
    const { handled } = reviewState(c?.days ?? [], c?.monthly ?? [], await loadCheckReviews(from, to, practice, [person.id]));
    let n = 0;
    for (const d of c?.days ?? []) {
      if (d.state !== 'confirm' || handled.has(d.workDate)) continue;
      await saveCheckReview({ employeeId: person.id, workDate: d.workDate, scope: 'day', kind: 'day', decision: 'confirmed', note: null, fingerprint: dayFingerprint(d), practice, me: viewer.me });
      n++;
    }
    return { done: n };
  }

  if (b.action !== 'decide') throw new ApiError(400, 'invalid_input');
  const { employeeId, date, scope, kind, decision } = b as Record<string, unknown>;
  if (typeof employeeId !== 'string' || !UUID.test(employeeId) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'invalid_input');
  if (scope !== 'day' && scope !== 'month') throw new ApiError(400, 'invalid_input');
  if (scope === 'day' ? kind !== 'day' : kind !== 'schedule_check' && kind !== 'early_bundle') throw new ApiError(400, 'invalid_input');
  if (typeof decision !== 'string' || !(CHECK_DECISIONS as readonly string[]).includes(decision)) throw new ApiError(400, 'invalid_input');
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 300) : null;
  if (decision === 'not_late' && !note) throw new ApiError(400, 'reason_required'); // 지각 · 조퇴 아님은 사유가 있어야 한다
  await requireApprover(employeeId);

  const { from, to } = monthRange(date.slice(0, 7));
  const data = await loadPeriod(from, to, practice);
  const person = data.people.find((p) => p.id === employeeId);
  if (!person) throw new ApiError(404, 'not_found');
  const [checks] = collectChecks({ ...data, people: [person] }, from, to, new Date(), await loadEarlyIgnoreAt(), await loadPatternMinEarly(to), await loadBreakEarlyLeaveMin(to), await loadLateIgnoreAt());
  let fingerprint: string;
  if (scope === 'day') {
    const day = checks?.days.find((d) => d.workDate === date);
    if (!day || !day.state) throw new ApiError(409, 'check_gone'); // 그사이 기록이 바뀌어 확인할 것이 없어졌다
    if (day.state === 'block') throw new ApiError(409, 'check_blocked'); // 막음은 판단으로 풀리지 않는다 — 기록을 고치거나 요청을 처리한다
    fingerprint = dayFingerprint(day);
  } else {
    const m = checks?.monthly.find((x) => x.kind === kind);
    if (!m) throw new ApiError(409, 'check_gone');
    fingerprint = monthFingerprint(m);
  }
  await saveCheckReview({ employeeId, workDate: scope === 'month' ? from : date, scope, kind: kind as 'day', decision: decision as CheckDecision, note, fingerprint, practice, me: viewer.me });
  return { ok: true };
});
