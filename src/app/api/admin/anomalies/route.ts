// 근태 이상자 정책 저장 — 유형마다 마감 차단 / 확인 / 끔 (PRD v1.3 A15). 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { validateAnomalyPolicy } from '@/lib/anomaly';
import { OFFICE } from '@/config/office';
import { reviewAnomaly, saveAnomalyPolicy, unreviewAnomaly } from '@/lib/anomaly-data';

export const POST = api('admin.anomalies', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (b.action === 'review' || b.action === 'unreview') {
    // 「확인만」 유형의 이상 기록을 봤다는 표시. 기록을 고치는 것이 아니다
    if (typeof b.employeeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.employeeId) || typeof b.workDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.workDate)) throw new ApiError(400, 'invalid_input');
    const practice = OFFICE.practiceMode && b.live !== true;
    if (b.action === 'unreview') await unreviewAnomaly({ employeeId: b.employeeId, workDate: b.workDate, practice, me });
    else await reviewAnomaly({ employeeId: b.employeeId, workDate: b.workDate, practice, types: Array.isArray(b.types) ? (b.types as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 12) : [], note: typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 300) : null, me });
    return { ok: true };
  }
  const policy = validateAnomalyPolicy(b.policy);
  if (!policy || typeof b.expectedVersion !== 'number') throw new ApiError(400, 'invalid_input');
  await saveAnomalyPolicy(policy, b.expectedVersion, me);
  return { ok: true };
});
