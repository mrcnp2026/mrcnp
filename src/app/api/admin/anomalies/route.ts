// 근태 이상자 정책 저장 — 유형마다 마감 차단 / 확인 / 끔 (PRD v1.3 A15). 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { validateAnomalyPolicy } from '@/lib/anomaly';
import { saveAnomalyPolicy } from '@/lib/anomaly-data';

export const POST = api('admin.anomalies', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const policy = validateAnomalyPolicy(b.policy);
  if (!policy || typeof b.expectedVersion !== 'number') throw new ApiError(400, 'invalid_input');
  await saveAnomalyPolicy(policy, b.expectedVersion, me);
  return { ok: true };
});
