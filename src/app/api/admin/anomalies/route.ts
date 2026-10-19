// 근태 이상자 정책 저장 — 유형마다 마감 차단 / 확인 / 끔 (PRD v1.3 A15). 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { validateAnomalyPolicy, validateTaskPolicy } from '@/lib/anomaly';
import { saveTaskPolicy, setOverride } from '@/lib/anomaly-tasks';
import { OFFICE } from '@/config/office';
import { reviewAnomaly, saveAnomalyPolicy, unreviewAnomaly } from '@/lib/anomaly-data';
import { notifyAnomalies } from '@/lib/attendance-notify';
import { isMonth } from '@/lib/close-review';

export const POST = api('admin.anomalies', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (b.action === 'notify') {
    // 이상자 통보 — 그 달에 남은 이상 기록이 있는 직원에게 업무 메시지 (employeeIds가 있으면 그 사람만)
    if (!isMonth(b.month)) throw new ApiError(400, 'invalid_input');
    const ids = Array.isArray(b.employeeIds) ? (b.employeeIds as unknown[]).filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)).slice(0, 300) : undefined;
    return notifyAnomalies({ me, month: b.month, practice: OFFICE.practiceMode && b.live !== true, employeeIds: ids });
  }
  if (b.action === 'review' || b.action === 'unreview') {
    // 「확인만」 유형의 이상 기록을 봤다는 표시. 기록을 고치는 것이 아니다
    if (typeof b.employeeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.employeeId) || typeof b.workDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.workDate)) throw new ApiError(400, 'invalid_input');
    const practice = OFFICE.practiceMode && b.live !== true;
    if (b.action === 'unreview') await unreviewAnomaly({ employeeId: b.employeeId, workDate: b.workDate, practice, me });
    else await reviewAnomaly({ employeeId: b.employeeId, workDate: b.workDate, practice, types: Array.isArray(b.types) ? (b.types as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 12) : [], note: typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 300) : null, me });
    return { ok: true };
  }
  if (b.action === 'taskPolicy') {
    // 담당자 · 처리 기한 기본값 (2026-10-19)
    const p = validateTaskPolicy(b.policy);
    if (!p || typeof b.expectedVersion !== 'number') throw new ApiError(400, 'invalid_input');
    await saveTaskPolicy(p, b.expectedVersion, me);
    return { ok: true };
  }
  if (b.action === 'assign') {
    // 이 건만 담당 · 기한 바꾸기 (DB 0061, 묶음 27). 둘 다 비우면 기본값으로
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || typeof b.workDate !== 'string' || !DAY.test(b.workDate)) throw new ApiError(400, 'invalid_input');
    if (b.assigneeId !== null && !(typeof b.assigneeId === 'string' && UUID.test(b.assigneeId))) throw new ApiError(400, 'invalid_input');
    if (b.dueOn !== null && !(typeof b.dueOn === 'string' && DAY.test(b.dueOn))) throw new ApiError(400, 'invalid_input');
    if (typeof b.dueOn === 'string' && b.dueOn < b.workDate) throw new ApiError(400, 'invalid_due');
    const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 300) : null;
    await setOverride({ employeeId: b.employeeId, workDate: b.workDate, practice: OFFICE.practiceMode && b.live !== true, assigneeId: b.assigneeId as string | null, dueOn: b.dueOn as string | null, note, me });
    return { ok: true };
  }
  const policy = validateAnomalyPolicy(b.policy);
  if (!policy || typeof b.expectedVersion !== 'number') throw new ApiError(400, 'invalid_input');
  await saveAnomalyPolicy(policy, b.expectedVersion, me);
  return { ok: true };
});
